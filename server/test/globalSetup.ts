import { execSync } from "node:child_process";
import fs from "node:fs";

const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: "file:./prisma/test.db",
  SESSION_SECRET: "test-session-secret-test-session-secret-0123456789",
  ENCRYPTION_KEY: "a".repeat(64),
  STORAGE_DIR: "./storage-test",
};

export default function setup() {
  fs.rmSync("prisma/test.db", { force: true });
  fs.rmSync("storage-test", { recursive: true, force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });
  return () => {
    fs.rmSync("storage-test", { recursive: true, force: true });
  };
}
