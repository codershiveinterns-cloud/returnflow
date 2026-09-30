export const RETURN_REASONS = [
  { code: "size_issue", label: "Doesn't fit", hint: "Too small, too large, or the cut isn't right", photoRecommended: false },
  { code: "defective", label: "Damaged or defective", hint: "Arrived broken, torn, stained or not working", photoRecommended: true },
  { code: "wrong_item", label: "Received the wrong item", hint: "Different product, size or colour than ordered", photoRecommended: true },
  { code: "not_as_described", label: "Not as described", hint: "Looks or feels different from the listing", photoRecommended: true },
  { code: "changed_mind", label: "Changed my mind", hint: "No longer needed or ordered by mistake", photoRecommended: false },
  { code: "other", label: "Something else", hint: "Tell us what happened", photoRecommended: false },
] as const;

export type ReasonCode = (typeof RETURN_REASONS)[number]["code"];
export const REASON_CODES = RETURN_REASONS.map((r) => r.code) as [ReasonCode, ...ReasonCode[]];
