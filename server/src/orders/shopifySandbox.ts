import type { ShopifyOrder } from "./shopify.js";

/**
 * Sandbox store: produces realistic Shopify order payloads so a workspace can
 * be demoed before the merchant hands over real store credentials. Payloads go
 * through the exact same mapper + ingest path as live Shopify data.
 */
const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Isha", "Arjun", "Saanvi", "Vihaan", "Anika", "Nikhil", "Tara", "Farhan", "Leela", "Dev"];
const LAST = ["Sharma", "Iyer", "Kapoor", "Menon", "Gupta", "Nair", "Reddy", "Bose", "Khan", "Joshi", "Pillai", "Das"];
const CITIES = [["Bengaluru", "Karnataka", "560001"], ["Mumbai", "Maharashtra", "400050"], ["Pune", "Maharashtra", "411001"], ["Delhi", "Delhi", "110017"], ["Hyderabad", "Telangana", "500032"], ["Chennai", "Tamil Nadu", "600040"]];
const CATALOG = [
  { sku: "KRT-LIN", title: "Linen Kurta", type: "Apparel", price: 1899, variants: ["S / Indigo", "M / Indigo", "L / Sand", "XL / Sand"] },
  { sku: "SHR-OXF", title: "Oxford Shirt", type: "Apparel", price: 1599, variants: ["M / White", "L / Sky", "XL / White"] },
  { sku: "DRS-MID", title: "Tiered Midi Dress", type: "Apparel", price: 2799, variants: ["XS / Rust", "S / Rust", "M / Olive"] },
  { sku: "SNK-CNV", title: "Canvas Sneakers", type: "Footwear", price: 2499, variants: ["UK 7 / White", "UK 8 / White", "UK 9 / Black"] },
  { sku: "BAG-TOT", title: "Leather Tote", type: "Bags", price: 4299, variants: ["Tan", "Black"] },
  { sku: "DUP-SLK", title: "Silk Dupatta", type: "Accessories", price: 749, variants: ["Rust", "Teal"] },
  { sku: "WTC-MIN", title: "Minimal Analog Watch", type: "Accessories", price: 5499, variants: ["Steel", "Gold"] },
  { sku: "JNS-SLM", title: "Slim Fit Jeans", type: "Apparel", price: 2199, variants: ["30", "32", "34"] },
];

const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

export function sandboxOrders(count: number, startNumber: number): ShopifyOrder[] {
  const out: ShopifyOrder[] = [];
  for (let i = 0; i < count; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const [city, province, zip] = pick(CITIES);
    const created = new Date(Date.now() - Math.floor(Math.random() * 20 * 864e5));
    const lines = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, (_, j) => {
      const p = pick(CATALOG);
      const variant = pick(p.variants);
      return { id: Number(`${startNumber + i}${j}`), sku: `${p.sku}-${variant.replace(/[^A-Za-z0-9]+/g, "").toUpperCase()}`, title: p.title, variant_title: variant, quantity: Math.random() < 0.85 ? 1 : 2, price: p.price.toFixed(2), product_type: p.type };
    });
    const total = lines.reduce((s, l) => s + Number(l.price) * l.quantity, 0);
    const roll = Math.random();
    const delivered = roll < 0.7;
    out.push({
      id: 5_000_000_000 + startNumber + i,
      name: `#${startNumber + i}`,
      email: `${first}.${last}${Math.floor(Math.random() * 90 + 10)}@example.com`.toLowerCase(),
      phone: `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      created_at: created.toISOString(),
      cancelled_at: roll > 0.96 ? created.toISOString() : null,
      currency: "INR",
      total_price: total.toFixed(2),
      financial_status: "paid",
      fulfillment_status: roll < 0.9 ? "fulfilled" : null,
      payment_gateway_names: [Math.random() < 0.3 ? "Cash on Delivery (COD)" : "razorpay"],
      customer: { id: 7_000_000 + startNumber + i, first_name: first, last_name: last },
      shipping_address: { name: `${first} ${last}`, city, province, zip, country: "India" },
      line_items: lines,
      fulfillments: delivered ? [{ shipment_status: "delivered", updated_at: new Date(created.getTime() + 4 * 864e5).toISOString() }] : [],
    });
  }
  return out;
}
