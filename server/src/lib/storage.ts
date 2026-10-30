import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * Private file storage. Files live outside any static directory and are only
 * served through authenticated, tenant-checked routes. The key layout is
 * `<orgId>/<bucket>/<random>.<ext>`; swapping this module for S3/R2 with
 * server-side encryption is a drop-in change.
 */
const root = path.resolve(process.cwd(), env.STORAGE_DIR);

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/svg+xml": "svg" };
export const IMAGE_TYPES = Object.keys(EXT);

/** Verifies the bytes really are the claimed image type (blocks renamed HTML/scripts). */
export function looksLikeImage(data: Buffer, mimeType: string) {
  const h = data.subarray(0, 16);
  switch (mimeType) {
    case "image/jpeg": return h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
    case "image/png": return h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp": return h.toString("ascii", 0, 4) === "RIFF" && h.toString("ascii", 8, 12) === "WEBP";
    case "image/heic":
    case "image/heif": return h.toString("ascii", 4, 8) === "ftyp";
    case "image/svg+xml": return /<svg[\s>]/i.test(data.subarray(0, 2048).toString("utf8")) && !/<script|on\w+=|javascript:/i.test(data.toString("utf8"));
    default: return false;
  }
}

export async function putFile(orgId: string, bucket: string, data: Buffer, mimeType: string) {
  if (mimeType.startsWith("image/") && !looksLikeImage(data, mimeType)) {
    const { badRequest } = await import("./errors.js");
    throw badRequest("That file doesn't look like a valid image");
  }
  const key = path.posix.join(orgId, bucket, `${crypto.randomUUID()}.${EXT[mimeType] ?? "bin"}`);
  const full = path.join(root, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return key;
}

export function filePath(key: string) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}
