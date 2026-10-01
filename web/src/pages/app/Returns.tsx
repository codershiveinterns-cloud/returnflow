import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Camera, ExternalLink, ImageOff, Inbox, Mail, MessageSquareQuote, Phone, Search, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { REASONS, RESOLUTIONS, RETURN_STATUS } from "@/lib/domain";
import { date, dateTime, money, relative } from "@/lib/format";
import { useCan } from "@/lib/session";
import { Badge, Code, ReturnStatusBadge } from "@/components/ui/Badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Drawer } from "@/components/ui/Overlay";
import { Avatar, DefinitionList, Pagination } from "@/components/ui/misc";

type Row = {
  id: string;
  rma: string;
  status: string;
  resolution: string;
  channel: string;
  valueMinor: number;
  currency: string;
  createdAt: string;
  orderNumber: string;
  customer: { name: string | null; email: string };
  itemCount: number;
  itemNames: string[];
  reasons: string[];
  photoCount: number;
};
type List = { total: number; page: number; pageSize: number; statusCounts: Record<string, number>; returns: Row[] };

const STATUS_FILTERS = ["", "requested", "approved", "pickup_scheduled", "in_transit", "received", "inspected", "refunded", "rejected", "closed"];

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ReturnsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const reason = params.get("reason") ?? "";
  const resolution = params.get("resolution") ?? "";
  const minValue = params.get("minValue") ?? "";
  const page = Number(params.get("page") ?? 1);
  const openId = params.get("open");
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get("q") ?? "") !== dq) update({ q: dq || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const query = new URLSearchParams({ page: String(page), pageSize: "25", ...(status && { status }), ...(reason && { reason }), ...(resolution && { resolution }), ...(minValue && { minValue }), ...(dq && { q: dq }) });
  const { data, isFetching } = useQuery({ queryKey: ["returns", query.toString()], queryFn: () => api<List>(`/returns?${query}`), placeholderData: keepPreviousData });
  const counts = data?.statusCounts ?? {};
  const all = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader title="Returns" description="Every request from your customer portal, with its photos, original order and full history." />

      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
        {STATUS_FILTERS.filter((s) => !s || counts[s] || s === "requested").map((s) => {
          const active = status === s;
          const meta = s ? RETURN_STATUS[s] : null;
          return (
            <button
              key={s || "all"}
              onClick={() => update({ status: s || null })}
              className={clsx(
                "inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[13px] whitespace-nowrap transition-colors",
                active ? "bg-ink text-white border-ink" : "bg-surface border-line text-ink-2 hover:border-line-strong",
              )}
            >
              {meta && <span className={clsx("size-1.5 rounded-full", { review: "bg-review", progress: "bg-progress", danger: "bg-danger", done: "bg-done", neutral: "bg-faint" }[meta.tone])} />}
              {meta?.label ?? "All"}
              <span className={clsx("tabular text-[12px]", active ? "text-white/60" : "text-faint")}>{s ? counts[s] ?? 0 : all}</span>
            </button>
          );
        })}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-2 p-3 border-b border-line">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search RMA, order number, customer…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-paper border border-transparent text-[13.5px] outline-none focus:bg-surface focus:border-line-strong placeholder:text-faint"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 xl:w-[480px]">
            <Select value={reason} onChange={(e) => update({ reason: e.target.value || null })} aria-label="Reason">
              <option value="">Any reason</option>
              {Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={resolution} onChange={(e) => update({ resolution: e.target.value || null })} aria-label="Resolution">
              <option value="">Any outcome</option>
              {Object.entries(RESOLUTIONS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}
            </Select>
            <Select value={minValue} onChange={(e) => update({ minValue: e.target.value || null })} aria-label="Minimum value">
              <option value="">Any value</option>
              <option value="2000">₹2,000+</option>
              <option value="5000">₹5,000+</option>
              <option value="10000">₹10,000+</option>
            </Select>
          </div>
        </div>

        {!data ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.returns.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title={all ? "Nothing matches these filters" : "No return requests yet"}>
            {all ? "Try clearing a filter or searching for something else." : "Requests submitted through your customer portal will appear here."}
          </EmptyState>
        ) : (
          <div className={clsx("overflow-x-auto transition-opacity", isFetching && "opacity-70")}>
            <table className="w-full min-w-[860px] text-[13.5px]">
              <thead className="bg-paper/60 border-b border-line">
                <tr className="text-left text-[12px] text-muted">
                  <th className="font-medium pl-5 pr-3 h-10 w-[100px]">Return</th>
                  <th className="font-medium px-3">Customer</th>
                  <th className="font-medium px-3">Items & reason</th>
                  <th className="font-medium px-3">Outcome</th>
                  <th className="font-medium px-3 text-right">Value</th>
                  <th className="font-medium px-3">Status</th>
                  <th className="font-medium pl-3 pr-5 text-right">Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.returns.map((r) => (
                  <tr key={r.id} onClick={() => update({ open: r.id, page: String(page) })} className={clsx("cursor-pointer transition-colors", openId === r.id ? "bg-kraft-soft/40" : "hover:bg-paper/60")}>
                    <td className="pl-5 pr-3 h-[60px]">
                      <Code className="font-medium text-ink whitespace-nowrap">{r.rma}</Code>
                      <div className="text-[12px] text-faint font-mono whitespace-nowrap">#{r.orderNumber}</div>
                    </td>
                    <td className="px-3">
                      <div className="truncate max-w-[200px]">{r.customer.name ?? "—"}</div>
                      <div className="text-[12px] text-muted truncate max-w-[200px]">{r.customer.email}</div>
                    </td>
                    <td className="px-3">
                      <div className="truncate max-w-[240px]">
                        {r.itemNames[0]}
                        {r.itemNames.length > 1 && <span className="text-muted"> +{r.itemNames.length - 1}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-muted">
                        {r.reasons.map((x) => REASONS[x]).join(", ")}
                        {r.photoCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-ink-2">
                            <Camera className="size-3" /> {r.photoCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 text-ink-2">{RESOLUTIONS[r.resolution]?.short}</td>
                    <td className="px-3 text-right tabular">{money(r.valueMinor, r.currency)}</td>
                    <td className="px-3"><ReturnStatusBadge status={r.status} /></td>
                    <td className="pl-3 pr-5 text-right text-muted whitespace-nowrap" title={dateTime(r.createdAt)}>{relative(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: String(p) })} />}
      </Card>

      <ReturnDrawer id={openId} onClose={() => update({ open: null, page: params.get("page") })} />
    </>
  );
}

type Detail = {
  id: string;
  rma: string;
  status: string;
  resolution: string;
  channel: string;
  customerNote: string | null;
  valueMinor: number;
  currency: string;
  createdAt: string;
  order: { id: string; orderNumber: string; placedAt: string; deliveredAt: string | null; status: string; paymentMethod: string; totalMinor: number; source: string };
  customer: { id: string; name: string | null; email: string; phone: string | null; orderCount: number; returnCount: number };
  items: { id: string; quantity: number; reason: string; reasonDetail: string | null; sku: string; name: string; variant: string | null; category: string | null; unitPriceMinor: number; photos: string[] }[];
  events: { id: string; status: string | null; message: string; actorType: string; actorLabel: string | null; createdAt: string }[];
};

function ReturnDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const can = useCan();
  const { data, isLoading } = useQuery({ queryKey: ["return", id], queryFn: () => api<Detail>(`/returns/${id}`), enabled: !!id });
  const [lightbox, setLightbox] = useState<string | null>(null);
  const deliveredDaysAgo = data?.order.deliveredAt ? Math.floor((new Date(data.createdAt).getTime() - new Date(data.order.deliveredAt).getTime()) / 864e5) : null;

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={data ? <span className="flex items-center gap-2.5"><span className="font-mono">{data.rma}</span> <ReturnStatusBadge status={data.status} /></span> : "Loading…"}
      subtitle={data && `Requested ${dateTime(data.createdAt)} via ${data.channel === "portal" ? "customer portal" : "staff"}`}
    >
      {isLoading || !data ? (
        <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="p-6 space-y-5">
          <section className="grid grid-cols-3 gap-px bg-line rounded-[var(--radius-card)] overflow-hidden border border-line">
            <Fact label="Return value" value={money(data.valueMinor, data.currency)} />
            <Fact label="Customer wants" value={RESOLUTIONS[data.resolution]?.short} />
            <Fact label="Days after delivery" value={deliveredDaysAgo === null ? "—" : String(Math.max(0, deliveredDaysAgo))} />
          </section>

          <section>
            <SectionTitle>Items</SectionTitle>
            <div className="space-y-3">
              {data.items.map((i) => (
                <Card key={i.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{i.name}</div>
                      <div className="text-[12.5px] text-muted">
                        {[i.variant, i.category].filter(Boolean).join(" · ")} · <Code>{i.sku}</Code>
                      </div>
                    </div>
                    <div className="text-right text-[13px]">
                      <div className="tabular">{money(i.unitPriceMinor * i.quantity, data.currency)}</div>
                      <div className="text-muted">Qty {i.quantity}</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-paper px-3 py-2.5">
                    <Badge tone="neutral" className="!bg-surface border border-line">{REASONS[i.reason]}</Badge>
                    {i.reasonDetail && <p className="mt-2 text-[13.5px] text-ink-2">“{i.reasonDetail}”</p>}
                  </div>
                  {i.photos.length > 0 ? (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {i.photos.map((src) => (
                        <button key={src} onClick={() => setLightbox(src)} className="size-20 rounded-lg overflow-hidden border border-line hover:ring-2 hover:ring-ink/20">
                          <img src={src} alt="Customer photo" className="size-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-faint">
                      <ImageOff className="size-3.5" /> No photos attached
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>

          {data.customerNote && (
            <section className="flex gap-3 rounded-[var(--radius-card)] border border-kraft/30 bg-kraft-soft/40 px-4 py-3">
              <MessageSquareQuote className="size-4 text-kraft-ink shrink-0 mt-0.5" />
              <div>
                <div className="text-[12px] font-medium text-kraft-ink">Note from customer</div>
                <p className="text-[13.5px] text-ink-2">{data.customerNote}</p>
              </div>
            </section>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <section>
              <SectionTitle>Customer</SectionTitle>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={data.customer.name ?? data.customer.email} size={34} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{data.customer.name ?? "Unnamed customer"}</div>
                    <div className="text-[12.5px] text-muted">
                      {data.customer.orderCount} order{data.customer.orderCount === 1 ? "" : "s"} · {data.customer.returnCount} return{data.customer.returnCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-[13px] text-ink-2">
                  <div className="flex items-center gap-2 min-w-0"><Mail className="size-3.5 text-faint shrink-0" /> <span className="truncate">{data.customer.email}</span></div>
                  {data.customer.phone && <div className="flex items-center gap-2"><Phone className="size-3.5 text-faint" /> {data.customer.phone}</div>}
                </div>
              </Card>
            </section>
            <section>
              <SectionTitle>Original order</SectionTitle>
              <Card className="p-4">
                <DefinitionList
                  items={[
                    ["Order", can("orders:view") ? <Link to={`/app/orders?open=${data.order.id}`} className="font-mono underline decoration-line-strong underline-offset-2 hover:decoration-ink inline-flex items-center gap-1">#{data.order.orderNumber}<ExternalLink className="size-3" /></Link> : `#${data.order.orderNumber}`],
                    ["Placed", date(data.order.placedAt)],
                    ["Delivered", data.order.deliveredAt ? date(data.order.deliveredAt) : "—"],
                    ["Payment", data.order.paymentMethod === "cod" ? "Cash on delivery" : "Prepaid"],
                    ["Order total", money(data.order.totalMinor, data.currency)],
                  ]}
                />
              </Card>
            </section>
          </div>

          <section>
            <SectionTitle>Timeline</SectionTitle>
            <ol className="relative ml-2 border-l border-line pl-5 space-y-4">
              {data.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className={clsx("absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-paper", e.status ? { review: "bg-review", progress: "bg-progress", danger: "bg-danger", done: "bg-done", neutral: "bg-faint" }[RETURN_STATUS[e.status]?.tone ?? "neutral"] : "bg-faint")} />
                  <div className="text-[13.5px]">{e.message}</div>
                  <div className="text-[12px] text-muted flex items-center gap-1.5">
                    <UserRound className="size-3" /> {e.actorLabel ?? e.actorType} · {dateTime(e.createdAt)}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-ink/85 grid place-items-center p-6 animate-fade-in" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Customer photo" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
    </Drawer>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold tabular">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">{children}</h3>;
}
