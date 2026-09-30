import { Router } from "express";
import fs from "node:fs";
import { db } from "../db.js";
import { notFound } from "../lib/errors.js";
import { filePath } from "../lib/storage.js";
import { auth, requireAuth, requirePermission } from "../auth/middleware.js";
import { param } from "./shared.js";

export const filesRouter = Router();

/** Return photos are private: authenticated, permission-checked and tenant-scoped. */
filesRouter.get("/photos/:id", requireAuth, requirePermission("returns:view"), async (req, res) => {
  const photo = await db.returnPhoto.findFirst({ where: { id: param(req.params.id), organizationId: auth(req).orgId } });
  if (!photo) throw notFound();
  const full = filePath(photo.storageKey);
  if (!fs.existsSync(full)) throw notFound();
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.type(photo.mimeType).sendFile(full);
});

export const publicAssetsRouter = Router();

publicAssetsRouter.get("/orgs/:slug/logo", async (req, res) => {
  const org = await db.organization.findUnique({ where: { slug: param(req.params.slug) }, select: { logoKey: true } });
  if (!org?.logoKey) throw notFound();
  const full = filePath(org.logoKey);
  if (!fs.existsSync(full)) throw notFound();
  res.setHeader("Cache-Control", "public, max-age=86400");
  if (full.endsWith(".svg")) res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.sendFile(full);
});
