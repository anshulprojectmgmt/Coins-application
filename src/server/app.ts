import express from "express";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "../models/User.ts";
import { Activity } from "../models/Activity.ts";
import { Mission, starterMissions } from "../models/Mission.ts";
import { Submission, EvidenceHash } from "../models/Submission.ts";
import {
  ApiError,
  integer,
  text,
  passwordValue,
  timeZone,
  localDay,
  DEFAULT_REWARDS,
} from "./rules.ts";
import {
  normalizePhoto,
  savePhotos,
  deletePhotos,
  readPhoto,
  RETENTION_MS,
} from "./evidence.ts";
import { verifyEvidence, type Verdict, type ProofTask } from "./verify.ts";

const route =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res)).catch(next);
const objectId = (id: string) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "Not found.");
  return id;
};

export function serializeUser(u: any) {
  return {
    _id: u._id,
    username: u.username,
    total_coins: u.total_coins || 0,
    min_per_coin_ratio: u.min_per_coin_ratio || 1,
    custom_play_activities: u.custom_play_activities || [],
    surprise_goal_points: u.surprise_goal_points || 500,
    surprise_reward_name: "Mystery Surprise",
    surprise_cycle_start_points: u.surprise_cycle_start_points || 0,
    surprise_cycle_points:
      u.surprise_cycle_points ??
      Math.max(0, u.total_coins - (u.surprise_cycle_start_points || 0)),
    parent_setup: !!u.parent_password,
    photo_consent: !!u.photo_consent,
    ai_consent: !!u.ai_consent,
    timezone: u.timezone || "UTC",
  };
}
function publicSubmission(s: any) {
  return {
    _id: s._id,
    missionId: s.missionId,
    title: s.title,
    points: s.points,
    day: s.day,
    status: s.status,
    message: s.message,
    attempts: s.attempts,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    evidenceCount: s.evidence.length,
    evidenceExpiresAt: s.evidenceExpiresAt,
    reviewedBy: s.reviewedBy,
  };
}
export async function approveSubmission(
  id: string,
  userId: string,
  reviewer: "parent" | "ai",
) {
  let changed = false;
  await mongoose.connection.transaction(async (session) => {
    changed = false;
    if (
      reviewer === "ai" &&
      !(await User.exists({
        _id: userId,
        photo_consent: true,
        ai_consent: true,
      }).session(session))
    )
      return;
    const s: any = await Submission.findOneAndUpdate(
      {
        _id: id,
        userId,
        status: {
          $in:
            reviewer === "ai" ? ["checking"] : ["pending", "checking", "retry"],
        },
      },
      {
        $set: {
          status: "approved",
          message: "Great job! Your coins are in your chest.",
          reviewedBy: reviewer,
          reviewedAt: new Date(),
        },
      },
      { session, returnDocument: "after" },
    );
    if (!s) return;
    await User.updateOne(
      { _id: userId },
      { $inc: { total_coins: s.points, surprise_cycle_points: s.points } },
      { session },
    );
    await Activity.create(
      [
        {
          userId,
          type: "earn",
          activityName: s.title,
          durationMinutes: 0,
          pointsImpact: s.points,
          submissionId: s._id,
        },
      ],
      { session, ordered: true },
    );
    changed = true;
  });
  return changed;
}
export function createApp(options: {
  jwtSecret: string;
  verifier?: (task: ProofTask) => Promise<Verdict>;
}) {
  const app = express();
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5)
    throw new Error("TRUST_PROXY_HOPS must be a whole number from 0 to 5.");
  if (proxyHops) app.set("trust proxy", proxyHops);
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({
        status: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
      }),
  );
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use("/api", express.json({ limit: "13mb" }));
  const tokenFor = (id: any, scope: "child" | "parent") =>
    jwt.sign({ userId: String(id), scope }, options.jwtSecret, {
      expiresIn: scope === "parent" ? "15m" : "7d",
    });
  const auth = async (req: any, _res: any, next: any) => {
    try {
      const claims: any = jwt.verify(
        req.headers.authorization?.replace(/^Bearer /, "") || "",
        options.jwtSecret,
      );
      req.user = await User.findById(claims.userId).select("+parent_password");
      if (!req.user) throw new Error();
      if (req.user.$isDefault("surprise_cycle_points")) {
        await User.updateOne(
          { _id: req.user._id, surprise_cycle_points: { $exists: false } },
          {
            $set: {
              surprise_cycle_points: Math.max(
                0,
                req.user.total_coins -
                  (req.user.surprise_cycle_start_points || 0),
              ),
            },
          },
        );
        req.user = await User.findById(claims.userId).select(
          "+parent_password",
        );
      }
      req.scope = claims.scope || "child";
      next();
    } catch {
      next(new ApiError(401, "Please sign in again."));
    }
  };
  const parent = (req: any, _res: any, next: any) =>
    req.scope === "parent"
      ? next()
      : next(new ApiError(403, "A parent needs to unlock these controls."));
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in 15 minutes." },
  });
  const proofLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 30,
    keyGenerator: (req) => String((req as any).user._id),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Please take a break and try again in an hour." },
  });

  app.post(
    "/api/auth/signup",
    authLimiter,
    route(async (req, res) => {
      const username = text(req.body.username, 3, 40, "Username");
      const password = passwordValue(
        req.body.password,
        "Child sign-in password",
      );
      const parentPassword = passwordValue(
        req.body.parentPassword,
        "Parent password",
      );
      if (password === parentPassword)
        throw new ApiError(400, "Use a separate password for parent controls.");
      if (req.body.photoConsent !== true)
        throw new ApiError(
          400,
          "A parent must consent to private photo submissions.",
        );
      const zone = timeZone(req.body.timezone || "UTC");
      const hashed = await bcrypt.hash(password, 12),
        parentHashed = await bcrypt.hash(parentPassword, 12);
      let user: any;
      await mongoose.connection.transaction(async (session) => {
        [user] = await User.create(
          [
            {
              username,
              password: hashed,
              parent_password: parentHashed,
              photo_consent: true,
              timezone: zone,
            },
          ],
          { session, ordered: true },
        );
        await Mission.create(
          starterMissions.map((m) => ({ ...m, userId: user._id })),
          { session, ordered: true },
        );
      });
      res.status(201).json({
        user: serializeUser(user),
        token: tokenFor(user._id, "child"),
      });
    }),
  );
  app.post(
    "/api/auth/login",
    authLimiter,
    route(async (req, res) => {
      const user: any = await User.findOne({
        username: text(req.body.username, 1, 40, "Username"),
      }).select("+parent_password");
      if (
        typeof req.body.password !== "string" ||
        !user ||
        !(await bcrypt.compare(req.body.password, user.password))
      )
        throw new ApiError(401, "Invalid username or password.");
      await User.updateOne(
        { _id: user._id, surprise_cycle_points: { $exists: false } },
        {
          $set: {
            surprise_cycle_points: Math.max(
              0,
              user.total_coins - (user.surprise_cycle_start_points || 0),
            ),
          },
        },
      );
      res.json({
        user: serializeUser(
          await User.findById(user._id).select("+parent_password"),
        ),
        token: tokenFor(user._id, "child"),
      });
    }),
  );
  app.get(
    "/api/profile",
    auth,
    route(async (req, res) => res.json(serializeUser(req.user))),
  );
  app.post(
    "/api/parent/setup",
    authLimiter,
    auth,
    route(async (req, res) => {
      if (req.user.parent_password)
        throw new ApiError(409, "Parent controls are already set up.");
      if (
        typeof req.body.accountPassword !== "string" ||
        !(await bcrypt.compare(req.body.accountPassword, req.user.password))
      )
        throw new ApiError(
          403,
          "Enter the current account password to set up parent controls.",
        );
      const password = passwordValue(
        req.body.parentPassword,
        "Parent password",
      );
      if (await bcrypt.compare(password, req.user.password))
        throw new ApiError(
          400,
          "Choose a separate password that your child does not use to sign in.",
        );
      if (req.body.photoConsent !== true)
        throw new ApiError(
          400,
          "A parent must consent to private photo submissions.",
        );
      const hashed = await bcrypt.hash(password, 12),
        zone = timeZone(req.body.timezone || "UTC");
      await mongoose.connection.transaction(async (session) => {
        const updated = await User.updateOne(
          { _id: req.user._id, parent_password: { $exists: false } },
          {
            $set: {
              parent_password: hashed,
              photo_consent: true,
              timezone: zone,
            },
          },
          { session },
        );
        if (!updated.modifiedCount)
          throw new ApiError(409, "Parent controls are already set up.");
        if (!(await Mission.exists({ userId: req.user._id }).session(session)))
          await Mission.create(
            starterMissions.map((m) => ({ ...m, userId: req.user._id })),
            { session, ordered: true },
          );
      });
      res.json({
        parentToken: tokenFor(req.user._id, "parent"),
        user: serializeUser(
          await User.findById(req.user._id).select("+parent_password"),
        ),
      });
    }),
  );
  app.post(
    "/api/parent/unlock",
    authLimiter,
    auth,
    route(async (req, res) => {
      if (
        !req.user.parent_password ||
        typeof req.body.password !== "string" ||
        !(await bcrypt.compare(req.body.password, req.user.parent_password))
      )
        throw new ApiError(403, "Incorrect parent password.");
      res.json({ parentToken: tokenFor(req.user._id, "parent") });
    }),
  );
  app.get(
    "/api/parent/config",
    auth,
    parent,
    route(async (req, res) =>
      res.json({
        surprise_goal_points: req.user.surprise_goal_points,
        surprise_reward_name: req.user.surprise_reward_name,
        min_per_coin_ratio: req.user.min_per_coin_ratio,
        custom_play_activities: req.user.custom_play_activities,
        timezone: req.user.timezone,
        photo_consent: req.user.photo_consent,
        ai_consent: req.user.ai_consent,
        aiAvailable: !!process.env.OPENAI_API_KEY,
      }),
    ),
  );
  app.get(
    "/api/parent/summary",
    auth,
    parent,
    route(async (req, res) => {
      const rows: any[] = await Submission.find({
        userId: req.user._id,
        createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
      });
      const approved = rows.filter((s) => s.status === "approved");
      res.json({
        completed: approved.length,
        earned: approved.reduce((sum, s) => sum + s.points, 0),
        pending: rows.filter((s) =>
          ["pending", "checking", "retry"].includes(s.status),
        ).length,
      });
    }),
  );
  app.patch(
    "/api/parent/config",
    auth,
    parent,
    route(async (req, res) => {
      const b = req.body;
      if (
        typeof b.photo_consent !== "boolean" ||
        typeof b.ai_consent !== "boolean"
      )
        throw new ApiError(400, "Choose photo and AI permissions.");
      if (
        !Array.isArray(b.custom_play_activities) ||
        b.custom_play_activities.length > 10
      )
        throw new ApiError(400, "Choose up to 10 custom rewards.");
      const rewards = [
        ...new Set(
          b.custom_play_activities.map((s: any) =>
            text(s, 1, 60, "Reward name"),
          ),
        ),
      ];
      await User.updateOne(
        { _id: req.user._id },
        {
          $set: {
            surprise_goal_points: integer(
              b.surprise_goal_points,
              1,
              100000,
              "Surprise goal",
            ),
            surprise_reward_name: text(
              b.surprise_reward_name,
              1,
              100,
              "Surprise reward",
            ),
            min_per_coin_ratio: integer(
              b.min_per_coin_ratio,
              1,
              10,
              "Coins per reward minute",
            ),
            custom_play_activities: rewards,
            timezone: timeZone(b.timezone),
            photo_consent: b.photo_consent,
            ai_consent: b.ai_consent,
          },
        },
      );
      if (!b.photo_consent) {
        const rows: any[] = await Submission.find({
          userId: req.user._id,
          "evidence.0": { $exists: true },
        });
        await deletePhotos(rows.flatMap((s) => s.evidence));
        await Submission.updateMany(
          { userId: req.user._id },
          { $set: { evidence: [] } },
        );
      }
      res.json({
        user: serializeUser(
          await User.findById(req.user._id).select("+parent_password"),
        ),
      });
    }),
  );
  function missionRules(b: any) {
    if (
      !["photo", "before_after"].includes(b.proof) ||
      !["parent", "ai"].includes(b.verification) ||
      typeof b.active !== "boolean"
    )
      throw new ApiError(
        400,
        "Choose the proof, checking method and active state.",
      );
    return {
      title: text(b.title, 1, 80, "Mission title"),
      instructions: text(b.instructions, 10, 600, "Photo instructions"),
      points: integer(b.points, 1, 100, "Coins"),
      proof: b.proof,
      verification: b.verification,
      active: b.active,
    };
  }
  app.get(
    "/api/parent/missions",
    auth,
    parent,
    route(async (req, res) =>
      res.json(
        await Mission.find({ userId: req.user._id }).sort({ createdAt: 1 }),
      ),
    ),
  );
  app.post(
    "/api/parent/missions",
    auth,
    parent,
    route(async (req, res) => {
      if ((await Mission.countDocuments({ userId: req.user._id })) >= 20)
        throw new ApiError(
          400,
          "You can have up to 20 missions. Edit an existing mission instead.",
        );
      res.status(201).json(
        await Mission.create({
          ...missionRules(req.body),
          userId: req.user._id,
        }),
      );
    }),
  );
  app.patch(
    "/api/parent/missions/:id",
    auth,
    parent,
    route(async (req, res) => {
      const m = await Mission.findOneAndUpdate(
        { _id: objectId(req.params.id), userId: req.user._id },
        { $set: missionRules(req.body) },
        { returnDocument: "after" },
      );
      if (!m) throw new ApiError(404, "Mission not found.");
      res.json(m);
    }),
  );
  async function recoverChecks(userId: any) {
    await Submission.updateMany(
      {
        userId,
        status: "checking",
        updatedAt: { $lt: new Date(Date.now() - 120_000) },
      },
      {
        $set: {
          status: "pending",
          message: "Your photo is saved for a parent to check.",
        },
      },
    );
  }
  app.get(
    "/api/missions",
    auth,
    route(async (req, res) => {
      await recoverChecks(req.user._id);
      const day = localDay(req.user.timezone || "UTC");
      const missions = await Mission.find({
        userId: req.user._id,
        active: true,
      }).sort({ createdAt: 1 });
      const rows: any[] = await Submission.find({ userId: req.user._id, day });
      res.json({
        day,
        missions: missions.map((m: any) => {
          const s = rows.find((s) => String(s.missionId) === String(m._id));
          return {
            ...m.toObject(),
            submission: s ? publicSubmission(s) : null,
          };
        }),
      });
    }),
  );
  app.get(
    "/api/submissions",
    auth,
    route(async (req, res) => {
      await recoverChecks(req.user._id);
      res.json(
        (
          await Submission.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(30)
        ).map(publicSubmission),
      );
    }),
  );
  app.post(
    "/api/missions/:id/submissions",
    auth,
    proofLimiter,
    route(async (req, res) => {
      if (!req.user.photo_consent)
        throw new ApiError(
          403,
          "Ask a parent to set up private photo missions first.",
        );
      const m: any = await Mission.findOne({
        _id: objectId(req.params.id),
        userId: req.user._id,
        active: true,
      });
      if (!m) throw new ApiError(404, "Mission not found.");
      const needed = m.proof === "before_after" ? 2 : 1;
      if (!Array.isArray(req.body.photos) || req.body.photos.length !== needed)
        throw new ApiError(
          400,
          `This mission needs ${needed} photo${needed > 1 ? "s (before, then after)" : ""}.`,
        );
      const photos = await Promise.all(req.body.photos.map(normalizePhoto));
      if (new Set(photos.map((p) => p.hash)).size !== photos.length)
        throw new ApiError(400, "Use different photos for before and after.");
      const evidence = await savePhotos(photos);
      let submission: any,
        previousEvidence: string[] = [];
      try {
        await mongoose.connection.transaction(async (session) => {
          // Serialize uploads against consent revocation so no photos can be committed after it.
          const consent = await User.updateOne(
            { _id: req.user._id, photo_consent: true },
            { $inc: { evidence_revision: 1 } },
            { session },
          );
          if (!consent.modifiedCount)
            throw new ApiError(
              403,
              "Photo submissions are disabled. Ask a parent for help.",
            );
          const day = localDay(req.user.timezone || "UTC");
          const old: any = await Submission.findOne({
            userId: req.user._id,
            missionId: m._id,
            day,
          }).session(session);
          if (old && (old.status !== "retry" || old.attempts >= 3))
            throw new ApiError(
              409,
              old.status === "approved"
                ? "You already earned coins for this mission today!"
                : "Your submission is already saved. A parent can check it.",
            );
          await EvidenceHash.create(
            photos.map((p) => ({ userId: req.user._id, hash: p.hash })),
            { session, ordered: true },
          );
          const data = {
            title: m.title,
            instructions: m.instructions,
            points: m.points,
            proof: m.proof,
            status: "checking" as const,
            message: "Checking your photo…",
            evidence,
            evidenceExpiresAt: new Date(Date.now() + RETENTION_MS),
            reviewedBy: null,
            reviewedAt: null,
          };
          if (old) {
            previousEvidence = old.evidence;
            submission = await Submission.findOneAndUpdate(
              { _id: old._id, status: "retry" },
              { $set: data, $inc: { attempts: 1 } },
              { session, returnDocument: "after" },
            );
          } else
            [submission] = await Submission.create(
              [{ ...data, userId: req.user._id, missionId: m._id, day }],
              { session, ordered: true },
            );
        });
      } catch (error: any) {
        await deletePhotos(evidence);
        if (error.code === 11000)
          throw new ApiError(
            409,
            "This mission or photo was already submitted. Use fresh photos for each mission.",
          );
        throw error;
      }
      await deletePhotos(previousEvidence);
      const permission: any = await User.findById(req.user._id);
      const verdict =
        m.verification === "ai" &&
        permission.ai_consent &&
        permission.photo_consent
          ? await (options.verifier || verifyEvidence)(submission)
          : {
              decision: "review",
              reason: "Your photo is ready for a parent to check.",
            };
      const current: any = await User.findById(req.user._id);
      const awarded =
        verdict.decision === "pass" &&
        current.ai_consent &&
        current.photo_consent &&
        (await approveSubmission(
          String(submission._id),
          String(req.user._id),
          "ai",
        ));
      if (!awarded)
        await Submission.updateOne(
          { _id: submission._id, status: "checking" },
          {
            $set: {
              status:
                verdict.decision === "retry" &&
                submission.attempts < 3 &&
                current.photo_consent
                  ? "retry"
                  : "pending",
              message:
                verdict.decision === "pass"
                  ? "Your photo is ready for a parent to check."
                  : verdict.reason,
            },
          },
        );
      res.status(201).json({
        submission: publicSubmission(await Submission.findById(submission._id)),
        user: serializeUser(
          await User.findById(req.user._id).select("+parent_password"),
        ),
      });
    }),
  );
  app.get(
    "/api/parent/review",
    auth,
    parent,
    route(async (req, res) => {
      await recoverChecks(req.user._id);
      const rows = await Submission.find({
        userId: req.user._id,
        status: { $in: ["pending", "checking", "retry"] },
      })
        .sort({ createdAt: 1 })
        .limit(100);
      res.json(
        rows.map((s: any) => ({
          ...publicSubmission(s),
          instructions: s.instructions,
          proof: s.proof,
        })),
      );
    }),
  );
  app.get(
    "/api/parent/evidence/:id/:index",
    auth,
    parent,
    route(async (req, res) => {
      const s: any = await Submission.findOne({
        _id: objectId(req.params.id),
        userId: req.user._id,
      });
      const index = Number(req.params.index);
      if (
        !s ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= s.evidence.length ||
        s.evidenceExpiresAt <= new Date()
      )
        throw new ApiError(404, "This photo has expired or was deleted.");
      try {
        res.type("jpeg").send(await readPhoto(s.evidence[index]));
      } catch {
        throw new ApiError(404, "This photo is no longer available.");
      }
    }),
  );
  app.post(
    "/api/parent/review/:id",
    auth,
    parent,
    route(async (req, res) => {
      const id = objectId(req.params.id);
      if (req.body.decision === "approve") {
        if (!(await approveSubmission(id, String(req.user._id), "parent")))
          throw new ApiError(
            409,
            "This submission was already reviewed or is unavailable.",
          );
      } else if (req.body.decision === "reject") {
        const result = await Submission.updateOne(
          {
            _id: id,
            userId: req.user._id,
            status: { $in: ["checking", "pending", "retry"] },
          },
          {
            $set: {
              status: "rejected",
              message: text(
                req.body.message ||
                  "Please try this mission again tomorrow. Ask your parent for help.",
                1,
                240,
                "Message",
              ),
              reviewedBy: "parent",
              reviewedAt: new Date(),
            },
          },
        );
        if (!result.modifiedCount)
          throw new ApiError(
            409,
            "This submission was already reviewed or is unavailable.",
          );
      } else throw new ApiError(400, "Choose approve or reject.");
      res.json({
        user: serializeUser(
          await User.findById(req.user._id).select("+parent_password"),
        ),
      });
    }),
  );
  // Close manual earning; reward costs are calculated only from parent-owned settings.
  app.post(
    "/api/activities",
    auth,
    route(async (req, res) => {
      if (req.body.type !== "spend")
        throw new ApiError(403, "Earn coins by completing a mission.");
      const name = text(req.body.activityName, 1, 60, "Reward");
      if (
        ![...DEFAULT_REWARDS, ...req.user.custom_play_activities].includes(name)
      )
        throw new ApiError(400, "Ask a parent to add that reward first.");
      const duration = integer(
          req.body.durationMinutes,
          1,
          120,
          "Reward minutes",
        ),
        requestId = text(req.body.requestId, 16, 80, "Request ID");
      let activity: any;
      await mongoose.connection.transaction(async (session) => {
        activity = await Activity.findOne({
          userId: req.user._id,
          requestId,
        }).session(session);
        if (activity) return;
        const current: any = await User.findById(req.user._id).session(session);
        const cost =
          duration * Math.max(1, Math.round(current.min_per_coin_ratio || 1));
        if (
          !(
            await User.updateOne(
              { _id: current._id, total_coins: { $gte: cost } },
              { $inc: { total_coins: -cost } },
              { session },
            )
          ).modifiedCount
        )
          throw new ApiError(
            400,
            "Earn a few more coins before choosing this reward.",
          );
        [activity] = await Activity.create(
          [
            {
              userId: current._id,
              type: "spend",
              activityName: name,
              durationMinutes: duration,
              pointsImpact: -cost,
              requestId,
            },
          ],
          { session, ordered: true },
        );
      });
      res.json(activity);
    }),
  );
  app.post(
    "/api/profile/claim-surprise",
    auth,
    route(async (req, res) => {
      let rewardName: string;
      await mongoose.connection.transaction(async (session) => {
        const u: any = await User.findById(req.user._id).session(session),
          goal = Math.max(1, u.surprise_goal_points || 500);
        if (
          !(
            await User.updateOne(
              { _id: u._id, surprise_cycle_points: { $gte: goal } },
              { $inc: { surprise_cycle_points: -goal } },
              { session },
            )
          ).modifiedCount
        )
          throw new ApiError(400, "Your surprise is not unlocked yet.");
        rewardName = u.surprise_reward_name || "Mystery Surprise";
      });
      res.json({
        rewardName,
        user: serializeUser(
          await User.findById(req.user._id).select("+parent_password"),
        ),
      });
    }),
  );
  app.get(
    "/api/activities/recent/:type",
    auth,
    route(async (req, res) => {
      if (!["earn", "spend"].includes(req.params.type))
        throw new ApiError(400, "Unknown activity type.");
      res.json(
        await Activity.find({ userId: req.user._id, type: req.params.type })
          .sort({ createdAt: -1 })
          .limit(5),
      );
    }),
  );
  app.get(
    "/api/activities/recent",
    auth,
    route(async (req, res) =>
      res.json(
        await Activity.find({ userId: req.user._id })
          .sort({ createdAt: -1 })
          .limit(5),
      ),
    ),
  );
  app.get(
    "/api/activities/today-earnings",
    auth,
    route(async (req, res) => {
      const rows: any[] = await Submission.find({
        userId: req.user._id,
        day: localDay(req.user.timezone || "UTC"),
        status: "approved",
      });
      res.json({ earnings: rows.reduce((sum, s) => sum + s.points, 0) });
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use((error: any, _req: any, res: any, _next: any) => {
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message });
    if (error.code === 11000)
      return res
        .status(409)
        .json({ error: "That username or submission already exists." });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Please use photos smaller than 4 MB each." });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid request." });
    console.error("API request failed:", error.name || "Error");
    res
      .status(500)
      .json({ error: "Could not save this change. Please try again." });
  });
  return app;
}
