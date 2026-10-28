import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Camera, Check, ExternalLink, ImageOff, Inbox, Lock, Mail, MessageSquareQuote, Phone, Search, ShieldAlert, Sparkles, Truck, UserRound, Wallet, X as XIcon, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { CHECKLIST, CHECKPOINTS, DISPOSITIONS, REASONS, RESOLUTIONS, RETURN_STATUS, RISK, SHIPMENT_STATUS } from "@/lib/domain";
import { ScoreRing } from "./Risk";
import { date, dateTime, money, relative } from "@/lib/format";
import { useCan } from "@/lib/session";
import { Badge, Code, ReturnStatusBadge } from "@/components/ui/Badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Drawer } from "@/components/ui/Overlay";
import { Avatar, DefinitionList, Pagination } from "@/components/ui/misc";
import { ReturnActions } from "@/components/returns/ReturnActions";
import { Modal } from "@/components/ui/Overlay";

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
  flags: string[];
  requiresManager: boolean;
};
type List = { total: number; page: number; pageSize: number; statusCounts: Record<string, number>; escalated: number; returns: Row[] };

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
  const queue = params.get("queue") ?? "";
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

  const query = new URLSearchParams({ page: String(page), pageSize: "25", ...(status && { status }), ...(reason && { reason }), ...(resolution && { resolution }), ...(minValue && { minValue }), ...(queue && { queue }), ...(dq && { q: dq }) });
  const { data, isFetching } = useQuery({ queryKey: ["returns", query.toString()], queryFn: () => api<List>(`/returns?${query}`), placeholderData: keepPreviousData });
  const counts = data?.statusCounts ?? {};
  const all = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader title="Returns" description="Every request from your customer portal, with automated checks, photos, original order and full history." />

      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
        {STATUS_FILTERS.filter((s) => !s || counts[s] || s === "requested").map((s) => {
          const active = status === s && !queue;
          const meta = s ? RETURN_STATUS[s] : null;
          return (
            <button
              key={s || "all"}
              onClick={() => update({ status: s || null, queue: null })}
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
        {!!data?.escalated && (
          <button
            onClick={() => update({ queue: queue === "escalated" ? null : "escalated", status: null })}
            className={clsx("inline-flex items-center gap-2 h-8 px-3 rounded-full border text-[13px] whitespace-nowrap transition-colors", queue === "escalated" ? "bg-ink text-white border-ink" : "bg-surface border-line text-ink-2 hover:border-line-strong")}
          >
            <Lock className="size-3.5" /> Manager queue
            <span className={clsx("tabular text-[12px]", queue === "escalated" ? "text-white/60" : "text-faint")}>{data.escalated}</span>
          </button>
        )}
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
                    <td className="px-3">
                      <div className="flex items-center gap-1.5">
                        <ReturnStatusBadge status={r.status} />
                        {r.requiresManager && r.status === "requested" && <span title="Needs manager approval" className="grid place-items-center size-[22px] rounded-md bg-paper-2 text-ink-2"><Lock className="size-3" /></span>}
                        {r.flags.length > 0 && <span title={r.flags.join(" · ")} className="grid place-items-center size-[22px] rounded-md bg-danger-bg text-danger"><ShieldAlert className="size-3" /></span>}
                      </div>
                    </td>
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
  order: { id: string; orderNumber: string; placedAt: string; deliveredAt: string | null; status: string; paymentMethod: string; paymentRef: string | null; totalMinor: number; source: string };
  customer: { id: string; name: string | null; email: string; phone: string | null; orderCount: number; returnCount: number };
  items: {
    id: string; quantity: number; reason: string; reasonDetail: string | null; sku: string; name: string; variant: string | null; category: string | null; unitPriceMinor: number; photos: string[]; inspectionPhotos: string[];
    ai: { reason: string; summary: string; confidence: number; source: string } | null;
    inspection: null | { checklist: Record<string, string>; grade: string; disposition: string; notes: string | null; mismatch: boolean; aiSuggestion: { explanation: string } | null; inspectorName: string | null; createdAt: string };
  }[];
  events: { id: string; status: string | null; message: string; actorType: string; actorLabel: string | null; createdAt: string }[];
  eligibility: null | { outcome: string; reason: string; checks: { key: string; label: string; pass: boolean; severity: string; detail: string }[]; matchedRules: { id: string; name: string; action: string; note?: string | null }[] };
  flags: string[];
  requiresManager: boolean;
  decision: null | { reason: string | null; at: string; by: string };
  shipment: null | { courier: string; awb: string; status: string; scheduledFor: string | null; pickupWindow: string | null; checkpoints: { id: string; status: string; location: string | null; note: string | null; source: string; at: string }[] };
  notifications: { id: string; template: string; subject: string | null; status: string; to: string; createdAt: string }[];
  risk: null | { score: number; level: string; factors: { label: string; points: number }[] };
  holdRefund: boolean;
  refunds: { id: string; kind: string; method: string; amountMinor: number; currency: string; status: string; reference: string | null; gatewayMode: string | null; note: string | null; createdByName: string | null; createdAt: string; error: string | null }[];
  resolvable: { ok: boolean; why?: string };
  paymentRef: string | null;
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

          {(data.flags.length > 0 || (data.requiresManager && data.status === "requested")) && (
            <section className="flex flex-wrap gap-2">
              {data.requiresManager && data.status === "requested" && (
                <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-ink text-white text-[12.5px] font-medium"><Lock className="size-3.5" /> Needs manager approval</span>
              )}
              {data.flags.map((f) => (
                <span key={f} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-danger-bg text-danger text-[12.5px] font-medium"><ShieldAlert className="size-3.5" /> {f}</span>
              ))}
            </section>
          )}

          {data.refunds.length > 0 && <RefundCard refunds={data.refunds} />}

          {data.risk && <RiskCard risk={data.risk} />}

          {data.eligibility && <EligibilityCard e={data.eligibility} decision={data.decision} status={data.status} />}

          {data.shipment && <ShipmentCard s={data.shipment} />}

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
                    {i.ai && (
                      <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-progress">
                        <Sparkles className="size-3.5 mt-0.5 shrink-0" />
                        <span>{i.ai.reason === i.reason ? `Confirmed: ${REASONS[i.ai.reason]}` : `Reads like “${REASONS[i.ai.reason]}”, not “${REASONS[i.reason]}”`}{i.ai.source === "claude" ? ` · ${i.ai.summary}` : ""}</span>
                      </p>
                    )}
                  </div>
                  {i.inspection && (
                    <div className={clsx("mt-3 rounded-lg border px-3 py-2.5", i.inspection.mismatch ? "border-danger/30 bg-danger-bg/40" : "border-line")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold">Inspection · grade {i.inspection.grade}</span>
                        <Badge tone={DISPOSITIONS[i.inspection.disposition].tone}>{DISPOSITIONS[i.inspection.disposition].label}</Badge>
                        {i.inspection.mismatch && <span className="text-[12px] text-danger font-medium inline-flex items-center gap-1"><ShieldAlert className="size-3.5" /> Doesn't match claim</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                        {Object.entries(i.inspection.checklist).map(([k, v]) => (
                          <span key={k} className={v === "pass" ? "text-muted" : "text-danger"}>{v === "pass" ? "✓" : "✕"} {CHECKLIST[k]?.label}</span>
                        ))}
                      </div>
                      {i.inspection.notes && <p className="mt-1.5 text-[12.5px] text-ink-2">{i.inspection.notes}</p>}
                      {i.inspectionPhotos.length > 0 && (
                        <div className="mt-2 flex gap-2">{i.inspectionPhotos.map((src) => <button key={src} onClick={() => setLightbox(src)} className="size-14 rounded-md overflow-hidden border border-line"><img src={src} alt="Inspection photo" className="size-full object-cover" /></button>)}</div>
                      )}
                      <div className="mt-1.5 text-[11.5px] text-faint">{i.inspection.inspectorName} · {dateTime(i.inspection.createdAt)}</div>
                    </div>
                  )}
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

          {data.notifications.length > 0 && <EmailsCard items={data.notifications} />}
        </div>
      )}
      {data && <ReturnActions ret={data} />}
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

function EligibilityCard({ e, decision, status }: { e: NonNullable<Detail["eligibility"]>; decision: Detail["decision"]; status: string }) {
  const headline =
    e.outcome === "auto_approve" ? { icon: <Zap className="size-4" />, text: "Approved automatically", tone: "text-done" } :
    e.outcome === "auto_reject" ? { icon: <XIcon className="size-4" />, text: "Rejected automatically", tone: "text-danger" } :
    { icon: <UserRound className="size-4" />, text: "Sent to the review queue", tone: "text-review" };
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div>
          <div className={clsx("flex items-center gap-1.5 text-[13.5px] font-semibold", headline.tone)}>{headline.icon}{headline.text}</div>
          <div className="text-[12.5px] text-muted mt-0.5">{e.reason}</div>
        </div>
        {decision && status !== "requested" && <div className="text-right text-[12px] text-muted shrink-0">Decided by <span className="text-ink-2 font-medium">{decision.by}</span><br />{dateTime(decision.at)}</div>}
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 px-4 pb-3.5">
        {e.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-[12.5px]" title={c.detail}>
            <span className={clsx("mt-0.5 grid place-items-center size-4 rounded-full shrink-0", c.pass ? "bg-done-bg text-done" : c.severity === "hard" ? "bg-danger-bg text-danger" : "bg-review-bg text-review")}>
              {c.pass ? <Check className="size-2.5" strokeWidth={3.5} /> : <XIcon className="size-2.5" strokeWidth={3.5} />}
            </span>
            <span className="min-w-0"><span className="text-ink-2">{c.label}</span><span className="block text-faint truncate">{c.detail}</span></span>
          </li>
        ))}
      </ul>
      {e.matchedRules.length > 0 && (
        <div className="border-t border-line bg-paper/50 px-4 py-2.5 text-[12.5px] text-muted flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-medium text-ink-2">Rules matched:</span>
          {e.matchedRules.map((r) => <span key={r.id}>{r.name}</span>)}
        </div>
      )}
    </Card>
  );
}

function ShipmentCard({ s }: { s: NonNullable<Detail["shipment"]> }) {
  const meta = SHIPMENT_STATUS[s.status] ?? { label: s.status, tone: "neutral" as const };
  return (
    <section>
      <SectionTitle>Pickup</SectionTitle>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center size-9 rounded-lg bg-paper-2 text-ink-2 shrink-0"><Truck className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{s.courier} <Code className="ml-1 text-ink">{s.awb}</Code></div>
            <div className="text-[12.5px] text-muted">{s.scheduledFor ? `Pickup ${date(s.scheduledFor, { weekday: "short", day: "numeric", month: "short" })}${s.pickupWindow ? `, ${s.pickupWindow}` : ""}` : "Pickup date not set"}</div>
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        <ol className="mt-3 space-y-2 border-t border-line pt-3">
          {s.checkpoints.map((c, i) => (
            <li key={c.id} className="flex items-start gap-2.5 text-[12.5px]">
              <span className={clsx("mt-1.5 size-1.5 rounded-full shrink-0", i === 0 ? "bg-ink" : "bg-line-strong")} />
              <span className="flex-1">{CHECKPOINTS[c.status] ?? c.status}{c.location && <span className="text-muted"> · {c.location}</span>}</span>
              <span className="text-faint whitespace-nowrap">{dateTime(c.at)}{c.source === "webhook" && " · auto"}</span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

function EmailsCard({ items }: { items: Detail["notifications"] }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["notification", open], queryFn: () => api<{ html: string; subject: string; to: string }>(`/notifications/${open}`), enabled: !!open });
  return (
    <section>
      <SectionTitle>Customer emails</SectionTitle>
      <Card className="divide-y divide-line overflow-hidden">
        {items.map((n) => (
          <button key={n.id} onClick={() => setOpen(n.id)} className="w-full flex items-center gap-3 px-4 h-11 text-left text-[13px] hover:bg-paper/60">
            <Mail className="size-3.5 text-faint shrink-0" />
            <span className="flex-1 truncate">{n.subject}</span>
            <span className="text-[12px] text-faint whitespace-nowrap">{relative(n.createdAt)}</span>
          </button>
        ))}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={data?.subject ?? "Email"} description={data ? `To ${data.to}` : undefined} size="lg">
        {data && <iframe title="Email preview" srcDoc={data.html} sandbox="" className="w-full h-[460px] rounded-lg border border-line bg-paper" />}
      </Modal>
    </section>
  );
}

function RiskCard({ risk }: { risk: NonNullable<Detail["risk"]> }) {
  return (
    <Card className="p-4 flex items-start gap-4">
      <ScoreRing score={risk.score} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold">Return risk</span>
          <Badge tone={RISK[risk.level]?.tone ?? "neutral"}>{RISK[risk.level]?.label ?? risk.level}</Badge>
        </div>
        {risk.factors.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {risk.factors.map((f) => <span key={f.label} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-paper text-[12px] text-ink-2">{f.label}<b className="text-faint font-medium">+{f.points}</b></span>)}
          </div>
        ) : (
          <p className="mt-1 text-[12.5px] text-muted">No risk signals on this request.</p>
        )}
      </div>
    </Card>
  );
}

function RefundCard({ refunds }: { refunds: Detail["refunds"] }) {
  const r = refunds[0];
  const label = r.kind === "replacement" ? "Replacement sent" : r.kind === "store_credit" ? "Store credit issued" : r.status === "processing" ? "Refund processing" : r.status === "failed" ? "Refund failed" : "Refunded";
  return (
    <Card className={clsx("p-4 flex items-start gap-3", r.status === "failed" ? "border-danger/40" : "border-done/30 bg-done-bg/30")}>
      <span className={clsx("grid place-items-center size-9 rounded-lg shrink-0", r.status === "failed" ? "bg-danger-bg text-danger" : "bg-done-bg text-done")}><Wallet className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{label}{r.kind !== "replacement" && ` · ${money(r.amountMinor, r.currency)}`}{r.gatewayMode === "test" && <Badge tone="review" className="ml-2">Test mode</Badge>}</div>
        <div className="text-[12.5px] text-muted">
          {r.method === "razorpay" ? "Razorpay" : r.method === "manual" ? "Bank / UPI" : r.method === "store_credit" ? "Credit code" : "Order"} <Code className="text-ink-2">{r.reference ?? r.error}</Code>
        </div>
        <div className="text-[12px] text-faint">{r.createdByName} · {dateTime(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</div>
      </div>
    </Card>
  );
}
