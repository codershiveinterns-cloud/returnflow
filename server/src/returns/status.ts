/**
 * Return lifecycle. Milestone 1 creates returns in `requested`; the approval
 * workflow (M2), inspection (M3) and refunds (M3) move them forward through
 * the transitions below. `tone` drives the shared colour language in the UI:
 *   review → amber, progress → blue, negative → red, done → green.
 */
export const RETURN_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "pickup_scheduled",
  "in_transit",
  "received",
  "inspected",
  "refunded",
  "replaced",
  "closed",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["pickup_scheduled", "closed"],
  rejected: ["closed"],
  pickup_scheduled: ["in_transit", "closed"],
  in_transit: ["received"],
  received: ["inspected"],
  inspected: ["refunded", "replaced", "closed"],
  refunded: ["closed"],
  replaced: ["closed"],
  closed: [],
};

export const RESOLUTIONS = ["refund", "store_credit", "replacement"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
