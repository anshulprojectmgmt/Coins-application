import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import sharp from "sharp";
import { createApp } from "../src/server/app.ts";
import {
  savePhotos,
  readPhoto,
  deletePhotos,
  purgeExpiredPhotos,
  RETENTION_MS,
} from "../src/server/evidence.ts";

let database: MongoMemoryReplSet,
  server: any,
  base: string,
  token: string,
  parent: string;
const request = async (url: string, auth = "", body?: any, method?: string) => {
  const res = await fetch(base + url, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};
before(async () => {
  process.env.EVIDENCE_STORAGE = "mongodb";
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = createApp({
    jwtSecret: "gridfs-test-secret-not-for-production-123456",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const signup = await request("/api/auth/signup", "", {
    username: "gridfs-hero",
    password: "child-password",
    parentPassword: "parent-password",
    photoConsent: true,
  });
  assert.equal(signup.status, 201);
  token = signup.body.token;
  parent = (
    await request("/api/parent/unlock", token, { password: "parent-password" })
  ).body.parentToken;
});
after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await mongoose.disconnect();
  if (database) await database.stop();
});

test("MongoDB evidence spans chunks and survives a fresh database connection", async () => {
  const bytes = Buffer.alloc(300000, 42);
  const [id] = await savePhotos([{ buffer: bytes }]);
  assert.deepEqual(await readPhoto(id), bytes);
  await mongoose.disconnect();
  await mongoose.connect(database.getUri());
  assert.deepEqual(await readPhoto(id), bytes);
  await deletePhotos([id]);
  await assert.rejects(() => readPhoto(id));
  assert.equal(
    await mongoose.connection
      .db!.collection("habit_evidence.chunks")
      .countDocuments(),
    0,
  );
});

test("GridFS expiry deletes expired files and chunks, including interrupted uploads", async () => {
  const [id] = await savePhotos([{ buffer: Buffer.from("expired evidence") }]);
  const files = mongoose.connection.db!.collection("habit_evidence.files");
  await files.updateOne(
    { filename: id },
    { $set: { "metadata.expiresAt": new Date(Date.now() - 1) } },
  );
  await assert.rejects(() => readPhoto(id));
  const oldId = mongoose.mongo.ObjectId.createFromTime(
    Math.floor((Date.now() - RETENTION_MS - 10000) / 1000),
  );
  await mongoose.connection
    .db!.collection("habit_evidence.chunks")
    .insertOne({
      files_id: oldId,
      n: 0,
      data: Buffer.from("unfinished private upload"),
    });
  await purgeExpiredPhotos();
  assert.equal(await files.countDocuments(), 0);
  assert.equal(
    await mongoose.connection
      .db!.collection("habit_evidence.chunks")
      .countDocuments(),
    0,
  );
});

test("MongoDB-backed proof stays parent-private and is deleted when consent is revoked", async () => {
  const m = await request("/api/parent/missions", parent, {
    title: "GridFS mission",
    instructions: "Show the completed worksheet clearly.",
    points: 10,
    proof: "photo",
    verification: "parent",
    active: true,
  });
  assert.equal(m.status, 201);
  const bytes = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#facade" },
  })
    .png()
    .toBuffer();
  const submission = await request(
    `/api/missions/${m.body._id}/submissions`,
    token,
    { photos: [`data:image/png;base64,${bytes.toString("base64")}`] },
  );
  assert.equal(submission.status, 201, JSON.stringify(submission.body));
  const url = `/api/parent/evidence/${submission.body.submission._id}/0`;
  assert.equal((await request(url, token)).status, 403);
  const response = await fetch(base + url, {
    headers: { Authorization: `Bearer ${parent}` },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /image\/jpeg/);
  assert.equal(
    await mongoose.connection
      .db!.collection("habit_evidence.files")
      .countDocuments(),
    1,
  );
  const config = (await request("/api/parent/config", parent)).body;
  assert.equal(
    (
      await request(
        "/api/parent/config",
        parent,
        { ...config, photo_consent: false },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    await mongoose.connection
      .db!.collection("habit_evidence.files")
      .countDocuments(),
    0,
  );
  assert.equal(
    await mongoose.connection
      .db!.collection("habit_evidence.chunks")
      .countDocuments(),
    0,
  );
  assert.equal((await request(url, parent)).status, 404);
});

test("health endpoint reflects the database connection without exposing secrets", async () => {
  assert.deepEqual((await request("/healthz")).body, { status: "ok" });
  await mongoose.disconnect();
  assert.equal((await request("/healthz")).status, 503);
  await mongoose.connect(database.getUri());
  assert.equal((await request("/healthz")).status, 200);
});
