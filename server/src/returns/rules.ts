import { z } from "zod";

/**
 * Automation rules: IF <conditions> THEN <action>.
 *
 * Conditions are evaluated against a flat, typed context built for each
 * return request (see buildContext in eligibility.ts). Adding a new field is
 * a matter of adding it to FIELDS and populating it in the context.
 */
export const FIELDS = {
  value: { label: "Return value", type: "number", unit: "currency" },
  reason: { label: "Reason", type: "enum", options: ["size_issue", "defective", "wrong_item", "not_as_described", "changed_mind", "other"] },
  category: { label: "Product category", type: "text" },
  customer_returns_90d: { label: "Customer's returns (90 days)", type: "number" },
  days_since_delivery: { label: "Days since delivery", type: "number" },
  payment_method: { label: "Payment method", type: "enum", options: ["prepaid", "cod"] },
  item_count: { label: "Items in request", type: "number" },
  resolution: { label: "Requested outcome", type: "enum", options: ["refund", "store_credit", "replacement"] },
  has_photos: { label: "Photos attached", type: "boolean" },
} as const;
export type Field = keyof typeof FIELDS;

export const OPS = {
  number: ["gt", "gte", "lt", "lte", "eq"],
  enum: ["is", "is_not"],
  text: ["is", "is_not", "contains"],
  boolean: ["is"],
} as const;

export const ACTIONS = {
  auto_approve: "Approve automatically",
  auto_reject: "Reject automatically",
  require_manager: "Require manager approval",
  flag: "Flag for review",
  hold_refund: "Hold refund until inspection",
} as const;
export type Action = keyof typeof ACTIONS;

export const conditionSchema = z.object({
  field: z.enum(Object.keys(FIELDS) as [Field, ...Field[]]),
  op: z.enum(["gt", "gte", "lt", "lte", "eq", "is", "is_not", "contains"]),
  value: z.union([z.string().max(80), z.number(), z.boolean()]),
});
export type Condition = z.infer<typeof conditionSchema>;

export const ruleInput = z.object({
  name: z.string().trim().min(2, "Give the rule a name").max(80),
  enabled: z.boolean().default(true),
  priority: z.coerce.number().int().min(1).max(999).default(100),
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(conditionSchema).min(1, "Add at least one condition").max(8),
  action: z.enum(Object.keys(ACTIONS) as [Action, ...Action[]]),
  actionNote: z.string().trim().max(200).optional(),
});
export type RuleInput = z.infer<typeof ruleInput>;

export type RuleContext = {
  value: number; // major units
  reason: string[];
  category: string[];
  customer_returns_90d: number;
  days_since_delivery: number;
  payment_method: string;
  item_count: number;
  resolution: string;
  has_photos: boolean;
};

function compare(op: Condition["op"], actual: number | string | boolean, expected: number | string | boolean) {
  switch (op) {
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "eq": return Number(actual) === Number(expected);
    case "is": return typeof expected === "boolean" ? Boolean(actual) === expected : String(actual).toLowerCase() === String(expected).toLowerCase();
    case "is_not": return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case "contains": return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  }
}

/** Multi-valued fields (reason, category) match if ANY item matches; `is_not` requires that NONE do. */
export function conditionMatches(c: Condition, ctx: RuleContext) {
  const actual = ctx[c.field];
  if (Array.isArray(actual)) {
    if (c.op === "is_not") return actual.every((a) => compare("is_not", a, c.value));
    return actual.some((a) => compare(c.op, a, c.value));
  }
  return compare(c.op, actual, c.value);
}

export function ruleMatches(rule: { match: string; conditions: Condition[] }, ctx: RuleContext) {
  return rule.match === "any" ? rule.conditions.some((c) => conditionMatches(c, ctx)) : rule.conditions.every((c) => conditionMatches(c, ctx));
}

export function describeCondition(c: Condition) {
  const f = FIELDS[c.field];
  const op = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", is: "is", is_not: "is not", contains: "contains" }[c.op];
  return `${f.label} ${op} ${String(c.value)}`;
}
