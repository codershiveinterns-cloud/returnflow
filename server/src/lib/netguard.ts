import dns from "node:dns/promises";
import net from "node:net";

/**
 * Blocks server-side requests to private, loopback and link-local networks
 * (SSRF). Applied to merchant-configured URLs such as the messaging hook.
 * Disabled outside production so local relays can be used in development.
 */
function isPrivate(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

export async function assertPublicUrl(raw: string, enforce = process.env.NODE_ENV === "production") {
  const url = new URL(raw);
  if (url.protocol !== "https:" && enforce) throw new Error("Use an https:// URL");
  if (!enforce) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivate)) throw new Error("That address points to a private network and can't be used");
}

export const __test = { isPrivate };
