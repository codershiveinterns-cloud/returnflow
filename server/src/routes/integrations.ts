import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../env.js";
import { audit } from "../lib/audit.js";
import { decrypt, decryptJson, encrypt, encryptJson, randomToken, sha256 } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { ingestOrders, recordSync } from "../orders/ingest.js";
import { fetchOrders, mapShopifyOrder, normalizeShopDomain, verifyShop, type ShopifyConfig } from "../orders/shopify.js";
import { sandboxOrders } from "../orders/shopifySandbox.js";
import { param } from "./shared.js";

export const integrationsRouter = Router();
integrationsRouter.use(requirePermission("integrations:manage"));

const mask = (s: string) => `${s.slice(0, 10)}${"•".repeat(12)}${s.slice(-4)}`;

integrationsRouter.get("/", async (req, res) => {
  const { orgId } = auth(req);
  const [org, shopify, keys, lastRuns] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
    db.integration.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "shopify" } } }),
    db.apiKey.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
    db.syncRun.groupBy({ by: ["source"], where: { organizationId: orgId }, _max: { startedAt: true } }),
  ]);
  const shopCfg = shopify ? decryptJson<ShopifyConfig>(shopify.configEnc) : null;
  res.json({
    shopify: shopify && {
      id: shopify.id,
      mode: shopify.mode,
      status: shopify.status,
      displayName: shopify.displayName,
      shopDomain: shopCfg?.shopDomain,
      lastSyncedAt: shopify.lastSyncedAt,
      lastError: shopify.lastError,
      webhookUrl: `${env.PUBLIC_API_URL}/api/webhooks/shopify/${shopify.id}`,
      createdAt: shopify.createdAt,
    },
    webhook: {
      url: `${env.PUBLIC_API_URL}/api/webhooks/orders/${org.slug}`,
      secretPreview: mask(decrypt(org.webhookSecretEnc)),
    },
    api: {
      baseUrl: `${env.PUBLIC_API_URL}/api/v1`,
      keys: keys.map((k) => ({ id: k.id, name: k.name, prefix: `rf_${k.prefix}_`, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt, createdAt: k.createdAt })),
    },
    lastActivity: Object.fromEntries(lastRuns.map((r) => [r.source, r._max.startedAt])),
  });
});

// ---------- Shopify ----------

const connectBody = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("live"),
    shopDomain: z.string().trim().min(3, "Enter your store domain"),
    accessToken: z.string().trim().min(10, "Paste the Admin API access token"),
    apiSecret: z.string().trim().min(10, "Paste the API secret key (used to verify webhooks)"),
  }),
  z.object({ mode: z.literal("sandbox") }),
]);

integrationsRouter.post("/shopify", async (req, res) => {
  const a = auth(req);
  const body = connectBody.parse(req.body);
  let config: ShopifyConfig;
  let displayName: string;
  if (body.mode === "live") {
    config = { shopDomain: normalizeShopDomain(body.shopDomain), accessToken: body.accessToken, apiSecret: body.apiSecret };
    try {
      const shop = await verifyShop(config);
      displayName = shop.name;
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Could not reach Shopify");
    }
  } else {
    config = { shopDomain: "test-store.myshopify.com", accessToken: "sandbox", apiSecret: `sandbox_${randomToken(16)}` };
    displayName = "Test store";
  }
  const data = { mode: body.mode, displayName, configEnc: encryptJson(config), status: "connected", lastError: null, syncCursor: null };
  const integration = await db.integration.upsert({
    where: { organizationId_provider: { organizationId: a.orgId, provider: "shopify" } },
    create: { ...data, organizationId: a.orgId, provider: "shopify" },
    update: data,
  });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "integration.shopify_connected", entityType: "integration", entityId: integration.id, meta: { mode: body.mode, shop: config.shopDomain }, req });
  res.status(201).json({ id: integration.id, displayName });
});

integrationsRouter.post("/shopify/sync", async (req, res) => {
  const a = auth(req);
  const integration = await db.integration.findUnique({ where: { organizationId_provider: { organizationId: a.orgId, provider: "shopify" } } });
  if (!integration) throw notFound("Connect Shopify first");
  const cfg = decryptJson<ShopifyConfig>(integration.configEnc);
  const startedAt = new Date();

  try {
    const result = await recordSync(a.orgId, { source: "shopify", trigger: "manual", label: integration.displayName }, async () => {
      let payloads;
      if (integration.mode === "sandbox") {
        const existing = await db.order.count({ where: { organizationId: a.orgId, source: "shopify" } });
        payloads = sandboxOrders(6 + Math.floor(Math.random() * 6), 3001 + existing);
      } else {
        payloads = await fetchOrders(cfg, integration.syncCursor ?? undefined);
      }
      return ingestOrders(a.orgId, payloads.map(mapShopifyOrder), "shopify");
    });
    await db.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: startedAt, syncCursor: startedAt.toISOString(), status: "connected", lastError: null } });
    await audit({ organizationId: a.orgId, actor: a.actor, action: "integration.shopify_synced", entityType: "sync_run", entityId: result.syncRunId, meta: { created: result.created, updated: result.updated, failed: result.failed }, req });
    res.json({ created: result.created, updated: result.updated, failed: result.failed, errors: result.errors, syncRunId: result.syncRunId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await db.integration.update({ where: { id: integration.id }, data: { status: "error", lastError: message } });
    throw badRequest(message);
  }
});

integrationsRouter.delete("/shopify", async (req, res) => {
  const a = auth(req);
  const deleted = await db.integration.deleteMany({ where: { organizationId: a.orgId, provider: "shopify" } });
  if (deleted.count) await audit({ organizationId: a.orgId, actor: a.actor, action: "integration.shopify_disconnected", req });
  res.status(204).end();
});

// ---------- Generic webhook secret ----------

integrationsRouter.post("/webhook/reveal", async (req, res) => {
  const a = auth(req);
  const org = await db.organization.findUniqueOrThrow({ where: { id: a.orgId } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "integration.webhook_secret_revealed", req });
  res.json({ secret: decrypt(org.webhookSecretEnc) });
});

integrationsRouter.post("/webhook/rotate", async (req, res) => {
  const a = auth(req);
  const secret = `whsec_${randomToken(24)}`;
  await db.organization.update({ where: { id: a.orgId }, data: { webhookSecretEnc: encrypt(secret) } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "integration.webhook_secret_rotated", req });
  res.json({ secret });
});

// ---------- API keys ----------

integrationsRouter.post("/api-keys", async (req, res) => {
  const a = auth(req);
  const { name } = z.object({ name: z.string().trim().min(2, "Give the key a name").max(60) }).parse(req.body);
  const prefix = randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(8, "0").slice(0, 8);
  const token = `rf_${prefix}_${randomToken(24)}`;
  const key = await db.apiKey.create({ data: { organizationId: a.orgId, name, prefix, hash: sha256(token), createdById: a.userId } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "api_key.created", entityType: "api_key", entityId: key.id, meta: { name }, req });
  res.status(201).json({ id: key.id, name, token });
});

integrationsRouter.delete("/api-keys/:id", async (req, res) => {
  const a = auth(req);
  const key = await db.apiKey.findFirst({ where: { id: param(req.params.id), organizationId: a.orgId } });
  if (!key) throw notFound("API key not found");
  await db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "api_key.revoked", entityType: "api_key", entityId: key.id, meta: { name: key.name }, req });
  res.status(204).end();
});

// ---------- Sync history ----------

integrationsRouter.get("/sync-runs", async (req, res) => {
  const { orgId } = auth(req);
  const runs = await db.syncRun.findMany({ where: { organizationId: orgId }, orderBy: { startedAt: "desc" }, take: 50 });
  res.json({ runs: runs.map((r) => ({ ...r, errors: r.errors ? JSON.parse(r.errors) : [] })) });
});
