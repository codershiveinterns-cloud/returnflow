import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { badRequest } from "../lib/errors.js";
import { IMAGE_TYPES, putFile } from "../lib/storage.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { orgPublic } from "./shared.js";

export const settingsRouter = Router();

settingsRouter.get("/organization", async (req, res) => {
  res.json(orgPublic(await db.organization.findUniqueOrThrow({ where: { id: auth(req).orgId } })));
});

const orgBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1f2a37").optional(),
  supportEmail: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
  portalHeadline: z.string().trim().max(120).optional(),
  returnWindowDays: z.coerce.number().int().min(1).max(365).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

settingsRouter.patch("/organization", requirePermission("settings:manage"), async (req, res) => {
  const a = auth(req);
  const body = orgBody.parse(req.body);
  const org = await db.organization.update({
    where: { id: a.orgId },
    data: { ...body, supportEmail: body.supportEmail === "" ? null : body.supportEmail, portalHeadline: body.portalHeadline === "" ? null : body.portalHeadline },
  });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "settings.updated", entityType: "organization", entityId: a.orgId, meta: body, req });
  res.json(orgPublic(org));
});

const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

settingsRouter.post("/organization/logo", requirePermission("settings:manage"), logoUpload.single("logo"), async (req, res) => {
  const a = auth(req);
  if (!req.file) throw badRequest("Choose an image to upload");
  if (!IMAGE_TYPES.includes(req.file.mimetype) || req.file.mimetype.startsWith("image/hei")) throw badRequest("Logo must be PNG, JPG, WEBP or SVG");
  const key = await putFile(a.orgId, "branding", req.file.buffer, req.file.mimetype);
  const org = await db.organization.update({ where: { id: a.orgId }, data: { logoKey: key } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "settings.logo_updated", req });
  res.json(orgPublic(org));
});

settingsRouter.delete("/organization/logo", requirePermission("settings:manage"), async (req, res) => {
  const org = await db.organization.update({ where: { id: auth(req).orgId }, data: { logoKey: null } });
  res.json(orgPublic(org));
});
