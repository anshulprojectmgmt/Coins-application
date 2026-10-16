import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ApiError } from "./rules.ts";

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const evidenceDirectory = () => {
  const directory = path.resolve(
    process.env.EVIDENCE_DIR || "./private-evidence",
  );
  for (const root of [path.resolve("public"), path.resolve("dist")]) {
    const relative = path.relative(root, directory);
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    ) {
      throw new Error("EVIDENCE_DIR must be outside public/ and dist/.");
    }
  }
  if (directory === process.cwd())
    throw new Error("EVIDENCE_DIR must be a dedicated private directory.");
  return directory;
};

export async function normalizePhoto(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 6_000_000 ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
  ) {
    throw new ApiError(
      400,
      "Choose a JPG, PNG or WebP photo smaller than 4 MB.",
    );
  }
  const input = Buffer.from(value.split(",")[1], "base64");
  if (input.length > 4 * 1024 * 1024)
    throw new ApiError(400, "Each photo must be smaller than 4 MB.");
  try {
    const source = sharp(input, {
      limitInputPixels: 24_000_000,
      animated: false,
    });
    const metadata = await source.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      (metadata.pages || 1) > 1
    )
      throw new Error();
    // Decode and re-encode to remove location/EXIF data and reject malformed uploads.
    const buffer = await source
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { buffer, hash: createHash("sha256").update(buffer).digest("hex") };
  } catch {
    throw new ApiError(
      400,
      "That photo could not be read. Please take another JPG or PNG photo.",
    );
  }
}

export async function savePhotos(photos: { buffer: Buffer }[]) {
  await mkdir(evidenceDirectory(), { recursive: true, mode: 0o700 });
  const saved: string[] = [];
  try {
    for (const photo of photos) {
      const id = `${randomUUID()}.jpg`;
      await writeFile(path.join(evidenceDirectory(), id), photo.buffer, {
        mode: 0o600,
        flag: "wx",
      });
      saved.push(id);
    }
    return saved;
  } catch (error) {
    await deletePhotos(saved);
    throw error;
  }
}

export async function deletePhotos(ids: string[]) {
  await Promise.all(
    ids.map((id) =>
      unlink(path.join(evidenceDirectory(), path.basename(id))).catch(() => {}),
    ),
  );
}

export async function readPhoto(id: string) {
  return readFile(path.join(evidenceDirectory(), path.basename(id)));
}

// Runs on startup and hourly, including orphaned files left by an interrupted request.
export async function purgeExpiredPhotos() {
  await mkdir(evidenceDirectory(), { recursive: true, mode: 0o700 });
  for (const id of await readdir(evidenceDirectory())) {
    const file = path.join(evidenceDirectory(), id);
    const info = await stat(file).catch(() => null);
    if (info?.isFile() && Date.now() - info.mtimeMs >= RETENTION_MS)
      await unlink(file).catch(() => {});
  }
}
