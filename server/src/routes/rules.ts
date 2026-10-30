import { Router } from "express";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { auth, requirePermission } from "../auth/middleware.js";
import { ACTIONS, FIELDS, ruleInput, ruleMatches, type Condition, type RuleContext } from "../returns/rules.js";
import { param, rma } from "./shared.js";

export const rulesRouter = Router();
rulesRouter.use(requirePermission("rules:manage"));

const serialize = (r: Awaited<ReturnType<typeof db.automationRule.findFirstOrThrow>>) => ({ ...r, conditions: JSON.parse(r.conditions) as Condition[] });

rulesRouter.get("/", async (req, res) => {
  const rules = await db.automationRule.findMany({ where: { organizationId: auth(req).orgId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  res.json({ rules: rules.map(serialize), fields: FIELDS, actions: ACTIONS });
});

rulesRouter.post("/", async (req, res) => {
  const a = auth(req);
  const body = ruleInput.parse(req.body);
  const rule = await db.automationRule.create({ data: { ...body, conditions: JSON.stringify(body.conditions), organizationId: a.orgId, createdById: a.userId } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "rule.created", entityType: "rule", entityId: rule.id, meta: { name: rule.name, action: rule.action }, req });
  res.status(201).json(serialize(rule));
});

rulesRouter.patch("/:id", async (req, res) => {
  const a = auth(req);
  const existing = await db.automationRule.findFirst({ where: { id: param(req.params.id), organizationId: a.orgId } });
  if (!existing) throw notFound("Rule not found");
  const sent = new Set(Object.keys(req.body ?? {}));
  const parsed = ruleInput.partial().parse(req.body);
  // partial() still fills defaults (enabled, priority, match) — keep only fields the client sent.
  const { conditions, ...body } = Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.has(k))) as Partial<typeof parsed>;
  const rule = await db.automationRule.update({ where: { id: existing.id }, data: { ...body, ...(conditions && { conditions: JSON.stringify(conditions) }) } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: body.enabled !== undefined && Object.keys(body).length === 1 && !conditions ? (body.enabled ? "rule.enabled" : "rule.disabled") : "rule.updated", entityType: "rule", entityId: rule.id, meta: { name: rule.name }, req });
  res.json(serialize(rule));
});

rulesRouter.delete("/:id", async (req, res) => {
  const a = auth(req);
  const existing = await db.automationRule.findFirst({ where: { id: param(req.params.id), organizationId: a.orgId } });
  if (!existing) throw notFound("Rule not found");
  await db.automationRule.delete({ where: { id: existing.id } });
  await audit({ organizationId: a.orgId, actor: a.actor, action: "rule.deleted", entityType: "rule", entityId: existing.id, meta: { name: existing.name }, req });
  res.status(204).end();
});

/** Dry-run a rule against the 100 most recent returns so admins can see its impact before saving. */
rulesRouter.post("/preview", async (req, res) => {
  const { orgId } = auth(req);
  const body = ruleInput.pick({ match: true, conditions: true }).parse(req.body);
  const returns = await db.returnRequest.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { order: true, items: { include: { orderItem: true } }, _count: { select: { photos: true } } },
  });
  const matches: { rma: string; valueMinor: number; currency: string }[] = [];
  for (const r of returns) {
    const history = await db.returnRequest.count({ where: { organizationId: orgId, customerId: r.customerId, status: { not: "rejected" }, createdAt: { gte: new Date(r.createdAt.getTime() - 90 * 864e5), lt: r.createdAt } } });
    const ctx: RuleContext = {
      value: r.valueMinor / 100,
      reason: r.items.map((i) => i.reason),
      category: r.items.map((i) => i.orderItem.category ?? "").filter(Boolean),
      customer_returns_90d: history,
      days_since_delivery: Math.max(0, Math.floor((r.createdAt.getTime() - (r.order.deliveredAt ?? r.order.placedAt).getTime()) / 864e5)),
      payment_method: r.order.paymentMethod,
      item_count: r.items.reduce((s, i) => s + i.quantity, 0),
      resolution: r.resolution,
      has_photos: r._count.photos > 0,
      risk_score: r.riskScore ?? 0,
    };
    if (ruleMatches(body, ctx)) matches.push({ rma: rma(r.number), valueMinor: r.valueMinor, currency: r.currency });
  }
  res.json({ tested: returns.length, matched: matches.length, examples: matches.slice(0, 5) });
});
