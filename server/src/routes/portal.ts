import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound, unauthorized } from "../lib/errors.js";
import { rateLimit } from "../lib/rateLimit.js";
import { IMAGE_TYPES, putFile } from "../lib/storage.js";
import { issuePortalToken, readPortalToken } from "../auth/session.js";
import { normalizeOrderNumber } from "../orders/schema.js";
import { REASON_CODES, RETURN_REASONS } from "../returns/reasons.js";
import { RESOLUTIONS } from "../returns/status.js";
import { orgPublic, param, rma } from "./shared.js";

/**
 * Public customer return portal: /r/:slug in the web app.
 * Customers never have accounts; they prove ownership of an order with the
 * order number plus the email or phone on it, and get a short-lived token
 * scoped to that single order.
 */
export const portalRouter = Router();

const lookupLimiter = rateLimit({ windowMs: 60_000, max: 12 });
const NO_MATCH = "We couldn't find an order with those details. Check the order number and the email or phone you used at checkout.";

async function orgBySlug(slug: string) {
  const org = await db.organization.findUnique({ where: { slug } });
  if (!org) throw notFound("This return portal doesn't exist");
  return org;
}

const digits = (s: string) => s.replace(/\D/g, "");
function contactMatches(contact: string, customer: { email: string; phone: string | null }) {
  const c = contact.trim().toLowerCase();
  if (c.includes("@")) return c === customer.email.toLowerCase();
  const d = digits(c);
  return d.length >= 7 && !!customer.phone && digits(customer.phone).slice(-10) === d.slice(-10);
}

portalRouter.get("/:slug", async (req, res) => {
  const org = await orgBySlug(param(req.params.slug));
  res.json({ organization: orgPublic(org), reasons: RETURN_REASONS, resolutions: RESOLUTIONS });
});

const lookupBody = z.object({
  orderNumber: z.string().trim().min(1, "Enter your order number").max(64),
  contact: z.string().trim().min(3, "Enter the email or phone number used on the order").max(120),
});

async function loadOrderForPortal(orgId: string, orderId: string) {
  return db.order.findFirst({
    where: { id: orderId, organizationId: orgId },
    include: {
      customer: true,
      items: { include: { returnItems: { where: { returnRequest: { status: { not: "rejected" } } }, select: { quantity: true } } } },
      returns: { orderBy: { createdAt: "desc" }, select: { number: true, status: true, createdAt: true } },
    },
  });
}

function portalOrder(o: NonNullable<Awaited<ReturnType<typeof loadOrderForPortal>>>, returnWindowDays: number) {
  const blockedReason =
    o.status === "cancelled" ? "This order was cancelled, so there's nothing to return." : o.status === "pending" ? "This order hasn't shipped yet. You can request a return once it's delivered." : null;
  const deliveredOrPlaced = o.deliveredAt ?? o.placedAt;
  return {
    orderNumber: o.orderNumber,
    placedAt: o.placedAt,
    deliveredAt: o.deliveredAt,
    status: o.status,
    currency: o.currency,
    paymentMethod: o.paymentMethod,
    customerName: o.customer.name,
    returnBy: new Date(deliveredOrPlaced.getTime() + returnWindowDays * 864e5),
    blockedReason,
    items: o.items.map((i) => {
      const requested = i.returnItems.reduce((s, r) => s + r.quantity, 0);
      return { id: i.id, sku: i.sku, name: i.name, variant: i.variant, imageUrl: i.imageUrl, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, returnableQuantity: Math.max(0, i.quantity - requested) };
    }),
    existingReturns: o.returns.map((r) => ({ rma: rma(r.number), status: r.status, createdAt: r.createdAt })),
  };
}

portalRouter.post("/:slug/lookup", lookupLimiter, async (req, res) => {
  const org = await orgBySlug(param(req.params.slug));
  const body = lookupBody.parse(req.body);
  const order = await db.order.findUnique({
    where: { organizationId_orderNumber: { organizationId: org.id, orderNumber: normalizeOrderNumber(body.orderNumber) } },
    select: { id: true, customer: { select: { email: true, phone: true } } },
  });
  if (!order || !contactMatches(body.contact, order.customer)) throw notFound(NO_MATCH);
  const full = await loadOrderForPortal(org.id, order.id);
  res.json({ token: issuePortalToken(org.id, order.id), order: portalOrder(full!, org.returnWindowDays) });
});

const MAX_PHOTOS_PER_ITEM = 4;
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 24 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype) && file.mimetype !== "image/svg+xml") cb(null, true);
    else cb(badRequest(`“${file.originalname}” isn't a supported photo. Use JPG, PNG, WEBP or HEIC.`));
  },
});

const submitBody = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().positive(),
        reason: z.enum(REASON_CODES, { message: "Choose a reason" }),
        reasonDetail: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1, "Select at least one item to return"),
  resolution: z.enum(RESOLUTIONS, { message: "Choose how you'd like this resolved" }),
  note: z.string().trim().max(1000).optional(),
});

portalRouter.post("/:slug/returns", photoUpload.any(), async (req, res) => {
  const org = await orgBySlug(param(req.params.slug));
  const token = readPortalToken(req.header("x-portal-token"));
  if (!token || token.org !== org.id) throw unauthorized("Your session expired. Look up your order again to continue.");

  let raw: unknown;
  try {
    raw = JSON.parse(String(req.body?.payload ?? ""));
  } catch {
    throw badRequest("Malformed request");
  }
  const body = submitBody.parse(raw);
  const order = await loadOrderForPortal(org.id, token.order);
  if (!order) throw notFound("Order not found");
  const view = portalOrder(order, org.returnWindowDays);
  if (view.blockedReason) throw badRequest(view.blockedReason);

  const byId = new Map(view.items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const line of body.items) {
    const item = byId.get(line.orderItemId);
    if (!item) throw badRequest("One of the selected items isn't part of this order");
    if (seen.has(line.orderItemId)) throw badRequest("An item was selected twice");
    seen.add(line.orderItemId);
    if (line.quantity > item.returnableQuantity) throw badRequest(`Only ${item.returnableQuantity} of “${item.name}” can be returned`);
    if (line.reason === "other" && !line.reasonDetail) throw badRequest(`Tell us a little about the problem with “${item.name}”`);
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const photosByItem = new Map<string, Express.Multer.File[]>();
  for (const f of files) {
    const id = /^photos_(.+)$/.exec(f.fieldname)?.[1];
    if (!id || !seen.has(id)) throw badRequest("A photo was attached to an item that isn't being returned");
    const list = photosByItem.get(id) ?? [];
    if (list.length >= MAX_PHOTOS_PER_ITEM) throw badRequest(`Up to ${MAX_PHOTOS_PER_ITEM} photos per item`);
    list.push(f);
    photosByItem.set(id, list);
  }

  // Persist photos before the transaction so the DB never points at missing files.
  const stored = new Map<string, { key: string; mime: string; size: number }[]>();
  for (const [itemId, list] of photosByItem) {
    stored.set(itemId, await Promise.all(list.map(async (f) => ({ key: await putFile(org.id, "returns", f.buffer, f.mimetype), mime: f.mimetype, size: f.size }))));
  }

  const valueMinor = body.items.reduce((s, l) => s + l.quantity * byId.get(l.orderItemId)!.unitPriceMinor, 0);
  const created = await db.$transaction(async (tx) => {
    const { nextReturnNumber } = await tx.organization.update({ where: { id: org.id }, data: { nextReturnNumber: { increment: 1 } }, select: { nextReturnNumber: true } });
    const number = nextReturnNumber - 1;
    const ret = await tx.returnRequest.create({
      data: {
        organizationId: org.id,
        number,
        orderId: order.id,
        customerId: order.customerId,
        status: "requested",
        resolution: body.resolution,
        channel: "portal",
        customerNote: body.note || null,
        valueMinor,
        currency: order.currency,
      },
    });
    for (const line of body.items) {
      const item = await tx.returnItem.create({
        data: { returnId: ret.id, orderItemId: line.orderItemId, quantity: line.quantity, reason: line.reason, reasonDetail: line.reasonDetail || null },
      });
      for (const p of stored.get(line.orderItemId) ?? []) {
        await tx.returnPhoto.create({ data: { organizationId: org.id, returnId: ret.id, returnItemId: item.id, storageKey: p.key, mimeType: p.mime, sizeBytes: p.size, uploadedBy: "customer" } });
      }
    }
    const customerLabel = order.customer.name ?? order.customer.email;
    await tx.returnEvent.create({
      data: { organizationId: org.id, returnId: ret.id, type: "status", status: "requested", message: "Return requested through the customer portal", actorType: "customer", actorId: order.customerId, actorLabel: customerLabel },
    });
    await audit({ organizationId: org.id, actor: { type: "customer", id: order.customerId, label: customerLabel }, action: "return.requested", entityType: "return", entityId: ret.id, meta: { rma: rma(number), order: order.orderNumber, valueMinor }, req }, tx);
    return ret;
  });

  res.status(201).json({ rma: rma(created.number), status: created.status, createdAt: created.createdAt, valueMinor, currency: order.currency, resolution: created.resolution });
});

const trackQuery = z.object({
  rma: z.string().trim().min(3, "Enter your return number"),
  contact: z.string().trim().min(3, "Enter the email or phone on the order"),
});

portalRouter.post("/:slug/track", lookupLimiter, async (req, res) => {
  const org = await orgBySlug(param(req.params.slug));
  const q = trackQuery.parse(req.body);
  const number = Number(q.rma.replace(/^rf-?/i, "").replace(/\D/g, ""));
  const ret = Number.isFinite(number)
    ? await db.returnRequest.findUnique({
        where: { organizationId_number: { organizationId: org.id, number } },
        include: {
          customer: true,
          order: { select: { orderNumber: true } },
          items: { include: { orderItem: { select: { name: true, variant: true, imageUrl: true } } } },
          events: { where: { type: "status" }, orderBy: { createdAt: "asc" } },
        },
      })
    : null;
  if (!ret || !contactMatches(q.contact, ret.customer)) throw notFound("We couldn't find a return with those details.");
  res.json({
    rma: rma(ret.number),
    status: ret.status,
    resolution: ret.resolution,
    orderNumber: ret.order.orderNumber,
    createdAt: ret.createdAt,
    valueMinor: ret.valueMinor,
    currency: ret.currency,
    items: ret.items.map((i) => ({ name: i.orderItem.name, variant: i.orderItem.variant, quantity: i.quantity, reason: i.reason })),
    timeline: ret.events.map((e) => ({ status: e.status, message: e.message, at: e.createdAt })),
  });
});
