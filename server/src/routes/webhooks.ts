import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { decrypt, decryptJson, hmacSha256, safeEqual } from "../lib/crypto.js";
import { badRequest, notFound, unauthorized } from "../lib/errors.js";
import { ingestOrders, recordSync } from "../orders/ingest.js";
import { mapShopifyOrder, type ShopifyConfig, type ShopifyOrder } from "../orders/shopify.js";
import { param } from "./shared.js";
import { recordCheckpoint, type CheckpointStatus } from "../returns/service.js";

export const webhooksRouter = Router();

const SHOPIFY_TOPICS = new Set(["orders/create", "orders/updated", "orders/cancelled", "orders/fulfilled", "orders/paid"]);

/**
 * Shopify → ReturnFlow. Signed with the app's API secret; verified against
 * the exact raw bytes Shopify sent.
 */
webhooksRouter.post("/shopify/:integrationId", async (req, res) => {
  const integration = await db.integration.findUnique({ where: { id: param(req.params.integrationId) } });
  if (!integration || integration.provider !== "shopify") throw notFound();
  const cfg = decryptJson<ShopifyConfig>(integration.configEnc);
  const signature = req.header("x-shopify-hmac-sha256") ?? "";
  if (!req.rawBody || !signature || !safeEqual(hmacSha256(cfg.apiSecret, req.rawBody, "base64"), signature)) throw unauthorized("Invalid Shopify signature");

  const topic = req.header("x-shopify-topic") ?? "";
  if (!SHOPIFY_TOPICS.has(topic)) {
    res.status(200).json({ ignored: topic });
    return;
  }
  const result = await recordSync(integration.organizationId, { source: "shopify", trigger: "webhook", label: topic }, () =>
    ingestOrders(integration.organizationId, [mapShopifyOrder(req.body as ShopifyOrder)], "shopify"),
  );
  res.status(200).json({ created: result.created, updated: result.updated, failed: result.failed });
});

/**
 * Generic signed order webhook for custom storefronts / ERPs.
 *
 *   X-ReturnFlow-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * Signatures older than 5 minutes are rejected to stop replays.
 */
const TOLERANCE_S = 300;
const envelope = z.union([z.object({ orders: z.array(z.unknown()).min(1).max(100) }), z.record(z.string(), z.unknown())]);

async function verifySigned(req: Request, slug: string) {
  const org = await db.organization.findUnique({ where: { slug } });
  if (!org) throw notFound();
  const header = req.header("x-returnflow-signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) throw unauthorized("Missing X-ReturnFlow-Signature header");
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) throw unauthorized("Signature timestamp is outside the allowed window");
  const expected = hmacSha256(decrypt(org.webhookSecretEnc), `${t}.${req.rawBody?.toString("utf8") ?? ""}`);
  if (!safeEqual(expected, parts.v1)) throw unauthorized("Invalid signature");
  return org;
}

webhooksRouter.post("/orders/:slug", async (req, res) => {
  const org = await verifySigned(req, param(req.params.slug));
  const body = envelope.parse(req.body);
  const orders = "orders" in body && Array.isArray(body.orders) ? body.orders : [body];
  if (!orders.length) throw badRequest("No orders in payload");
  const result = await recordSync(org.id, { source: "webhook", trigger: "webhook", label: `${orders.length} order${orders.length > 1 ? "s" : ""}` }, () => ingestOrders(org.id, orders, "webhook"));
  await audit({ organizationId: org.id, actor: { type: "system", label: "Order webhook" }, action: "orders.webhook_received", entityType: "sync_run", entityId: result.syncRunId, meta: { created: result.created, updated: result.updated, failed: result.failed } });
  res.status(result.failed && !result.created && !result.updated ? 422 : 200).json({ created: result.created, updated: result.updated, failed: result.failed, errors: result.errors });
});

/**
 * Courier tracking webhook (same signing scheme as the order webhook).
 * Accepts ReturnFlow checkpoint names or common courier status codes.
 */
const COURIER_STATUS: Record<string, CheckpointStatus> = {
  picked_up: "picked_up", pickedup: "picked_up", pickup_done: "picked_up",
  in_transit: "in_transit", intransit: "in_transit", shipped: "in_transit",
  out_for_delivery: "out_for_delivery", ofd: "out_for_delivery",
  delivered: "delivered", rto_delivered: "delivered",
  failed: "failed", pickup_failed: "failed", cancelled: "failed", pickup_cancelled: "failed",
};
const courierBody = z.object({
  awb: z.string().trim().min(4).max(40),
  status: z.string().trim().min(2).max(40),
  location: z.string().trim().max(80).optional(),
  note: z.string().trim().max(200).optional(),
  at: z.coerce.date().optional(),
});

webhooksRouter.post("/courier/:slug", async (req, res) => {
  const org = await verifySigned(req, param(req.params.slug));
  const body = courierBody.parse(req.body);
  const status = COURIER_STATUS[body.status.toLowerCase().replace(/[\s-]+/g, "_")];
  if (!status) throw badRequest(`Unknown courier status “${body.status}”`);
  const sh = await db.shipment.findUnique({ where: { organizationId_awb: { organizationId: org.id, awb: body.awb } } });
  if (!sh) throw notFound("No return is linked to this AWB");
  await recordCheckpoint(org.id, sh.id, { status, location: body.location, note: body.note, at: body.at, source: "webhook" }, { type: "system", label: `${sh.courier} tracking` });
  res.json({ ok: true, status });
});
