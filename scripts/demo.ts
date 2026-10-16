// Isolated local demo: never connects to your real database and never calls AI.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { createApp } from "../src/server/app.ts";
import { User } from "../src/models/User.ts";
import { Mission, starterMissions } from "../src/models/Mission.ts";

if (process.env.NODE_ENV === "production")
  throw new Error("The demo is for local development only.");
delete process.env.OPENAI_API_KEY;
const db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.EVIDENCE_DIR = await mkdtemp(path.join(tmpdir(), "habit-demo-"));
await mongoose.connect(db.getUri());
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
const user = await User.create({
  username: "demo-hero",
  password: await bcrypt.hash("demo-child-123", 10),
  parent_password: await bcrypt.hash("demo-parent-123", 10),
  photo_consent: true,
  total_coins: 20,
  surprise_cycle_points: 20,
  surprise_goal_points: 50,
  surprise_reward_name: "A new board game",
});
await Mission.create(starterMissions.map((m) => ({ ...m, userId: user._id })));
const app = createApp({
  jwtSecret: "local-demo-only-not-for-production-123456",
});
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
});
app.use(vite.middlewares);
const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => {
  console.log(`Demo: http://localhost:${process.env.PORT || 3000}`);
  console.log(
    "Username: demo-hero | Child sign-in: demo-child-123 | Parent controls: demo-parent-123",
  );
  console.log(
    "Temporary data only. AI is disabled. Stop the demo to discard its data.",
  );
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await vite.close();
  await mongoose.disconnect();
  await db.stop();
  await rm(process.env.EVIDENCE_DIR!, { recursive: true, force: true });
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
