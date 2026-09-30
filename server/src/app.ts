import express, { Router } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env.js";
import { db } from "./db.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { requireAuth } from "./auth/middleware.js";
import { authRouter } from "./routes/auth.js";
import { auditRouter } from "./routes/audit.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { filesRouter, publicAssetsRouter } from "./routes/files.js";
import { integrationsRouter } from "./routes/integrations.js";
import { ordersRouter } from "./routes/orders.js";
import { portalRouter } from "./routes/portal.js";
import { publicApiRouter } from "./routes/publicApi.js";
import { returnsRouter } from "./routes/returns.js";
import { settingsRouter } from "./routes/settings.js";
import { teamRouter } from "./routes/team.js";
import { webhooksRouter } from "./routes/webhooks.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  if (env.NODE_ENV !== "test") app.use(morgan("dev"));
  app.use(
    express.json({
      limit: "2mb",
      // Webhook signatures are computed over the exact bytes received.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());

  app.get("/api/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "returnflow-api", time: new Date().toISOString() });
  });

  // Public surfaces
  app.use("/api/auth", authRouter);
  app.use("/api/portal", portalRouter);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/v1", publicApiRouter);
  app.use("/api/public", publicAssetsRouter);
  app.use("/api/files", filesRouter);

  // Authenticated console API — every route below is tenant-scoped via req.auth.orgId
  const consoleApi = Router();
  consoleApi.use(requireAuth);
  consoleApi.use("/dashboard", dashboardRouter);
  consoleApi.use("/orders", ordersRouter);
  consoleApi.use("/returns", returnsRouter);
  consoleApi.use("/team", teamRouter);
  consoleApi.use("/settings", settingsRouter);
  consoleApi.use("/integrations", integrationsRouter);
  consoleApi.use("/audit", auditRouter);
  app.use("/api", consoleApi);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
