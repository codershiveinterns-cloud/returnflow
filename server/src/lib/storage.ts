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

export async function putFile(orgId: string, bucket: string, data: Buffer, mimeType: string) {
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
