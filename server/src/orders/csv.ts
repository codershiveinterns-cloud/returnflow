import { parse } from "csv-parse/sync";
import { orderInput, type OrderInput } from "./schema.js";

/**
 * CSV import: one row per order line. Rows that share an order_number are
 * grouped into one order; order-level columns are read from the first row.
 */
export const CSV_COLUMNS = [
  "order_number",
  "placed_at",
  "status",
  "payment_method",
  "currency",
  "delivered_at",
  "customer_email",
  "customer_name",
  "customer_phone",
  "sku",
  "product_name",
  "variant",
  "category",
  "quantity",
  "unit_price",
] as const;

const REQUIRED = ["order_number", "placed_at", "customer_email", "sku", "product_name", "quantity", "unit_price"];

const ALIASES: Record<string, string> = {
  order: "order_number", order_id: "order_number", order_no: "order_number", "order #": "order_number", name: "order_number",
  date: "placed_at", order_date: "placed_at", created_at: "placed_at",
  email: "customer_email", customer: "customer_name",
  phone: "customer_phone", product: "product_name", title: "product_name", item: "product_name",
  qty: "quantity", price: "unit_price", amount: "unit_price",
};

export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  "1001,2026-09-02,delivered,prepaid,INR,2026-09-06,ananya.rao@example.com,Ananya Rao,+919800000001,KRT-LIN-M-IND,Linen Kurta,M / Indigo,Apparel,1,1899",
  "1001,2026-09-02,delivered,prepaid,INR,2026-09-06,ananya.rao@example.com,Ananya Rao,+919800000001,DUP-SLK-RST,Silk Dupatta,Rust,Accessories,2,749",
  "1002,2026-09-03,fulfilled,cod,INR,,vikram.s@example.com,Vikram S,,SNK-CNV-42-WHT,Canvas Sneakers,UK 8 / White,Footwear,1,2499",
].join("\n") + "\n";

export type CsvParseResult = {
  rowCount: number;
  orders: OrderInput[];
  errors: { ref: string; message: string }[];
  missingColumns: string[];
};

export function parseOrdersCsv(content: string): CsvParseResult {
  let rows: Record<string, string>[];
  try {
    rows = parse(content.replace(/^﻿/, ""), {
      columns: (header: string[]) => header.map((h) => {
        const k = h.trim().toLowerCase().replace(/\s+/g, "_");
        return ALIASES[k] ?? ALIASES[h.trim().toLowerCase()] ?? k;
      }),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    return { rowCount: 0, orders: [], errors: [{ ref: "file", message: `Could not read CSV: ${(err as Error).message}` }], missingColumns: [] };
  }

  const present = new Set(rows.length ? Object.keys(rows[0]) : []);
  const missingColumns = REQUIRED.filter((c) => !present.has(c));
  if (!rows.length || missingColumns.length) {
    return { rowCount: rows.length, orders: [], errors: rows.length ? [] : [{ ref: "file", message: "The file has no data rows" }], missingColumns };
  }

  const groups = new Map<string, { rows: number[]; data: Record<string, string>[] }>();
  rows.forEach((row, i) => {
    const key = (row.order_number ?? "").replace(/^#/, "").trim() || `__row_${i}`;
    const g = groups.get(key) ?? { rows: [], data: [] };
    g.rows.push(i + 2); // +1 header, +1 human numbering
    g.data.push(row);
    groups.set(key, g);
  });

  const orders: OrderInput[] = [];
  const errors: CsvParseResult["errors"] = [];
  for (const [, g] of groups) {
    const head = g.data[0];
    const candidate = {
      order_number: head.order_number,
      placed_at: head.placed_at,
      status: head.status ? head.status.toLowerCase() : undefined,
      payment_method: head.payment_method ? head.payment_method.toLowerCase() : undefined,
      currency: head.currency,
      delivered_at: head.delivered_at,
      customer: { email: head.customer_email, name: head.customer_name, phone: head.customer_phone },
      items: g.data.map((r) => ({ sku: r.sku, name: r.product_name, variant: r.variant, category: r.category, quantity: r.quantity, unit_price: r.unit_price })),
    };
    const parsed = orderInput.safeParse(candidate);
    const ref = g.rows.length > 1 ? `rows ${g.rows[0]}–${g.rows.at(-1)}` : `row ${g.rows[0]}`;
    if (parsed.success) orders.push(parsed.data);
    else errors.push({ ref: `${ref}${head.order_number ? ` (#${head.order_number.replace(/^#/, "")})` : ""}`, message: parsed.error.issues.map((i) => `${humanPath(i.path)}: ${i.message}`).join("; ") });
  }
  return { rowCount: rows.length, orders, errors, missingColumns };
}

function humanPath(path: PropertyKey[]) {
  if (path[0] === "items" && typeof path[1] === "number") return `line ${path[1] + 1} ${String(path[2] ?? "")}`.trim();
  if (path[0] === "customer") return `customer_${String(path[1])}`;
  return path.map(String).join(".") || "order";
}
