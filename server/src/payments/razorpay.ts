import { randomToken } from "../lib/crypto.js";

/**
 * Razorpay refunds (https://razorpay.com/docs/api/refunds/).
 *
 *   POST /v1/payments/{payment_id}/refund   Basic auth key_id:key_secret
 *
 * Test mode simulates the gateway so the refund flow can be exercised
 * end to end before live keys are connected; its references are prefixed
 * `rfnd_test_` and marked as test refunds everywhere they appear.
 */
export type RazorpayConfig = { keyId: string; keySecret: string };
export type RefundResult = { id: string; status: "processed" | "pending" | "failed"; amountMinor: number };

const base = () => process.env.RAZORPAY_API_BASE ?? "https://api.razorpay.com";
const authHeader = (cfg: RazorpayConfig) => `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`;

export async function verifyRazorpay(cfg: RazorpayConfig) {
  const res = await fetch(`${base()}/v1/payments?count=1`, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401) throw new Error("Razorpay rejected these API keys");
  if (!res.ok) throw new Error(`Razorpay returned ${res.status}`);
  return { mode: cfg.keyId.startsWith("rzp_live_") ? "live" : "test" };
}

export async function refundPayment(cfg: RazorpayConfig, paymentId: string, amountMinor: number, notes: Record<string, string>): Promise<RefundResult> {
  const res = await fetch(`${base()}/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { Authorization: authHeader(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountMinor, speed: "normal", notes }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; status?: string; amount?: number; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.description ?? `Razorpay refund failed (${res.status})`);
  return { id: body.id, status: (body.status as RefundResult["status"]) ?? "pending", amountMinor: body.amount ?? amountMinor };
}

export function simulateRefund(amountMinor: number): RefundResult {
  return { id: `rfnd_test_${randomToken(10).replace(/[^A-Za-z0-9]/g, "")}`, status: "processed", amountMinor };
}
