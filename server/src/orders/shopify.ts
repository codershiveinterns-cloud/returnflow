import { env } from "../env.js";
import type { OrderInput } from "./schema.js";

/**
 * Shopify Admin REST integration (custom app, Admin API access token).
 *
 *  - `verifyShop`   checks the token against /shop.json when connecting
 *  - `fetchOrders`  pulls orders updated since the last cursor, following
 *                   Link-header pagination
 *  - `mapShopifyOrder` converts Shopify's order JSON into the canonical shape;
 *                   webhooks (orders/create, orders/updated) reuse it
 */
export const SHOPIFY_API_VERSION = "2025-07";

export type ShopifyConfig = { shopDomain: string; accessToken: string; apiSecret: string };

export function normalizeShopDomain(input: string) {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return d.includes(".") ? d : `${d}.myshopify.com`;
}

const baseUrl = (shop: string) => env.SHOPIFY_API_BASE ?? `https://${shop}`;

async function shopifyFetch(cfg: ShopifyConfig, pathOrUrl: string) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl(cfg.shopDomain)}/admin/api/${SHOPIFY_API_VERSION}${pathOrUrl}`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": cfg.accessToken, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Shopify rejected the access token. Check the token and that the app has read_orders access.");
  if (res.status === 404) throw new Error("Shop not found. Check the store domain.");
  if (!res.ok) throw new Error(`Shopify returned ${res.status}`);
  return res;
}

export async function verifyShop(cfg: ShopifyConfig) {
  const res = await shopifyFetch(cfg, "/shop.json");
  const body = (await res.json()) as { shop: { name: string; currency: string; myshopify_domain: string } };
  return body.shop;
}

export async function fetchOrders(cfg: ShopifyConfig, updatedSince?: string, maxPages = 20) {
  const params = new URLSearchParams({ status: "any", limit: "250", order: "updated_at asc" });
  if (updatedSince) params.set("updated_at_min", updatedSince);
  let next: string | null = `/orders.json?${params}`;
  const orders: ShopifyOrder[] = [];
  for (let page = 0; next && page < maxPages; page++) {
    const res = await shopifyFetch(cfg, next);
    const body = (await res.json()) as { orders: ShopifyOrder[] };
    orders.push(...body.orders);
    next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] ?? null;
  }
  return orders;
}

export type ShopifyOrder = {
  id: number;
  name: string;
  email?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at?: string;
  cancelled_at?: string | null;
  currency: string;
  total_price: string;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  payment_gateway_names?: string[];
  customer?: { id: number; email?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  shipping_address?: Record<string, unknown> | null;
  line_items: { id: number; sku?: string | null; title: string; variant_title?: string | null; quantity: number; price: string; product_id?: number | null; variant_id?: number | null; product_type?: string | null }[];
  fulfillments?: { shipment_status?: string | null; updated_at?: string }[];
};

export function mapShopifyOrder(o: ShopifyOrder): OrderInput {
  const delivered = o.fulfillments?.find((f) => f.shipment_status === "delivered");
  const status: OrderInput["status"] = o.cancelled_at ? "cancelled" : delivered ? "delivered" : o.fulfillment_status === "fulfilled" ? "fulfilled" : "pending";
  const cod = (o.payment_gateway_names ?? []).some((g) => /cash on delivery|cod/i.test(g));
  const name = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ");
  const email = (o.email || o.contact_email || o.customer?.email || `shopify-${o.customer?.id ?? o.id}@no-email.invalid`).toLowerCase();
  return {
    order_number: o.name.replace(/^#/, ""),
    external_id: String(o.id),
    placed_at: new Date(o.created_at),
    status,
    payment_method: cod ? "cod" : "prepaid",
    currency: o.currency,
    delivered_at: delivered?.updated_at ? new Date(delivered.updated_at) : undefined,
    total: Number(o.total_price),
    customer: { email, name: name || undefined, phone: o.phone ?? o.customer?.phone ?? undefined, external_id: o.customer ? String(o.customer.id) : undefined },
    shipping_address: o.shipping_address ?? undefined,
    items: o.line_items.map((li) => ({
      sku: li.sku || `SHOPIFY-${li.variant_id ?? li.product_id ?? li.id}`,
      name: li.title,
      variant: li.variant_title ?? undefined,
      category: li.product_type ?? undefined,
      quantity: li.quantity,
      unit_price: Number(li.price),
      external_id: String(li.id),
      image_url: undefined,
    })),
  };
}
