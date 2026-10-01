import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";
import { env, onVercelRuntime } from "./env.js";
import { DEMO_DB_BASE64 } from "./demo/snapshot.js";

function sqliteUrl(url: string) {
  const file = url.replace(/^file:/, "");
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

/**
 * On Vercel the deployment filesystem is read-only, so each instance restores
 * the seeded snapshot embedded at build time into /tmp. Writes are
 * per-instance and temporary — this mode is for demo deployments only.
 */
function databaseFile() {
  if (!onVercelRuntime) return sqliteUrl(env.DATABASE_URL);
  const target = "/tmp/returnflow.db";
  if (!fs.existsSync(target) && DEMO_DB_BASE64) fs.writeFileSync(target, Buffer.from(DEMO_DB_BASE64, "base64"));
  return target;
}

export const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseFile() }),
});

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
