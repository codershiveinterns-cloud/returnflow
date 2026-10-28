import { env } from "../env.js";
import { SHOPIFY_API_VERSION, type ShopifyConfig } from "../orders/shopify.js";

/**
 * Restock sync to Shopify via the Admin GraphQL API:
 *   1. find the variant's inventory item by SKU
 *   2. pick the shop's primary location
 *   3. inventoryAdjustQuantities (+qty, reason "restock")
 */
const base = (shop: string) => env.SHOPIFY_API_BASE ?? `https://${shop}`;

async function gql<T>(cfg: ShopifyConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${base(cfg.shopDomain)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": cfg.accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Shopify returned ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data as T;
}

export async function restockOnShopify(cfg: ShopifyConfig, sku: string, quantity: number) {
  const found = await gql<{ productVariants: { nodes: { inventoryItem: { id: string } }[] }; locations: { nodes: { id: string; name: string }[] } }>(
    cfg,
    `query($q: String!) { productVariants(first: 1, query: $q) { nodes { inventoryItem { id } } } locations(first: 1) { nodes { id name } } }`,
    { q: `sku:${sku}` },
  );
  const item = found.productVariants.nodes[0]?.inventoryItem.id;
  const location = found.locations.nodes[0];
  if (!item) throw new Error(`SKU ${sku} not found in Shopify`);
  if (!location) throw new Error("No Shopify location to restock into");
  const res = await gql<{ inventoryAdjustQuantities: { userErrors: { message: string }[] } }>(
    cfg,
    `mutation($input: InventoryAdjustQuantitiesInput!) { inventoryAdjustQuantities(input: $input) { userErrors { message } } }`,
    { input: { reason: "restock", name: "available", changes: [{ delta: quantity, inventoryItemId: item, locationId: location.id }] } },
  );
  const errs = res.inventoryAdjustQuantities.userErrors;
  if (errs.length) throw new Error(errs[0].message);
  return `+${quantity} at ${location.name}`;
}
