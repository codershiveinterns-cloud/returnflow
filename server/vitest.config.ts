import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./prisma/test.db",
      SESSION_SECRET: "test-session-secret-test-session-secret-0123456789",
      ENCRYPTION_KEY: "a".repeat(64),
      STORAGE_DIR: "./storage-test",
      PUBLIC_API_URL: "http://localhost:4000",
      APP_URL: "http://localhost:5173",
      SHOPIFY_API_BASE: "http://127.0.0.1:47899",
    },
  },
});
