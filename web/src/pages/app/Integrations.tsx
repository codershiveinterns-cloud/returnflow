import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, Eye, FileSpreadsheet, KeyRound, RefreshCw, RotateCw, ShoppingBag, Trash2, UploadCloud, Webhook, FlaskConical } from "lucide-react";
import clsx from "clsx";
import { api, ApiError, errorMessage } from "@/lib/api";
import { ORDER_STATUS, SOURCES } from "@/lib/domain";
import { date, dateTime, money, relative } from "@/lib/format";
import { Badge, Code } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { CopyButton, Tabs } from "@/components/ui/misc";

type IntegrationsData = {
  shopify: null | { id: string; mode: "live" | "sandbox"; status: string; displayName: string; shopDomain: string; lastSyncedAt: string | null; lastError: string | null; webhookUrl: string; createdAt: string };
  webhook: { url: string; secretPreview: string };
  api: { baseUrl: string; keys: { id: string; name: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }[] };
  lastActivity: Record<string, string>;
};

type Tab = "shopify" | "csv" | "api" | "webhook" | "history";

export function SyncStatus({ status }: { status: string }) {
  const map: Record<string, [string, "done" | "review" | "danger" | "progress"]> = {
    success: ["Synced", "done"],
    partial: ["Partial", "review"],
    failed: ["Failed", "danger"],
    running: ["Running", "progress"],
  };
  const [label, tone] = map[status] ?? [status, "progress"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function IntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "shopify";
  const { data } = useQuery({ queryKey: ["integrations"], queryFn: () => api<IntegrationsData>("/integrations") });

  return (
    <>
      <PageHeader title="Order sync" description="Bring orders in from your store so every return links back to the original order and SKU. Use any mix of sources — orders are matched on order number, so re-syncs never duplicate." />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        items={[
          { id: "shopify", label: "Shopify" },
          { id: "csv", label: "CSV upload" },
          { id: "api", label: "REST API" },
          { id: "webhook", label: "Webhook" },
          { id: "history", label: "Sync history" },
        ]}
      />
      <div className="mt-6">
        {!data ? (
          <Skeleton className="h-64" />
        ) : tab === "shopify" ? (
          <ShopifyPanel data={data} />
        ) : tab === "csv" ? (
          <CsvPanel />
        ) : tab === "api" ? (
          <ApiPanel data={data} />
        ) : tab === "webhook" ? (
          <WebhookPanel data={data} />
        ) : (
          <HistoryPanel />
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Shopify

function ShopifyPanel({ data }: { data: IntegrationsData }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [connectOpen, setConnectOpen] = useState(false);
  const s = data.shopify;
  const refresh = () => ["integrations", "orders", "dashboard", "sync-runs"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const sync = useMutation({
    mutationFn: () => api<{ created: number; updated: number; failed: number }>("/integrations/shopify/sync", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`Sync complete — ${r.created} new, ${r.updated} updated${r.failed ? `, ${r.failed} failed` : ""}`);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      refresh();
    },
  });
  const disconnect = useMutation({
    mutationFn: () => api("/integrations/shopify", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Shopify disconnected");
      refresh();
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        {s ? (
          <>
            <div className="flex flex-wrap items-start gap-4 p-5">
              <div className="grid place-items-center size-11 rounded-xl bg-[#eef3e6] text-[#3d6b1f] shrink-0">
                <ShoppingBag className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[16px] font-semibold">{s.displayName}</h2>
                  {s.mode === "sandbox" ? <Badge tone="review">Test mode</Badge> : <Badge tone="done">Live</Badge>}
                  {s.status === "error" && <Badge tone="danger">Needs attention</Badge>}
                </div>
                <div className="mt-0.5 font-mono text-[12.5px] text-muted">{s.shopDomain}</div>
                <div className="mt-2 text-[13px] text-muted">{s.lastSyncedAt ? `Last synced ${relative(s.lastSyncedAt)}` : "Not synced yet"}</div>
              </div>
              <Button icon={<RefreshCw className={clsx("size-4", sync.isPending && "animate-spin")} />} onClick={() => sync.mutate()} disabled={sync.isPending}>
                {sync.isPending ? "Syncing…" : "Sync now"}
              </Button>
            </div>
            {s.lastError && (
              <div className="mx-5 mb-4 flex gap-2 rounded-lg bg-danger-bg text-danger px-3.5 py-2.5 text-[13px]">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" /> {s.lastError}
              </div>
            )}
            {s.mode === "sandbox" && (
              <div className="mx-5 mb-4 flex gap-2.5 rounded-lg bg-kraft-soft/60 text-kraft-ink px-3.5 py-3 text-[13px]">
                <FlaskConical className="size-4 shrink-0 mt-0.5" />
                <span>Test mode creates sample Shopify orders so you can try returns end to end. Connect your store whenever you're ready — imported orders are kept.</span>
              </div>
            )}
            <div className="border-t border-line px-5 py-4">
              <div className="text-[12.5px] font-medium text-ink-2 mb-1.5">Webhook endpoint for real-time updates</div>
              <div className="flex items-center gap-2 rounded-lg bg-paper border border-line px-3 h-10">
                <code className="flex-1 truncate font-mono text-[12px] text-ink-2">{s.webhookUrl}</code>
                <CopyButton value={s.webhookUrl} />
              </div>
              <p className="mt-2 text-[12.5px] text-muted">
                In Shopify admin → Settings → Notifications → Webhooks, add <Code>orders/create</Code> and <Code>orders/updated</Code> pointing here. Payloads are verified with your app's API secret.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 bg-paper/50 rounded-b-[var(--radius-card)]">
              <span className="text-[12.5px] text-muted">Connected {date(s.createdAt)}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConnectOpen(true)}>
                  {s.mode === "sandbox" ? "Connect live store" : "Update credentials"}
                </Button>
                <Button variant="danger" size="sm" loading={disconnect.isPending} onClick={() => confirm("Disconnect Shopify? Imported orders are kept.") && disconnect.mutate()}>
                  Disconnect
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<ShoppingBag className="size-5" />}
            title="Connect your Shopify store"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setConnectOpen(true)}>Connect store</Button>
              </div>
            }
          >
            Pull historical orders and keep them updated in real time. Uses a Shopify custom app with read-only order access.
          </EmptyState>
        )}
      </Card>

      <Card className="p-5 h-fit">
        <h3 className="text-[14px] font-semibold">What gets imported</h3>
        <ul className="mt-3 space-y-2.5 text-[13.5px] text-ink-2">
          {["Order number, dates, payment method (COD detected)", "Customer name, email and phone", "Line items with SKU, variant, quantity and price", "Fulfilment and delivery status", "Cancellations"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <CheckCircle2 className="size-4 text-done shrink-0 mt-0.5" /> {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12.5px] text-muted">Access tokens and secrets are encrypted at rest (AES-256-GCM) and never shown again after saving.</p>
      </Card>

      <ShopifyConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} hasSandbox={!s} onDone={refresh} />
    </div>
  );
}

function ShopifyConnectModal({ open, onClose, hasSandbox, onDone }: { open: boolean; onClose: () => void; hasSandbox: boolean; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ shopDomain: "", accessToken: "", apiSecret: "" });
  const connect = useMutation({
    mutationFn: (body: object) => api<{ displayName: string }>("/integrations/shopify", { method: "POST", body }),
    onSuccess: (r) => {
      toast.success(`Connected to ${r.displayName}`);
      onDone();
      onClose();
    },
  });
  const err = connect.error instanceof ApiError ? connect.error : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect Shopify"
      description="Create a custom app in Shopify admin (Settings → Apps → Develop apps) with the read_orders scope, install it, then paste its credentials."
      footer={
        <>
          {hasSandbox && (
            <Button variant="ghost" className="mr-auto" onClick={() => connect.mutate({ mode: "sandbox" })} disabled={connect.isPending} icon={<FlaskConical className="size-4" />}>
              Use a test store
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={connect.isPending} onClick={() => connect.mutate({ mode: "live", ...form })}>
            Verify & connect
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && !err.fields && <div className="rounded-lg bg-danger-bg text-danger text-[13px] px-3.5 py-2.5">{err.message}</div>}
        <Input label="Store domain" placeholder="your-store.myshopify.com" value={form.shopDomain} onChange={(e) => setForm({ ...form, shopDomain: e.target.value })} error={err?.fieldError("shopDomain")} />
        <Input label="Admin API access token" placeholder="shpat_…" type="password" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} error={err?.fieldError("accessToken")} />
        <Input label="API secret key" hint="Used to verify webhook signatures." type="password" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} error={err?.fieldError("apiSecret")} />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ CSV

type Preview = {
  fileName: string;
  rowCount: number;
  orderCount: number;
  itemCount: number;
  newCount: number;
  updateCount: number;
  errors: { ref: string; message: string }[];
  sample: { orderNumber: string; placedAt: string; status: string; customer: string; email: string; items: number; currency: string | null; total: number; exists: boolean }[];
};

function CsvPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; failed: number; errors: Preview["errors"] } | null>(null);

  const send = (f: File, commit: boolean) => {
    const fd = new FormData();
    fd.append("file", f);
    if (commit) fd.append("commit", "true");
    return api<any>("/orders/import", { method: "POST", body: fd });
  };

  const check = useMutation({
    mutationFn: (f: File) => send(f, false) as Promise<Preview>,
    onSuccess: (p) => setPreview(p),
    onError: () => setPreview(null),
  });
  const commit = useMutation({
    mutationFn: () => send(file!, true),
    onSuccess: (r) => {
      setResult(r);
      setPreview(null);
      toast.success(`Imported ${r.created + r.updated} orders`);
      ["orders", "dashboard", "sync-runs", "integrations"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    check.mutate(f);
  };
  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    check.reset();
    if (input.current) input.current.value = "";
  };
  const checkErr = check.error instanceof ApiError ? check.error : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        {!preview && !result && (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={clsx(
              "flex flex-col items-center justify-center text-center rounded-[var(--radius-card)] border-2 border-dashed px-6 py-14 cursor-pointer transition-colors",
              drag ? "border-ink bg-surface" : "border-line-strong bg-surface/60 hover:bg-surface hover:border-faint",
            )}
          >
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            <div className="grid place-items-center size-11 rounded-xl bg-paper-2 text-muted mb-3">{check.isPending ? <RefreshCw className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}</div>
            <div className="text-[14.5px] font-medium">{check.isPending ? `Checking ${file?.name}…` : "Drop a CSV here, or click to choose"}</div>
            <div className="mt-1 text-[13px] text-muted">One row per order line · up to 5 MB · nothing is saved until you confirm</div>
          </label>
        )}

        {checkErr && (
          <div className="rounded-lg bg-danger-bg text-danger px-4 py-3 text-[13.5px] flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{checkErr.message}</div>
              <button onClick={reset} className="mt-1 underline underline-offset-2">
                Choose another file
              </button>
            </div>
          </div>
        )}

        {preview && (
          <Card className="overflow-hidden animate-rise">
            <CardHeader
              title={<span className="flex items-center gap-2"><FileSpreadsheet className="size-4 text-muted" /> {preview.fileName}</span>}
              description={`${preview.rowCount} rows → ${preview.orderCount} orders, ${preview.itemCount} line items`}
              action={<Button variant="ghost" size="sm" onClick={reset}>Choose another</Button>}
            />
            <div className="grid grid-cols-3 gap-px bg-line border-y border-line">
              <Stat label="New orders" value={preview.newCount} />
              <Stat label="Will update" value={preview.updateCount} />
              <Stat label="Rows with problems" value={preview.errors.length} danger={preview.errors.length > 0} />
            </div>
            {preview.sample.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-muted text-[12px]">
                      <th className="font-medium px-5 py-2.5">Order</th>
                      <th className="font-medium px-3 py-2.5">Customer</th>
                      <th className="font-medium px-3 py-2.5">Status</th>
                      <th className="font-medium px-3 py-2.5 text-right">Items</th>
                      <th className="font-medium px-5 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.sample.map((o) => (
                      <tr key={o.orderNumber}>
                        <td className="px-5 py-2.5 font-mono text-[12px]">
                          #{o.orderNumber} {o.exists && <span className="ml-1 font-sans text-[11px] text-review">update</span>}
                        </td>
                        <td className="px-3 py-2.5 truncate max-w-[180px]">{o.customer}</td>
                        <td className="px-3 py-2.5">{ORDER_STATUS[o.status]?.label}</td>
                        <td className="px-3 py-2.5 text-right tabular">{o.items}</td>
                        <td className="px-5 py-2.5 text-right tabular">{money(Math.round(o.total * 100), o.currency ?? "INR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.orderCount > preview.sample.length && <div className="px-5 py-2 text-[12px] text-faint border-t border-line">and {preview.orderCount - preview.sample.length} more…</div>}
              </div>
            )}
            <ErrorList errors={preview.errors} />
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-line bg-paper/50">
              <span className="text-[12.5px] text-muted">{preview.errors.length ? "Rows with problems will be skipped." : "Everything looks good."}</span>
              <Button loading={commit.isPending} disabled={!preview.orderCount} onClick={() => commit.mutate()}>
                Import {preview.orderCount} order{preview.orderCount === 1 ? "" : "s"}
              </Button>
            </div>
          </Card>
        )}

        {result && (
          <Card className="p-6 animate-rise">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 text-done mt-0.5" />
              <div className="flex-1">
                <div className="text-[15px] font-semibold">Import finished</div>
                <p className="mt-0.5 text-[13.5px] text-muted">
                  {result.created} new, {result.updated} updated{result.failed ? `, ${result.failed} skipped` : ""}.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={reset}>
                Import another
              </Button>
            </div>
            {result.errors.length > 0 && <div className="mt-4 -mx-6 -mb-6"><ErrorList errors={result.errors} /></div>}
          </Card>
        )}
      </div>

      <Card className="p-5 h-fit">
        <h3 className="text-[14px] font-semibold">File format</h3>
        <p className="mt-1 text-[13px] text-muted">Rows sharing an order number become one order. Common header names (Order ID, Qty, Price…) are recognised automatically.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {["order_number", "placed_at", "customer_email", "sku", "product_name", "quantity", "unit_price"].map((c) => (
            <span key={c} className="font-mono text-[11.5px] px-1.5 py-0.5 rounded bg-ink text-white">{c}</span>
          ))}
          {["status", "payment_method", "currency", "delivered_at", "customer_name", "customer_phone", "variant", "category"].map((c) => (
            <span key={c} className="font-mono text-[11.5px] px-1.5 py-0.5 rounded bg-paper-2 text-ink-2">{c}</span>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-faint">Dark = required. Status: pending, fulfilled, delivered, cancelled.</p>
        <a href="/api/orders/import/template.csv" className="mt-4 inline-flex items-center gap-2 h-8 px-3 rounded-md border border-line-strong text-[13px] font-medium hover:bg-paper">
          <Download className="size-4" /> Download template
        </a>
      </Card>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="bg-surface px-5 py-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={clsx("text-[20px] font-semibold tabular", danger && "text-danger")}>{value}</div>
    </div>
  );
}

function ErrorList({ errors }: { errors: { ref: string; message: string }[] }) {
  if (!errors.length) return null;
  return (
    <div className="border-t border-line bg-danger-bg/40 px-5 py-3 max-h-56 overflow-y-auto scrollbar-thin">
      <div className="text-[12.5px] font-medium text-danger mb-1.5">
        {errors.length} problem{errors.length > 1 ? "s" : ""}
      </div>
      <ul className="space-y-1 text-[12.5px]">
        {errors.map((e, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-ink-2 shrink-0">{e.ref}</span>
            <span className="text-muted">{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ REST API

function ApiPanel({ data }: { data: IntegrationsData }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api<{ name: string; token: string }>("/integrations/api-keys", { method: "POST", body: { name } }),
    onSuccess: (r) => {
      setCreated(r);
      setName("");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/integrations/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const active = data.api.keys.filter((k) => !k.revokedAt);
  const err = create.error instanceof ApiError ? create.error : null;

  const example = `curl -X POST ${data.api.baseUrl}/orders \\
  -H "Authorization: Bearer rf_xxxxxxxx_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "order_number": "10234",
    "placed_at": "2026-09-28T11:20:00+05:30",
    "status": "delivered",
    "payment_method": "prepaid",
    "customer": { "email": "asha@example.com", "name": "Asha K" },
    "items": [
      { "sku": "KRT-LIN-M", "name": "Linen Kurta", "variant": "M",
        "quantity": 1, "unit_price": 1899 }
    ]
  }'`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card className="overflow-hidden h-fit">
        <CardHeader title="API keys" description="Each key can create and read orders and returns for this workspace only." />
        <form
          className="flex gap-2 px-5 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input className="flex-1" placeholder="Key name, e.g. ERP connector" value={name} onChange={(e) => setName(e.target.value)} error={err?.fieldError("name")} />
          <Button type="submit" loading={create.isPending} icon={<KeyRound className="size-4" />}>
            Create key
          </Button>
        </form>
        {active.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {active.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">{k.name}</div>
                  <div className="text-[12px] text-muted">
                    <Code className="text-[11.5px]">{k.prefix}••••</Code> · {k.lastUsedAt ? `used ${relative(k.lastUsedAt)}` : "never used"}
                  </div>
                </div>
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Revoke “${k.name}”? Systems using it will stop syncing immediately.`) && revoke.mutate(k.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-6 text-[13px] text-muted text-center">No active keys.</p>
        )}
      </Card>

      <Card className="overflow-hidden h-fit">
        <CardHeader title="Push an order" description="Send one order, or up to 100 as { &quot;orders&quot;: [...] }. Re-sending the same order number updates it." action={<CopyButton value={example} />} />
        <pre className="mx-5 mb-4 rounded-lg bg-[#131519] text-[#d9d5cc] text-[12px] leading-[1.6] p-4 overflow-x-auto scrollbar-thin font-mono">{example}</pre>
        <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted flex flex-wrap gap-x-5 gap-y-1">
          <span><Code>POST /orders</Code> create or update</span>
          <span><Code>GET /orders/:number</Code> fetch</span>
          <span><Code>GET /returns</Code> list returns</span>
        </div>
      </Card>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title={`Key “${created?.name}” created`}
        description="Copy it now — for your security it won't be shown again."
        footer={<Button onClick={() => setCreated(null)}>I've saved it</Button>}
      >
        <div className="flex items-center gap-2 rounded-lg bg-paper border border-line px-3 h-11">
          <code className="flex-1 truncate font-mono text-[12.5px]">{created?.token}</code>
          <CopyButton value={created?.token ?? ""} />
        </div>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ Webhook

function WebhookPanel({ data }: { data: IntegrationsData }) {
  const toast = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const reveal = useMutation({ mutationFn: () => api<{ secret: string }>("/integrations/webhook/reveal", { method: "POST" }), onSuccess: (r) => setSecret(r.secret) });
  const rotate = useMutation({
    mutationFn: () => api<{ secret: string }>("/integrations/webhook/rotate", { method: "POST" }),
    onSuccess: (r) => {
      setSecret(r.secret);
      toast.success("Secret rotated — update your sender");
    },
  });
  const snippet = `// Node.js — sign the exact bytes you send
const body = JSON.stringify(order);
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac("sha256", SECRET)
  .update(\`\${t}.\${body}\`).digest("hex");

await fetch("${data.webhook.url}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-ReturnFlow-Signature": \`t=\${t},v1=\${sig}\`,
  },
  body,
});`;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card className="p-5 h-fit space-y-5">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <Webhook className="size-4 text-muted" /> Endpoint
          </div>
          <p className="mt-1 text-[13px] text-muted">For custom storefronts, ERPs or OMS tools that can send an HTTP request when an order is created or changes.</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-paper border border-line px-3 h-10">
            <code className="flex-1 truncate font-mono text-[12px]">{data.webhook.url}</code>
            <CopyButton value={data.webhook.url} />
          </div>
        </div>
        <div>
          <div className="text-[14px] font-semibold">Signing secret</div>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-paper border border-line px-3 h-10">
            <code className="flex-1 truncate font-mono text-[12px]">{secret ?? data.webhook.secretPreview}</code>
            {secret ? (
              <CopyButton value={secret} />
            ) : (
              <button onClick={() => reveal.mutate()} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12.5px] font-medium hover:bg-paper-2">
                <Eye className="size-3.5" /> Reveal
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[12.5px] text-muted">Requests older than 5 minutes are rejected.</p>
            <Button variant="ghost" size="sm" icon={<RotateCw className="size-3.5" />} loading={rotate.isPending} onClick={() => confirm("Rotate the secret? The old one stops working immediately.") && rotate.mutate()}>
              Rotate
            </Button>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden h-fit">
        <CardHeader title="Signing requests" description="Body uses the same order shape as the REST API." action={<CopyButton value={snippet} />} />
        <pre className="mx-5 mb-5 rounded-lg bg-[#131519] text-[#d9d5cc] text-[12px] leading-[1.6] p-4 overflow-x-auto scrollbar-thin font-mono">{snippet}</pre>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ History

type Run = { id: string; source: string; trigger: string; status: string; label: string | null; received: number; created: number; updated: number; failed: number; errors: { ref: string; message: string }[]; startedAt: string; finishedAt: string | null };

function HistoryPanel() {
  const { data } = useQuery({ queryKey: ["sync-runs"], queryFn: () => api<{ runs: Run[] }>("/integrations/sync-runs") });
  const [open, setOpen] = useState<Run | null>(null);
  if (!data) return <Skeleton className="h-64" />;
  return (
    <Card className="overflow-hidden">
      {data.runs.length === 0 ? (
        <EmptyState icon={<RefreshCw className="size-5" />} title="No syncs yet">Imports, API calls and webhooks will be listed here.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[680px]">
            <thead className="bg-paper/60 border-b border-line">
              <tr className="text-left text-[12px] text-muted">
                <th className="font-medium px-5 h-10">When</th>
                <th className="font-medium px-3">Source</th>
                <th className="font-medium px-3">Status</th>
                <th className="font-medium px-3 text-right">New</th>
                <th className="font-medium px-3 text-right">Updated</th>
                <th className="font-medium px-3 text-right">Failed</th>
                <th className="px-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.runs.map((r) => (
                <tr key={r.id} className="hover:bg-paper/50">
                  <td className="px-5 h-12 whitespace-nowrap">{dateTime(r.startedAt)}</td>
                  <td className="px-3">
                    <div>{SOURCES[r.source]}</div>
                    <div className="text-[12px] text-muted truncate max-w-[220px]">{r.label ?? r.trigger}</div>
                  </td>
                  <td className="px-3"><SyncStatus status={r.status} /></td>
                  <td className="px-3 text-right tabular">{r.created}</td>
                  <td className="px-3 text-right tabular">{r.updated}</td>
                  <td className={clsx("px-3 text-right tabular", r.failed && "text-danger font-medium")}>{r.failed}</td>
                  <td className="px-5 text-right">{r.errors.length > 0 && <Button variant="ghost" size="sm" onClick={() => setOpen(r)}>Details</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Sync problems" description={open ? `${SOURCES[open.source]} · ${dateTime(open.startedAt)}` : ""} size="lg">
        <div className="-mx-6 -my-4">{open && <ErrorList errors={open.errors} />}</div>
      </Modal>
    </Card>
  );
}
