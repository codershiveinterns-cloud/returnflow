export type Tone = "review" | "progress" | "danger" | "done" | "neutral";

export const RETURN_STATUS: Record<string, { label: string; tone: Tone; customer: string }> = {
  requested: { label: "Needs review", tone: "review", customer: "Request received" },
  approved: { label: "Approved", tone: "progress", customer: "Approved" },
  rejected: { label: "Rejected", tone: "danger", customer: "Not approved" },
  pickup_scheduled: { label: "Pickup scheduled", tone: "progress", customer: "Pickup scheduled" },
  in_transit: { label: "In transit", tone: "progress", customer: "On its way back" },
  received: { label: "Received", tone: "progress", customer: "Received at warehouse" },
  inspected: { label: "Inspected", tone: "progress", customer: "Inspected" },
  refunded: { label: "Refunded", tone: "done", customer: "Refunded" },
  replaced: { label: "Replaced", tone: "done", customer: "Replacement sent" },
  closed: { label: "Closed", tone: "done", customer: "Closed" },
};

/** Customer-facing journey shown on the portal tracker. */
export const JOURNEY = ["requested", "approved", "pickup_scheduled", "in_transit", "received", "inspected", "refunded"] as const;

export const REJECT_REASONS: Record<string, string> = {
  outside_window: "Outside the return window",
  used_or_damaged: "Item shows signs of use or damage",
  non_returnable: "Item isn't eligible for return",
  missing_evidence: "Not enough evidence for the claim",
  duplicate: "Duplicate request",
  other: "Other (describe)",
};

export const COURIERS = ["Delhivery", "Blue Dart", "Ecom Express", "Xpressbees", "Shadowfax", "DTDC", "India Post", "Other"];

export const CHECKPOINTS: Record<string, string> = {
  scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery to warehouse",
  delivered: "Delivered to warehouse",
  failed: "Pickup attempt failed",
};

export const SHIPMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "review" },
  in_transit: { label: "In transit", tone: "progress" },
  delivered: { label: "At warehouse", tone: "done" },
  failed: { label: "Failed", tone: "danger" },
};

export const GRADES: Record<string, { label: string; hint: string }> = {
  A: { label: "A · Like new", hint: "Resaleable as new" },
  B: { label: "B · Minor issues", hint: "Missing tag or packaging" },
  C: { label: "C · Damaged / worn", hint: "Visible damage or use" },
  D: { label: "D · Unusable", hint: "Can't be sold or repaired" },
};

export const DISPOSITIONS: Record<string, { label: string; tone: Tone }> = {
  restock: { label: "Restock", tone: "done" },
  refurbish: { label: "Refurbish", tone: "progress" },
  damaged: { label: "Damaged", tone: "review" },
  dispose: { label: "Dispose", tone: "danger" },
};

export const RISK: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Low risk", tone: "done" },
  medium: { label: "Medium risk", tone: "review" },
  high: { label: "High risk", tone: "danger" },
};

export const CHECKLIST: Record<string, { label: string; pass: string; fail: string }> = {
  packaging: { label: "Original packaging", pass: "Intact", fail: "Missing / damaged" },
  tags: { label: "Tags & labels", pass: "Attached", fail: "Missing" },
  damage: { label: "Physical damage", pass: "None found", fail: "Damaged" },
  usage: { label: "Signs of use", pass: "Unused", fail: "Worn / used" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Unfulfilled", tone: "neutral" },
  fulfilled: { label: "Shipped", tone: "progress" },
  delivered: { label: "Delivered", tone: "done" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const REASONS: Record<string, string> = {
  size_issue: "Doesn't fit",
  defective: "Damaged / defective",
  wrong_item: "Wrong item",
  not_as_described: "Not as described",
  changed_mind: "Changed mind",
  other: "Other",
};

export const RESOLUTIONS: Record<string, { label: string; short: string }> = {
  refund: { label: "Refund to original payment", short: "Refund" },
  store_credit: { label: "Store credit", short: "Store credit" },
  replacement: { label: "Replacement", short: "Replacement" },
};

export const SOURCES: Record<string, string> = { shopify: "Shopify", api: "REST API", webhook: "Webhook", csv: "CSV import" };

export const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", support: "Support Agent", warehouse: "Warehouse Staff", finance: "Finance" };

export type Permission =
  | "dashboard:view"
  | "orders:view"
  | "orders:import"
  | "returns:view"
  | "returns:decide"
  | "returns:decide_escalated"
  | "pickups:manage"
  | "rules:manage"
  | "notifications:view"
  | "inspection:perform"
  | "refunds:issue"
  | "inventory:view"
  | "risk:view"
  | "analytics:view"
  | "integrations:manage"
  | "team:view"
  | "team:manage"
  | "settings:manage"
  | "audit:view";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  brandColor: string;
  logoUrl: string | null;
  supportEmail: string | null;
  portalHeadline: string | null;
  returnWindowDays: number;
};

export type Session = {
  user: { id: string; name: string; email: string };
  organization: Organization;
  role: string;
  roleLabel: string;
  permissions: Permission[];
};
