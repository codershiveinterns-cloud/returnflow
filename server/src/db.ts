import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.js";
import { env } from "./env.js";

function sqliteUrl(url: string) {
  const file = url.replace(/^file:/, "");
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

export const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: sqliteUrl(env.DATABASE_URL) }),
});

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
