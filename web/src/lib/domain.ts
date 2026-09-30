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
