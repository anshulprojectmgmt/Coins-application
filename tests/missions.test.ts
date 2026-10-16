import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import sharp from "sharp";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createApp } from "../src/server/app.ts";
import { User } from "../src/models/User.ts";
import { Mission } from "../src/models/Mission.ts";
import { Submission } from "../src/models/Submission.ts";
import { Activity } from "../src/models/Activity.ts";
import { purgeExpiredPhotos } from "../src/server/evidence.ts";
import { verifyEvidence } from "../src/server/verify.ts";
import { localDay } from "../src/server/rules.ts";

let db: MongoMemoryReplSet, server: any, base: string, directory: string;
let child: string, parent: string, otherChild: string, otherParent: string;
let childId: string, manual: any, automatic: any, reviewId: string;
let photoIndex = 1,
  verifierCalls = 0;
let blockVerifier: (() => Promise<any>) | null = null;
const secret = "test-secret-that-is-long-enough-for-testing";
const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});
async function request(url: string, token = "", body?: any, method?: string) {
  const res = await fetch(base + url, {
    method: method || (body ? "POST" : "GET"),
    headers: headers(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}
async function photo() {
  const n = photoIndex++;
  const bytes = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: (n * 11) % 255, g: (n * 29) % 255, b: (n * 47) % 255 },
    },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
async function mission(
  title: string,
  verification = "parent",
  proof = "photo",
  points = 10,
) {
  const result = await request("/api/parent/missions", parent, {
    title,
    instructions: "Show the toys put away in the storage bins.",
    points,
    proof,
    verification,
    active: true,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
async function settings(overrides: any = {}) {
  const c = (await request("/api/parent/config", parent)).body;
  const r = await request(
    "/api/parent/config",
    parent,
    { ...c, ...overrides },
    "PATCH",
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

before(
  async () => {
    directory = await mkdtemp(path.join(tmpdir(), "habit-proof-"));
    process.env.EVIDENCE_DIR = directory;
    db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(db.getUri());
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const app = createApp({
      jwtSecret: secret,
      verifier: async (task) => {
        verifierCalls++;
        if (blockVerifier) return blockVerifier();
        if (task.title.includes("Retry"))
          return {
            decision: "retry",
            reason: "Please show the whole storage bin.",
          };
        if (task.title.includes("Unclear"))
          return {
            decision: "review",
            reason: "A parent can help check this one.",
          };
        return { decision: "pass", reason: "The toys are put away." };
      },
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const signup = await request("/api/auth/signup", "", {
      username: "hero",
      password: "child-password",
      parentPassword: "parent-password",
      photoConsent: true,
      timezone: "Asia/Kolkata",
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.body));
    child = signup.body.token;
    childId = signup.body.user._id;
    parent = (
      await request("/api/parent/unlock", child, {
        password: "parent-password",
      })
    ).body.parentToken;
    const other = await request("/api/auth/signup", "", {
      username: "other",
      password: "child-password",
      parentPassword: "parent-password",
      photoConsent: true,
    });
    otherChild = other.body.token;
    otherParent = (
      await request("/api/parent/unlock", otherChild, {
        password: "parent-password",
      })
    ).body.parentToken;
    manual = await mission("Put away toys");
    automatic = await mission("AI tidy toys", "ai", "photo", 15);
  },
  { timeout: 180000 },
);
after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await mongoose.disconnect();
  if (db) await db.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("child cannot manage missions, settings, reviews, or use the former parent password", async () => {
  for (const endpoint of [
    "/api/parent/config",
    "/api/parent/review",
    "/api/parent/missions",
  ])
    assert.equal((await request(endpoint, child)).status, 403);
  assert.equal(
    (await request("/api/parent/missions", child, manual)).status,
    403,
  );
  assert.equal(
    (await request("/api/parent/unlock", child, { password: "pari" })).status,
    403,
  );
  assert.equal(
    (await request("/api/profile/ratio", child, { ratio: 100 }, "PATCH"))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/api/activities", child, {
        type: "earn",
        pointsImpact: 99999,
      })
    ).status,
    403,
  );
  assert.equal((await request("/api/profile", "")).status, 401);
  assert.equal(
    (
      await request(
        "/api/parent/config",
        jwt.sign({ userId: childId, scope: "parent" }, secret, {
          expiresIn: -1,
        }),
      )
    ).status,
    401,
  );
});
test("manual mission saves private proof without awarding coins", async () => {
  const result = await request(
    `/api/missions/${manual._id}/submissions`,
    child,
    { photos: [await photo()], pointsImpact: 9999 },
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.submission.status, "pending");
  assert.equal(result.body.user.total_coins, 0);
  reviewId = result.body.submission._id;
  assert.equal(
    (await request("/api/missions", child)).body.missions.find(
      (m: any) => m._id === manual._id,
    ).submission._id,
    reviewId,
  );
  assert.equal(
    (await request(`/api/parent/evidence/${reviewId}/0`, child)).status,
    403,
  );
  assert.equal(
    (await request(`/api/parent/evidence/${reviewId}/0`, otherParent)).status,
    404,
  );
  const proof = await fetch(`${base}/api/parent/evidence/${reviewId}/0`, {
    headers: headers(parent),
  });
  assert.equal(proof.status, 200);
  assert.match(proof.headers.get("content-type")!, /image\/jpeg/);
  assert.equal(proof.headers.get("cache-control"), "no-store");
  const meta = await sharp(Buffer.from(await proof.arrayBuffer())).metadata();
  assert.equal(meta.exif, undefined);
});
test("parallel parent approvals award coins and surprise progress exactly once", async () => {
  const approvals = await Promise.all([
    request(`/api/parent/review/${reviewId}`, parent, { decision: "approve" }),
    request(`/api/parent/review/${reviewId}`, parent, { decision: "approve" }),
  ]);
  assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 409]);
  const profile = (await request("/api/profile", child)).body;
  assert.equal(profile.total_coins, 10);
  assert.equal(profile.surprise_cycle_points, 10);
  assert.equal(await Activity.countDocuments({ submissionId: reviewId }), 1);
  assert.equal(
    (
      await request(`/api/missions/${manual._id}/submissions`, child, {
        photos: [await photo()],
      })
    ).status,
    409,
  );
});
test("AI requires consent and awards the fixed server-owned mission points", async () => {
  await settings({ ai_consent: true });
  const result = await request(
    `/api/missions/${automatic._id}/submissions`,
    child,
    { photos: [await photo()], points: 9000 },
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.submission.status, "approved");
  assert.equal(result.body.user.total_coins, 25);
  assert.equal(result.body.user.surprise_cycle_points, 25);
  assert.equal(verifierCalls, 1);
});
test("AI consent off routes an AI mission to review without calling the provider", async () => {
  await settings({ ai_consent: false });
  const m = await mission("AI without consent", "ai");
  const result = await request(`/api/missions/${m._id}/submissions`, child, {
    photos: [await photo()],
  });
  assert.equal(result.body.submission.status, "pending");
  assert.equal(verifierCalls, 1);
  await settings({ ai_consent: true });
});
test("reused evidence, invalid files and missing before/after photos are rejected", async () => {
  const first = await mission("First photo"),
    second = await mission("Another mission"),
    paired = await mission("Two photos", "parent", "before_after");
  const shared = await photo();
  assert.equal(
    (
      await request(`/api/missions/${first._id}/submissions`, child, {
        photos: [shared],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(`/api/missions/${second._id}/submissions`, child, {
        photos: [shared],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/missions/${second._id}/submissions`, child, {
        photos: ["data:image/png;base64,YmFk"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/missions/${paired._id}/submissions`, child, {
        photos: [await photo()],
      })
    ).status,
    400,
  );
  const same = await photo();
  assert.equal(
    (
      await request(`/api/missions/${paired._id}/submissions`, child, {
        photos: [same, same],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/missions/${paired._id}/submissions`, child, {
        photos: [await photo(), await photo()],
      })
    ).status,
    201,
  );
});
test("parallel submissions create only one claim for the day", async () => {
  const m = await mission("Concurrent mission", "ai");
  const results = await Promise.all([
    request(`/api/missions/${m._id}/submissions`, child, {
      photos: [await photo()],
    }),
    request(`/api/missions/${m._id}/submissions`, child, {
      photos: [await photo()],
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await Submission.countDocuments({ missionId: m._id }), 1);
});
test("unclear evidence goes to review; retakes stop after three attempts", async () => {
  const unclear = await mission("Unclear task", "ai");
  assert.equal(
    (
      await request(`/api/missions/${unclear._id}/submissions`, child, {
        photos: [await photo()],
      })
    ).body.submission.status,
    "pending",
  );
  const retry = await mission("Retry task", "ai");
  for (let i = 1; i <= 3; i++) {
    const result = await request(
      `/api/missions/${retry._id}/submissions`,
      child,
      { photos: [await photo()] },
    );
    assert.equal(result.status, 201);
    assert.equal(result.body.submission.status, i === 3 ? "pending" : "retry");
    assert.equal(result.body.submission.attempts, i);
  }
  assert.equal(
    (
      await request(`/api/missions/${retry._id}/submissions`, child, {
        photos: [await photo()],
      })
    ).status,
    409,
  );
});
test("mission edits do not change the reward for already-submitted work", async () => {
  const m = await mission("Snapshot task", "parent", "photo", 7);
  const s = (
    await request(`/api/missions/${m._id}/submissions`, child, {
      photos: [await photo()],
    })
  ).body.submission;
  assert.equal(
    (
      await request(
        `/api/parent/missions/${m._id}`,
        parent,
        { ...m, points: 100 },
        "PATCH",
      )
    ).status,
    200,
  );
  await request(`/api/parent/review/${s._id}`, parent, { decision: "approve" });
  assert.equal(
    (await Activity.findOne({ submissionId: s._id }))!.pointsImpact,
    7,
  );
});
test("rejected work cannot earn coins or be submitted again that day", async () => {
  const m = await mission("Parent rejects task");
  const s = (
    await request(`/api/missions/${m._id}/submissions`, child, {
      photos: [await photo()],
    })
  ).body.submission;
  assert.equal(
    (
      await request(`/api/parent/review/${s._id}`, parent, {
        decision: "reject",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/parent/review/${s._id}`, parent, {
        decision: "approve",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/missions/${m._id}/submissions`, child, {
        photos: [await photo()],
      })
    ).status,
    409,
  );
});
test("another family cannot change or submit this family’s missions", async () => {
  assert.equal(
    (
      await request(
        `/api/parent/missions/${manual._id}`,
        otherParent,
        { ...manual, points: 99 },
        "PATCH",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/missions/${manual._id}/submissions`, otherChild, {
        photos: [await photo()],
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/parent/review/${reviewId}`, otherParent, {
        decision: "approve",
      })
    ).status,
    409,
  );
});
test("spending ignores client prices, is idempotent and cannot overdraw the wallet", async () => {
  await settings({ min_per_coin_ratio: 2 });
  const before = (await request("/api/profile", child)).body;
  const requestId = randomUUID();
  const spend = await request("/api/activities", child, {
    type: "spend",
    activityName: "Puzzle Quest",
    durationMinutes: 5,
    pointsImpact: 1000,
    requestId,
  });
  assert.equal(spend.status, 200);
  assert.equal(spend.body.pointsImpact, -10);
  const duplicate = await request("/api/activities", child, {
    type: "spend",
    activityName: "Puzzle Quest",
    durationMinutes: 5,
    requestId,
  });
  assert.equal(duplicate.body._id, spend.body._id);
  const after = (await request("/api/profile", child)).body;
  assert.equal(after.total_coins, before.total_coins - 10);
  assert.equal(after.surprise_cycle_points, before.surprise_cycle_points);
  await User.updateOne({ _id: childId }, { $set: { total_coins: 10 } });
  const attempts = await Promise.all(
    [1, 2].map(() =>
      request("/api/activities", child, {
        type: "spend",
        activityName: "Puzzle Quest",
        durationMinutes: 5,
        requestId: randomUUID(),
      }),
    ),
  );
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 400]);
  assert.equal((await request("/api/profile", child)).body.total_coins, 0);
  assert.equal(
    (
      await request("/api/activities", child, {
        type: "spend",
        activityName: "Unapproved reward",
        durationMinutes: 1,
        requestId: randomUUID(),
      })
    ).status,
    400,
  );
});
test("surprise remains secret until earned and claiming preserves wallet and overflow", async () => {
  await settings({
    surprise_goal_points: 30,
    surprise_reward_name: "A new board game",
  });
  assert.equal(
    (await request("/api/profile", child)).body.surprise_reward_name,
    "Mystery Surprise",
  );
  await User.updateOne(
    { _id: childId },
    { $set: { surprise_cycle_points: 35, total_coins: 5 } },
  );
  const claims = await Promise.all([
    request("/api/profile/claim-surprise", child, {}),
    request("/api/profile/claim-surprise", child, {}),
  ]);
  assert.deepEqual(claims.map((r) => r.status).sort(), [200, 400]);
  const ok = claims.find((r) => r.status === 200)!;
  assert.equal(ok.body.rewardName, "A new board game");
  assert.equal(ok.body.user.total_coins, 5);
  assert.equal(ok.body.user.surprise_cycle_points, 5);
});
test("stale checks recover to the parent inbox and photo expiry is enforced", async () => {
  const m = await mission("Stale check");
  const s = (
    await request(`/api/missions/${m._id}/submissions`, child, {
      photos: [await photo()],
    })
  ).body.submission;
  await Submission.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(s._id) },
    {
      $set: {
        status: "checking",
        updatedAt: new Date(Date.now() - 180000),
        evidenceExpiresAt: new Date(Date.now() - 1),
      },
    },
  );
  await request("/api/missions", child);
  assert.equal((await Submission.findById(s._id))!.status, "pending");
  assert.equal(
    (await request(`/api/parent/evidence/${s._id}/0`, parent)).status,
    404,
  );
  const files = await readdir(directory);
  const old = path.join(directory, files[0]);
  await utimes(old, 0, 0);
  await purgeExpiredPhotos();
  assert.equal((await readdir(directory)).includes(files[0]), false);
});
test("consent revocation during AI checking blocks awards and deletes private proof", async () => {
  const m = await mission("Consent race", "ai");
  let started!: () => void, release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  blockVerifier = async () => {
    started();
    await gate;
    return { decision: "pass", reason: "Completed." };
  };
  const pending = request(`/api/missions/${m._id}/submissions`, child, {
    photos: [await photo()],
  });
  await waiting;
  const before = (await request("/api/profile", child)).body;
  await settings({ photo_consent: false, ai_consent: false });
  release();
  const result = await pending;
  blockVerifier = null;
  assert.equal(result.body.submission.status, "pending");
  assert.equal(result.body.user.total_coins, before.total_coins);
  assert.equal((await readdir(directory)).length, 0);
  assert.equal(
    (
      await request(`/api/missions/${m._id}/submissions`, child, {
        photos: [await photo()],
      })
    ).status,
    403,
  );
});
test("existing accounts retain coins and surprise progress through one-time parent setup", async () => {
  const user = await User.create({
    username: "legacy",
    password: await bcrypt.hash("old-password", 4),
    total_coins: 120,
    surprise_cycle_start_points: 20,
  });
  await User.collection.updateOne(
    { _id: user._id },
    { $unset: { surprise_cycle_points: "", parent_password: "" } },
  );
  const loggedIn = await request("/api/auth/login", "", {
    username: "legacy",
    password: "old-password",
  });
  assert.equal(loggedIn.body.user.parent_setup, false);
  assert.equal(loggedIn.body.user.surprise_cycle_points, 100);
  const setup = await request("/api/parent/setup", loggedIn.body.token, {
    accountPassword: "old-password",
    parentPassword: "new-parent-password",
    photoConsent: true,
    timezone: "UTC",
  });
  assert.equal(setup.status, 200, JSON.stringify(setup.body));
  assert.equal(setup.body.user.total_coins, 120);
  assert.equal(setup.body.user.parent_setup, true);
  assert.equal(
    (await request("/api/missions", loggedIn.body.token)).body.missions.length,
    3,
  );
  assert.equal(
    (
      await request("/api/parent/setup", loggedIn.body.token, {
        accountPassword: "old-password",
        parentPassword: "another-parent-password",
        photoConsent: true,
      })
    ).status,
    409,
  );
});
test("provider outage or missing API key always requests parent review", async () => {
  const prior = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.equal(
    (
      await verifyEvidence({
        title: "Task",
        instructions: "Check toys",
        proof: "photo",
        evidence: [],
      })
    ).decision,
    "review",
  );
  process.env.OPENAI_API_KEY = "not-a-real-key";
  // No evidence files to send and provider access is replaced: no external call or charge.
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Provider unavailable");
  };
  try {
    assert.equal(
      (
        await verifyEvidence({
          title: "Task",
          instructions: "Check toys",
          proof: "photo",
          evidence: [],
        })
      ).decision,
      "review",
    );
  } finally {
    globalThis.fetch = savedFetch;
    if (prior) process.env.OPENAI_API_KEY = prior;
    else delete process.env.OPENAI_API_KEY;
  }
});
test("mission day follows the family time zone at the midnight boundary", () => {
  const now = new Date("2026-10-14T20:00:00Z");
  assert.equal(localDay("UTC", now), "2026-10-14");
  assert.equal(localDay("Asia/Kolkata", now), "2026-10-15");
});
