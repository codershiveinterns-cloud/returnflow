const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "UGX"]);

export function money(minor: number, currency = "INR", opts: { compact?: boolean } = {}) {
  const major = minor / (ZERO_DECIMAL.has(currency) ? 1 : 100);
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.compact || Number.isInteger(major) ? 0 : 2,
    notation: opts.compact && Math.abs(major) >= 100_000 ? "compact" : "standard",
  }).format(major);
}

export const number = (n: number) => new Intl.NumberFormat("en-IN").format(n);
export const percent = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export function date(value: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", opts).format(new Date(value));
}

export const dateTime = (value: string | Date) => date(value, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function relative(value: string | Date) {
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return date(value);
}

export const initials = (name?: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
