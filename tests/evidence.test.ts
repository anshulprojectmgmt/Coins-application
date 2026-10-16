import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { evidenceDirectory, savePhotos } from "../src/server/evidence.ts";
import { passwordValue } from "../src/server/rules.ts";

test("evidence cannot be configured under publicly served folders", () => {
  const previous = process.env.EVIDENCE_DIR;
  try {
    for (const folder of [
      "public",
      "public/photos",
      "dist",
      "dist/photos",
      ".",
    ]) {
      process.env.EVIDENCE_DIR = folder;
      assert.throws(evidenceDirectory);
    }
  } finally {
    if (previous) process.env.EVIDENCE_DIR = previous;
    else delete process.env.EVIDENCE_DIR;
  }
});

test("password validation prevents bcrypt byte truncation and preserves whitespace", () => {
  assert.throws(() => passwordValue("🙂".repeat(19), "Parent password"));
  assert.equal(
    passwordValue(" a private password ", "Parent password"),
    " a private password ",
  );
});

test("the development server cannot publicly serve known evidence filenames", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "habit-private-"));
  const previous = process.env.EVIDENCE_DIR;
  process.env.EVIDENCE_DIR = directory;
  const [filename] = await savePhotos([
    { buffer: Buffer.from("private test evidence") },
  ]);
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "spa",
    logLevel: "silent",
  });
  const app = express();
  app.use(vite.middlewares);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/@fs${path.join(directory, filename)}`,
    );
    assert.equal(response.status, 403);
    assert.ok(!(await response.text()).includes("private test evidence"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await vite.close();
    if (previous) process.env.EVIDENCE_DIR = previous;
    else delete process.env.EVIDENCE_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
