import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("file:./prisma/dev.db"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters"),
  STORAGE_DIR: z.string().default("./storage"),
  /** Test-only: route Shopify Admin API calls to a local mock server. */
  SHOPIFY_API_BASE: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + parsed.error.issues.map((i) => ` - ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
