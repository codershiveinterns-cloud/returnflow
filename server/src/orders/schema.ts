import { z } from "zod";

/**
 * The canonical order shape. Every sync source — REST API, signed webhook,
 * CSV upload, Shopify — is mapped into this before it touches the database,
 * so validation and upsert rules live in exactly one place.
 *
 * Amounts are in major units (e.g. 1299.00) as merchants think about them;
 * they are converted to integer minor units during ingest.
 */
export const ORDER_STATUSES = ["pending", "fulfilled", "delivered", "cancelled"] as const;

const optionalText = (max: number) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(max).optional());

export const orderItemInput = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(80),
  name: z.string().trim().min(1, "Product name is required").max(200),
  variant: optionalText(120),
  category: optionalText(80),
  quantity: z.coerce.number().int("Quantity must be a whole number").positive("Quantity must be at least 1").max(10_000),
  unit_price: z.coerce.number().nonnegative("Price can't be negative").max(100_000_000),
  image_url: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().url().max(500).optional()),
  external_id: optionalText(128),
});

export const orderInput = z.object({
  order_number: z
    .string()
    .trim()
    .min(1, "Order number is required")
    .max(64)
    .transform((s) => s.replace(/^#/, "")),
  external_id: optionalText(128),
  placed_at: z.coerce.date({ message: "placed_at must be a valid date" }),
  status: z.enum(ORDER_STATUSES).default("fulfilled"),
  payment_method: z.enum(["prepaid", "cod"]).default("prepaid"),
  currency: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().length(3).toUpperCase().optional()),
  delivered_at: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional()),
  total: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().nonnegative().optional()),
  customer: z.object({
    email: z.string().trim().toLowerCase().email("Customer email is not valid"),
    name: optionalText(120),
    phone: optionalText(32),
    external_id: optionalText(128),
  }),
  shipping_address: z.record(z.string(), z.unknown()).optional(),
  items: z.array(orderItemInput).min(1, "An order needs at least one item").max(250),
});

export type OrderInput = z.infer<typeof orderInput>;
export type OrderSource = "shopify" | "api" | "webhook" | "csv";

export const normalizeOrderNumber = (value: string) => value.trim().replace(/^#/, "");
