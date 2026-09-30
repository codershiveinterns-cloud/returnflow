import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Package, Plug, Search } from "lucide-react";
import { api } from "@/lib/api";
import { SOURCES } from "@/lib/domain";
import { date, money, relative } from "@/lib/format";
import { useCan } from "@/lib/session";
import { Code, OrderStatusBadge, ReturnStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Drawer } from "@/components/ui/Overlay";
import { DefinitionList, Pagination } from "@/components/ui/misc";

type Row = { id: string; orderNumber: string; source: string; status: string; paymentMethod: string; currency: string; totalMinor: number; placedAt: string; customer: { name: string | null; email: string }; itemCount: number; returnCount: number };
type List = { total: number; page: number; pageSize: number; sourceCounts: Record<string, number>; orders: Row[] };

const SOURCE_DOT: Record<string, string> = { shopify: "#5e8e3e", api: "#4d5b70", webhook: "#7a5a9e", csv: "#a8742f" };

export function OrdersPage() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const source = params.get("source") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const openId = params.get("open");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [dq, setDq] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams({ page: String(page), pageSize: "25", ...(source && { source }), ...(status && { status }), ...(dq && { q: dq }) });
  const { data, isFetching } = useQuery({ queryKey: ["orders", query.toString()], queryFn: () => api<List>(`/orders?${query}`), placeholderData: keepPreviousData });
  const totalAll = data ? Object.values(data.sourceCounts).reduce((s, n) => s + n, 0) : 0;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Orders synced from your store. Customers can only request returns against orders that exist here."
        actions={can("integrations:manage") && <Link to="/app/integrations"><Button variant="secondary" icon={<Plug className="size-4" />}>Order sync</Button></Link>}
      />

      {data && totalAll > 0 && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
          {Object.entries(data.sourceCounts).map(([s, n]) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="size-2 rounded-sm" style={{ background: SOURCE_DOT[s] }} />
              {SOURCES[s]} <span className="text-ink tabular font-medium">{n}</span>
            </span>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-2 p-3 border-b border-line">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order number, customer, email or SKU…" className="w-full h-9 pl-9 pr-3 rounded-lg bg-paper border border-transparent text-[13.5px] outline-none focus:bg-surface focus:border-line-strong placeholder:text-faint" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-[320px]">
            <Select value={source} onChange={(e) => update({ source: e.target.value || null })} aria-label="Source">
              <option value="">All sources</option>
              {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={status} onChange={(e) => update({ status: e.target.value || null })} aria-label="Status">
              <option value="">Any status</option>
              <option value="pending">Unfulfilled</option>
              <option value="fulfilled">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        </div>
        {!data ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : data.orders.length === 0 ? (
          <EmptyState icon={<Package className="size-5" />} title={totalAll ? "No orders match" : "No orders yet"} action={!totalAll && can("integrations:manage") && <Link to="/app/integrations"><Button>Set up order sync</Button></Link>}>
            {totalAll ? "Try a different search or filter." : "Connect Shopify, push orders through the API, or upload a CSV to get started."}
          </EmptyState>
        ) : (
          <div className={clsx("overflow-x-auto transition-opacity", isFetching && "opacity-70")}>
            <table className="w-full min-w-[820px] text-[13.5px]">
              <thead className="bg-paper/60 border-b border-line">
                <tr className="text-left text-[12px] text-muted">
                  <th className="font-medium pl-5 pr-3 h-10">Order</th>
                  <th className="font-medium px-3">Placed</th>
                  <th className="font-medium px-3">Customer</th>
                  <th className="font-medium px-3">Status</th>
                  <th className="font-medium px-3 text-right">Items</th>
                  <th className="font-medium px-3 text-right">Total</th>
                  <th className="font-medium px-3">Source</th>
                  <th className="font-medium pl-3 pr-5 text-right">Returns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.orders.map((o) => (
                  <tr key={o.id} onClick={() => update({ open: o.id, page: String(page) })} className={clsx("cursor-pointer", openId === o.id ? "bg-kraft-soft/40" : "hover:bg-paper/60")}>
                    <td className="pl-5 pr-3 h-12 font-mono text-[12.5px] font-medium">#{o.orderNumber}</td>
                    <td className="px-3 text-ink-2 whitespace-nowrap">{date(o.placedAt, { day: "numeric", month: "short" })}</td>
                    <td className="px-3"><div className="truncate max-w-[220px]">{o.customer.name ?? o.customer.email}</div></td>
                    <td className="px-3"><OrderStatusBadge status={o.status} /></td>
                    <td className="px-3 text-right tabular">{o.itemCount}</td>
                    <td className="px-3 text-right tabular">{money(o.totalMinor, o.currency)}{o.paymentMethod === "cod" && <span className="ml-1.5 text-[10.5px] font-medium text-muted border border-line rounded px-1">COD</span>}</td>
                    <td className="px-3"><span className="inline-flex items-center gap-2 text-ink-2"><span className="size-2 rounded-sm" style={{ background: SOURCE_DOT[o.source] }} />{SOURCES[o.source]}</span></td>
                    <td className="pl-3 pr-5 text-right tabular">{o.returnCount ? <span className="font-medium text-review">{o.returnCount}</span> : <span className="text-faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: String(p) })} />}
      </Card>

      <OrderDrawer id={openId} onClose={() => update({ open: null, page: params.get("page") })} />
    </>
  );
}

type Detail = {
  id: string; orderNumber: string; externalId: string | null; source: string; status: string; paymentMethod: string; currency: string; totalMinor: number; placedAt: string; deliveredAt: string | null; updatedAt: string;
  shippingAddress: Record<string, string> | null;
  customer: { name: string | null; email: string; phone: string | null; orderCount: number; returnCount: number };
  items: { id: string; sku: string; name: string; variant: string | null; category: string | null; quantity: number; unitPriceMinor: number; returnedQuantity: number }[];
  returns: { id: string; rma: string; status: string; valueMinor: number; createdAt: string }[];
};

function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["order", id], queryFn: () => api<Detail>(`/orders/${id}`), enabled: !!id });
  const address = data?.shippingAddress ? [data.shippingAddress.city, data.shippingAddress.province, data.shippingAddress.zip, data.shippingAddress.country].filter(Boolean).join(", ") : null;
  return (
    <Drawer open={!!id} onClose={onClose} width="max-w-[560px]" title={data ? <span className="flex items-center gap-2.5"><span className="font-mono">#{data.orderNumber}</span><OrderStatusBadge status={data.status} /></span> : "Loading…"} subtitle={data && `Placed ${date(data.placedAt)} · synced via ${SOURCES[data.source]} ${relative(data.updatedAt)}`}>
      {!data ? (
        <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <div className="p-6 space-y-5">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {data.items.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{i.name}</div>
                    <div className="text-[12.5px] text-muted">{[i.variant, i.category].filter(Boolean).join(" · ")}</div>
                    <Code className="text-[11.5px] text-muted">{i.sku}</Code>
                  </div>
                  <div className="text-right text-[13px]">
                    <div className="tabular">{money(i.unitPriceMinor * i.quantity, data.currency)}</div>
                    <div className="text-muted">{i.quantity} × {money(i.unitPriceMinor, data.currency)}</div>
                    {i.returnedQuantity > 0 && <div className="text-review text-[12px] font-medium">{i.returnedQuantity} in return</div>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between px-4 py-3 border-t border-line bg-paper/50 text-[13.5px]">
              <span className="text-muted">Total · {data.paymentMethod === "cod" ? "Cash on delivery" : "Prepaid"}</span>
              <span className="font-semibold tabular">{money(data.totalMinor, data.currency)}</span>
            </div>
          </Card>

          <Card className="p-4">
            <DefinitionList
              items={[
                ["Customer", data.customer.name ?? "—"],
                ["Email", data.customer.email],
                ["Phone", data.customer.phone ?? "—"],
                ["History", `${data.customer.orderCount} orders · ${data.customer.returnCount} returns`],
                ["Ship to", address ?? "—"],
                ["Delivered", data.deliveredAt ? date(data.deliveredAt) : "—"],
                ...(data.externalId ? ([["External ID", <Code key="x">{data.externalId}</Code>]] as [string, React.ReactNode][]) : []),
              ]}
            />
          </Card>

          <div>
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">Returns on this order</h3>
            {data.returns.length === 0 ? (
              <p className="text-[13.5px] text-muted">None yet.</p>
            ) : (
              <Card className="divide-y divide-line">
                {data.returns.map((r) => (
                  <Link key={r.id} to={`/app/returns?open=${r.id}`} className="flex items-center gap-3 px-4 h-12 hover:bg-paper/60">
                    <Code className="font-medium text-ink">{r.rma}</Code>
                    <span className="flex-1 text-[12.5px] text-muted">{relative(r.createdAt)}</span>
                    <span className="tabular text-[13px]">{money(r.valueMinor, data.currency)}</span>
                    <ReturnStatusBadge status={r.status} />
                  </Link>
                ))}
              </Card>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
