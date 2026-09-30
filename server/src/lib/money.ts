/** Currencies with no minor unit. Everything else is treated as 2 decimals. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "UGX"]);

export const minorFactor = (currency: string) => (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100);

export function toMinor(amount: number | string, currency: string): number {
  const n = typeof amount === "string" ? Number(amount.replace(/[, ]/g, "")) : amount;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount "${amount}"`);
  return Math.round(n * minorFactor(currency));
}
