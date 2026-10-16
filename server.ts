import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import express from "express";
import mongoose from "mongoose";
import { createServer as createViteServer } from "vite";
import { createApp } from "./src/server/app.ts";
import { purgeExpiredPhotos } from "./src/server/evidence.ts";

const secret = process.env.JWT_SECRET;
if (
  process.env.NODE_ENV === "production" &&
  (!secret || secret.length < 32 || secret.startsWith("replace-with-"))
)
  throw new Error(
    "Set JWT_SECRET to a random secret of at least 32 characters.",
  );
if (!process.env.MONGODB_URI)
  throw new Error(
    "Set MONGODB_URI to a MongoDB replica set (MongoDB Atlas is supported).",
  );
await mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
const app = createApp({ jwtSecret: secret || randomBytes(32).toString("hex") });
await purgeExpiredPhotos();
const cleanup = setInterval(
  () =>
    purgeExpiredPhotos().catch(() => console.error("Evidence cleanup failed.")),
  60 * 60 * 1000,
);
cleanup.unref();
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(process.cwd(), "dist")));
  app.get("*", (_req, res) =>
    res.sendFile(path.join(process.cwd(), "dist/index.html")),
  );
}
app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(`Habit Hero running on port ${process.env.PORT || 3000}`),
);
