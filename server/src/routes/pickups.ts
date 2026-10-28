import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { rma } from "./shared.js";

export const pickupsRouter = Router();

pickupsRouter.get("/", requirePermission("pickups:manage"), async (req, res) => {
  const { orgId } = auth(req);
  const q = z.object({ status: z.enum(["scheduled", "in_transit", "delivered", "failed"]).optional() }).parse(req.query);
  const [rows, counts, awaiting] = await Promise.all([
    db.shipment.findMany({
      where: { organizationId: orgId, ...(q.status && { status: q.status }) },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        returnRequest: { select: { id: true, number: true, status: true, customer: { select: { name: true, email: true } }, order: { select: { orderNumber: true, shippingAddress: true } }, _count: { select: { items: true } } } },
        checkpoints: { orderBy: { at: "desc" }, take: 1 },
      },
    }),
    db.shipment.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: true }),
    db.returnRequest.count({ where: { organizationId: orgId, status: "approved" } }),
  ]);
  res.json({
    awaitingPickup: awaiting,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    shipments: rows.map((s) => {
      const addr = s.returnRequest.order.shippingAddress ? JSON.parse(s.returnRequest.order.shippingAddress) : null;
      return {
        id: s.id,
        courier: s.courier,
        awb: s.awb,
        status: s.status,
        scheduledFor: s.scheduledFor,
        pickupWindow: s.pickupWindow,
        city: addr?.city ?? null,
        lastCheckpoint: s.checkpoints[0] ?? null,
        returnId: s.returnRequest.id,
        rma: rma(s.returnRequest.number),
        returnStatus: s.returnRequest.status,
        customer: s.returnRequest.customer.name ?? s.returnRequest.customer.email,
        orderNumber: s.returnRequest.order.orderNumber,
        items: s.returnRequest._count.items,
      };
    }),
  });
});
