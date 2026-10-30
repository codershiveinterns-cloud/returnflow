import express, { Router } from "express";
import fs from "node:fs";
import path from "node:path";
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
import { rulesRouter } from "./routes/rules.js";
import { pickupsRouter } from "./routes/pickups.js";
import { notificationsRouter } from "./routes/notifications.js";
import { workRouter } from "./routes/work.js";
import { analyticsRouter } from "./routes/analytics.js";
import { contactRouter } from "./routes/contact.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
      // The API only returns JSON, files and PDFs — nothing should execute or be framed.
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'"], styleSrc: ["'unsafe-inline'"] } },
      strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
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
  app.use("/api/public/contact", contactRouter);
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
  consoleApi.use("/rules", rulesRouter);
  consoleApi.use("/pickups", pickupsRouter);
  consoleApi.use("/notifications", notificationsRouter);
  consoleApi.use("/work", workRouter);
  consoleApi.use("/analytics", analyticsRouter);
  app.use("/api", consoleApi);

  // Single-server deployments (VPS): serve the built web app from the same origin.
  const webDist = process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : null;
  if (webDist && fs.existsSync(path.join(webDist, "index.html"))) {
    const spaHeaders = (res: express.Response) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
    };
    app.use(express.static(webDist, { index: false, maxAge: "1y", immutable: true, setHeaders: (res, file) => file.endsWith(".html") && res.setHeader("Cache-Control", "no-cache") }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      spaHeaders(res);
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
