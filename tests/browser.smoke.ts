import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import express from "express";
import { chromium } from "playwright";
import { mkdtemp, rm, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import assert from "node:assert/strict";
import { createApp } from "../src/server/app.ts";

const directory = await mkdtemp(path.join(tmpdir(), "habit-browser-"));
process.env.EVIDENCE_DIR = directory;
delete process.env.OPENAI_API_KEY;
const db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(db.getUri());
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
const app = createApp({
  jwtSecret: "browser-test-secret-not-for-production-123",
});
app.use(express.static(path.resolve("dist")));
app.get("*", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
const systemBrowser = await access("/usr/bin/chromium")
  .then(() => "/usr/bin/chromium")
  .catch(() => undefined);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || systemBrowser,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base);
  await page
    .getByRole("button", { name: "Don't have an account? Sign Up" })
    .click();
  await page.getByPlaceholder("Enter username").fill("browser-hero");
  await page.getByPlaceholder("Enter password").fill("child-password");
  await page
    .getByLabel("Parent password", { exact: true })
    .fill("parent-password");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await page
    .getByRole("link", { name: "Missions", exact: true })
    .first()
    .click();
  const mission = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Complete my worksheet",
        exact: true,
      }),
    });
  await mission.getByRole("button", { name: "Start mission" }).click();
  const bytes = await sharp({
    create: { width: 200, height: 100, channels: 3, background: "#e8dcc0" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Mission photo", { exact: true })
    .setInputFiles({
      name: "test-worksheet.png",
      mimeType: "image/png",
      buffer: bytes,
    });
  await page.getByRole("button", { name: "I did it! Check my photos" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "ready for a parent" })
    .waitFor();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("link", { name: "Parent space" }).click();
  await page
    .getByLabel("Parent password", { exact: true })
    .fill("parent-password");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("heading", { name: "All caught up" }).waitFor();
  await page.getByRole("button", { name: "settings", exact: true }).click();
  await page.getByLabel("Surprise goal (coins)").fill("10");
  await page.getByLabel("Secret surprise reward").fill("A new board game");
  await page.getByLabel("Coins per reward minute").fill("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Parent settings saved" })
    .waitFor();
  await page.screenshot({
    path: "test-results/parent-settings.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Back to missions" }).click();
  await page.getByRole("heading", { name: "Today’s missions" }).waitFor();
  await page.screenshot({
    path: "test-results/child-missions.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Spend", exact: true }).click();
  await page.getByLabel("Minutes", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Use my coins" }).click();
  await page.getByRole("heading", { name: "Activity Log" }).waitFor();
  await page.getByRole("link", { name: "Surprise", exact: true }).click();
  await page
    .getByRole("button", { name: "Open surprise", exact: true })
    .click();
  await page.getByText("A new board game", { exact: true }).waitFor();
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const profile = await (
    await fetch(base + "/api/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  assert.equal(profile.total_coins, 11);
  assert.equal(profile.surprise_cycle_points, 5);
  await page.goto(base + "/parent");
  await page.getByRole("heading", { name: "Unlock parent controls" }).waitFor();
  // Check small phones and desktop for horizontal overflow.
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base + "/earn");
    await page.getByRole("heading", { name: "Today’s missions" }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Overflow at width ${width}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: signup → photo submission → parent review → award → reward → surprise; parent lock and responsive widths.",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/browser-failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  await mongoose.disconnect();
  await db.stop();
  await rm(directory, { recursive: true, force: true });
}
