import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { badRequest } from "../lib/errors.js";
import { IMAGE_TYPES, putFile } from "../lib/storage.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { orgPublic } from "./shared.js";
import { encrypt, decrypt, randomToken } from "../lib/crypto.js";
import { sendMessagingHook } from "../notify/index.js";
import { assertPublicUrl } from "../lib/netguard.js";
import { parseList } from "../returns/eligibility.js";
import type { Organization } from "../generated/prisma/client.js";

const policyOf = (o: Organization) => ({
  returnWindowDays: o.returnWindowDays,
  nonReturnableCategories: parseList(o.nonReturnableCategories),
  autoApproveMax: o.autoApproveMaxMinor / 100,
  maxReturnsPer90Days: o.maxReturnsPer90Days,
  requirePhotoForDamage: o.requirePhotoForDamage,
});

export const settingsRouter = Router();

settingsRouter.get("/organization", async (req, res) => {
  res.json(orgPublic(await db.organization.findUniqueOrThrow({ where: { id: auth(req).orgId } })));
});

settingsRouter.get("/policy", async (req, res) => {
  const org = await db.organization.findUniqueOrThrow({ where: { id: auth(req).orgId } });
  const categories = await db.orderItem.findMany({ where: { organizationId: org.id, category: { not: null } }, distinct: ["category"], select: { category: true }, take: 100 });
  res.json({ ...policyOf(org), knownCategories: categories.map((c) => c.category).filter(Boolean) });
});

const policyBody = z.object({
  returnWindowDays: z.coerce.number().int().min(1, "At least 1 day").max(365),
  nonReturnableCategories: z.array(z.string().trim().min(1).max(60)).max(50),
  autoApproveMax: z.coerce.number().min(0).max(10_000_000),
  maxReturnsPer90Days: z.coerce.number().int().min(1).max(100),
  requirePhotoForDamage: z.boolean(),
});

settingsRouter.put("/policy", requirePermission("settings:manage"), async (req, res) => {
  const a = auth(req);
  const body = policyBody.parse(req.body);
  const org = await db.organization.update({
    where: { id: a.orgId },
    data: {
      returnWindowDays: body.returnWindowDays,
      nonReturnableCategories: JSON.stringify([...new Set(body.nonReturnableCategories)]),
      autoApproveMaxMinor: Math.round(body.autoApproveMax * 100),
      maxReturnsPer90Days: body.maxReturnsPer90Days,
      requirePhotoForDamage: body.requirePhotoForDamage,
    },
  });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "settings.policy_updated", entityType: "organization", entityId: a.orgId, meta: body, req });
  res.json(policyOf(org));
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

// ───────────── SMS / WhatsApp hook ─────────────

const messagingView = (o: Organization) => ({
  url: o.messagingHookUrl,
  channels: parseList(o.messagingChannels),
  secretPreview: o.messagingHookSecretEnc ? `${decrypt(o.messagingHookSecretEnc).slice(0, 10)}••••••` : null,
});

settingsRouter.get("/messaging", requirePermission("settings:manage"), async (req, res) => {
  res.json(messagingView(await db.organization.findUniqueOrThrow({ where: { id: auth(req).orgId } })));
});

const messagingBody = z.object({
  url: z.union([z.string().trim().url("Enter a full https:// URL").refine((u) => u.startsWith("https://") || process.env.NODE_ENV !== "production", "Use an https:// URL"), z.literal("")]),
  channels: z.array(z.enum(["sms", "whatsapp"])).max(2),
});

settingsRouter.put("/messaging", requirePermission("settings:manage"), async (req, res) => {
  const a = auth(req);
  const body = messagingBody.parse(req.body);
  if (body.url) {
    try {
      await assertPublicUrl(body.url);
    } catch (e) {
      throw badRequest(e instanceof Error ? e.message : "Invalid URL");
    }
  }
  const current = await db.organization.findUniqueOrThrow({ where: { id: a.orgId } });
  const org = await db.organization.update({
    where: { id: a.orgId },
    data: {
      messagingHookUrl: body.url || null,
      messagingChannels: JSON.stringify(body.url ? [...new Set(body.channels)] : []),
      messagingHookSecretEnc: current.messagingHookSecretEnc ?? encrypt(`mhsec_${randomToken(24)}`),
    },
  });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "settings.messaging_updated", meta: { url: body.url, channels: body.channels }, req });
  res.json(messagingView(org));
});

settingsRouter.post("/messaging/reveal", requirePermission("settings:manage"), async (req, res) => {
  const a = auth(req);
  const org = await db.organization.findUniqueOrThrow({ where: { id: a.orgId } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "settings.messaging_secret_revealed", req });
  res.json({ secret: org.messagingHookSecretEnc ? decrypt(org.messagingHookSecretEnc) : null });
});

settingsRouter.post("/messaging/test", requirePermission("settings:manage"), async (req, res) => {
  const a = auth(req);
  const { phone } = z.object({ phone: z.string().trim().min(7, "Enter a phone number").max(20) }).parse(req.body);
  const org = await db.organization.findUniqueOrThrow({ where: { id: a.orgId } });
  const results = await sendMessagingHook(org, null, phone, "test", `${org.name}: this is a test message from ReturnFlow.`);
  if (!results.length) throw badRequest("Add a hook URL and enable at least one channel first");
  res.json({ results });
});
