/**
 * Return-risk scoring. Transparent, additive points so staff can see exactly
 * why a request scored high. Runs synchronously on every new request and
 * feeds the eligibility engine (risk_score is available to automation rules).
 */
export type RiskInput = {
  valueMinor: number;
  returns90d: number; // earlier non-rejected returns by this customer
  claimed90dMinor: number; // value of those returns
  changedMind90d: number; // earlier "changed mind" returns
  reasons: string[];
  hasPhotos: boolean;
  paymentMethod: string;
  daysSinceDelivery: number;
  windowDays: number;
  orderToReturnRatio: number; // returned value / order value for this request
};
export type RiskFactor = { label: string; points: number };
export type Risk = { score: number; level: "low" | "medium" | "high"; factors: RiskFactor[] };

const DAMAGE = new Set(["defective", "wrong_item", "not_as_described"]);

export function scoreRisk(i: RiskInput): Risk {
  const f: RiskFactor[] = [];
  const add = (label: string, points: number) => points > 0 && f.push({ label, points });

  if (i.returns90d >= 3) add(`${i.returns90d} earlier returns in 90 days`, 35);
  else if (i.returns90d === 2) add("2 earlier returns in 90 days", 20);
  else if (i.returns90d === 1) add("1 earlier return in 90 days", 8);

  if (i.valueMinor > 1_000_000) add("Return value above ₹10,000", 20);
  else if (i.valueMinor > 500_000) add("Return value above ₹5,000", 10);

  const claimed = i.claimed90dMinor + i.valueMinor;
  if (claimed > 2_500_000) add("Over ₹25,000 claimed in 90 days", 20);
  else if (claimed > 1_500_000) add("Over ₹15,000 claimed in 90 days", 10);

  if (i.changedMind90d >= 2 && i.reasons.includes("changed_mind")) add("Repeated change-of-mind returns", 10);
  if (!i.hasPhotos && i.reasons.some((r) => DAMAGE.has(r))) add("Damage claimed without photos", 12);
  if (i.paymentMethod === "cod") add("Cash-on-delivery order", 5);
  if (i.windowDays > 0 && i.daysSinceDelivery >= i.windowDays * 0.85) add("Requested at the end of the return window", 6);
  if (i.orderToReturnRatio >= 0.999 && i.valueMinor > 300_000) add("Returning the entire order", 6);

  const score = Math.min(100, f.reduce((s, x) => s + x.points, 0));
  return { score, level: score >= 60 ? "high" : score >= 30 ? "medium" : "low", factors: f.sort((a, b) => b.points - a.points) };
}
