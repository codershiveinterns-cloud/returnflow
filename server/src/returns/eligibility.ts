import type { Organization } from "../generated/prisma/client.js";
import { ACTIONS, ruleMatches, type Action, type Condition, type RuleContext } from "./rules.js";

/**
 * Eligibility engine. Runs on every new return request:
 *
 *   1. Policy checks (window, category, order status, value, history, evidence)
 *      — "hard" failures reject, "soft" failures send to review.
 *   2. Automation rules in priority order. Precedence when several match:
 *      auto_reject > require_manager > flag > auto_approve > policy outcome.
 *
 * The full result is stored on the return so staff can see exactly why a
 * request was approved, rejected or queued.
 */
export type Check = { key: string; label: string; pass: boolean; severity: "hard" | "soft"; detail: string };
export type Outcome = "auto_approve" | "auto_reject" | "review";
export type MatchedRule = { id: string; name: string; action: Action; note?: string | null };
export type Evaluation = {
  outcome: Outcome;
  requiresManager: boolean;
  holdRefund: boolean;
  flags: string[];
  checks: Check[];
  matchedRules: MatchedRule[];
  reason: string;
};

export type RuleRecord = { id: string; name: string; match: string; conditions: string; action: string; actionNote: string | null };

export type Policy = Pick<Organization, "returnWindowDays" | "nonReturnableCategories" | "autoApproveMaxMinor" | "maxReturnsPer90Days" | "requirePhotoForDamage" | "currency">;

const EVIDENCE_REASONS = new Set(["defective", "wrong_item", "not_as_described"]);

export function evaluate(policy: Policy, ctx: RuleContext & { orderStatus: string; valueMinor: number }, rules: RuleRecord[]): Evaluation {
  const blocked = parseList(policy.nonReturnableCategories).map((c) => c.toLowerCase());
  const badCats = ctx.category.filter((c) => blocked.includes(c.toLowerCase()));
  const money = (minor: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: policy.currency, maximumFractionDigits: 0 }).format(minor / 100);

  const checks: Check[] = [
    {
      key: "order_status",
      label: "Order delivered",
      severity: "hard",
      pass: ctx.orderStatus === "delivered" || ctx.orderStatus === "fulfilled",
      detail: ctx.orderStatus === "cancelled" ? "Order was cancelled" : ctx.orderStatus === "pending" ? "Order hasn't shipped" : "Order shipped to the customer",
    },
    {
      key: "window",
      label: `Within ${policy.returnWindowDays}-day window`,
      severity: "hard",
      pass: ctx.days_since_delivery <= policy.returnWindowDays,
      detail: `${ctx.days_since_delivery} day${ctx.days_since_delivery === 1 ? "" : "s"} since delivery`,
    },
    {
      key: "category",
      label: "Returnable category",
      severity: "hard",
      pass: badCats.length === 0,
      detail: badCats.length ? `${badCats.join(", ")} can't be returned` : "No restricted categories",
    },
    {
      key: "value",
      label: `Value up to ${money(policy.autoApproveMaxMinor)}`,
      severity: "soft",
      pass: ctx.valueMinor <= policy.autoApproveMaxMinor,
      detail: `Request value ${money(ctx.valueMinor)}`,
    },
    {
      key: "history",
      label: `Fewer than ${policy.maxReturnsPer90Days} earlier returns in 90 days`,
      severity: "soft",
      pass: ctx.customer_returns_90d < policy.maxReturnsPer90Days,
      detail: `${ctx.customer_returns_90d} earlier return${ctx.customer_returns_90d === 1 ? "" : "s"} in 90 days`,
    },
    {
      key: "evidence",
      label: "Photos for damage claims",
      severity: "soft",
      pass: !policy.requirePhotoForDamage || ctx.has_photos || !ctx.reason.some((r) => EVIDENCE_REASONS.has(r)),
      detail: ctx.has_photos ? "Photos attached" : ctx.reason.some((r) => EVIDENCE_REASONS.has(r)) ? "Damage claimed without photos" : "Not required for this reason",
    },
  ];

  const flags: string[] = [];
  if (!checks.find((c) => c.key === "history")!.pass) flags.push("Frequent returner");

  const matchedRules: MatchedRule[] = [];
  for (const r of rules) {
    const conditions = JSON.parse(r.conditions) as Condition[];
    if (ruleMatches({ match: r.match, conditions }, ctx)) matchedRules.push({ id: r.id, name: r.name, action: r.action as Action, note: r.actionNote });
  }
  const has = (a: Action) => matchedRules.find((m) => m.action === a);
  let holdRefund = false;
  for (const m of matchedRules) {
    if (m.action === "flag") flags.push(m.note || m.name);
    if (m.action === "hold_refund") {
      holdRefund = true;
      flags.push("Refund on hold until inspection");
    }
  }

  const hardFail = checks.find((c) => !c.pass && c.severity === "hard");
  const softFails = checks.filter((c) => !c.pass && c.severity === "soft");

  let outcome: Outcome;
  let requiresManager = false;
  let reason: string;
  if (hardFail) {
    outcome = "auto_reject";
    reason =
      hardFail.key === "window"
        ? `Outside the ${policy.returnWindowDays}-day return window (${ctx.days_since_delivery} days since delivery)`
        : hardFail.key === "category"
          ? `${badCats.join(", ")} items can't be returned`
          : hardFail.detail;
  } else if (has("auto_reject")) {
    const r = has("auto_reject")!;
    outcome = "auto_reject";
    reason = r.note || `Rule: ${r.name}`;
  } else if (has("require_manager")) {
    const r = has("require_manager")!;
    outcome = "review";
    requiresManager = true;
    reason = r.note || `Rule: ${r.name}`;
  } else if (has("flag")) {
    outcome = "review";
    reason = `Flagged by rule: ${has("flag")!.name}`;
  } else if (has("auto_approve")) {
    outcome = "auto_approve";
    reason = `Rule: ${has("auto_approve")!.name}`;
  } else if (softFails.length) {
    outcome = "review";
    reason = softFails.map((c) => c.detail).join("; ");
  } else {
    outcome = "auto_approve";
    reason = "All policy checks passed";
  }

  return { outcome, requiresManager, holdRefund, flags: [...new Set(flags)], checks, matchedRules, reason };
}

export const actionLabel = (a: string) => ACTIONS[a as Action] ?? a;

export function parseList(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
