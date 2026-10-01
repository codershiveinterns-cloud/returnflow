import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CircleDot, FileSpreadsheet, ShoppingBag, Webhook } from "lucide-react";
import { api } from "@/lib/api";
import { REASONS, SOURCES } from "@/lib/domain";
import { money, number, percent, relative } from "@/lib/format";
import { useCan, useSession } from "@/lib/session";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Code, ReturnStatusBadge } from "@/components/ui/Badge";
import { DailyBars, RankedBars } from "@/components/charts";
import { SyncStatus } from "./Integrations";

type Summary = {
  currency: string;
  portalSlug: string;
  kpis: { orders: number; returnRate: number; returns30d: number; awaitingReview: number; openValueMinor: number };
  series: { date: string; returns: number; orders: number }[];
  reasons: { reason: string; count: number }[];
  recentReturns: { id: string; rma: string; status: string; resolution: string; valueMinor: number; currency: string; createdAt: string; orderNumber: string; customer: string; reasons: string[] }[];
  syncRuns: { id: string; source: string; trigger: string; status: string; label: string | null; created: number; updated: number; failed: number; startedAt: string }[];
  channels: { shopify: { status: string; mode: string; displayName: string; lastSyncedAt: string | null } | null; apiKeys: number };
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function OverviewPage() {
  const { user } = useSession();
  const can = useCan();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Summary>("/dashboard") });

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={data ? (data.kpis.awaitingReview ? `${data.kpis.awaitingReview} return request${data.kpis.awaitingReview === 1 ? " is" : "s are"} waiting for review.` : "The review queue is clear.") : " "}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-[var(--radius-card)] overflow-hidden [&>*]:bg-surface">
        <Kpi label="Awaiting review" value={data && number(data.kpis.awaitingReview)} accent note="Requests in the queue" to="/app/returns?status=requested" />
        <Kpi label="Return rate" value={data && percent(data.kpis.returnRate)} note="Of shipped orders" />
        <Kpi label="Returns · 30 days" value={data && number(data.kpis.returns30d)} note="Requested via portal" />
        <Kpi label="Open return value" value={data && money(data.kpis.openValueMinor, data.currency, { compact: true })} note="Not yet resolved" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Return requests" description="Per day, last 14 days" />
          <div className="px-5 pb-4">{isLoading || !data ? <Skeleton className="h-[168px]" /> : <DailyBars data={data.series} valueKey="returns" label="Returns" />}</div>
        </Card>
        <Card>
          <CardHeader title="Why customers return" description="All requests, by item" />
          <div className="px-5 pb-5">
            {!data ? (
              <Skeleton className="h-40" />
            ) : data.reasons.length ? (
              <RankedBars rows={data.reasons.map((r) => ({ label: REASONS[r.reason] ?? r.reason, value: r.count }))} />
            ) : (
              <p className="text-[13.5px] text-muted py-8 text-center">Reasons appear once customers start requesting returns.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Latest requests"
            action={
              <Link to="/app/returns" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
                Open queue <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
          {!data ? (
            <div className="px-5 pb-5 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : data.recentReturns.length === 0 ? (
            <EmptyState icon={<CircleDot className="size-5" />} title="No return requests yet">
              Share your portal link <Code>/r/{data.portalSlug}</Code> with customers to start receiving requests.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.recentReturns.map((r) => (
                <li key={r.id}>
                  <Link to={`/app/returns?open=${r.id}`} className="grid grid-cols-[72px_1fr_auto] sm:grid-cols-[76px_1fr_auto_auto] items-center gap-4 px-5 h-[58px] hover:bg-paper/70 transition-colors">
                    <Code>{r.rma}</Code>
                    <div className="min-w-0">
                      <div className="text-[13.5px] text-ink truncate">{r.customer}</div>
                      <div className="text-[12.5px] text-muted truncate">
                        #{r.orderNumber} · {r.reasons.map((x) => REASONS[x]).join(", ")}
                      </div>
                    </div>
                    <div className="hidden sm:block text-right">
                      <div className="text-[13.5px] tabular">{money(r.valueMinor, r.currency)}</div>
                      <div className="text-[12px] text-faint">{relative(r.createdAt)}</div>
                    </div>
                    <ReturnStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Order sync"
            description={data ? `${number(data.kpis.orders)} orders available for returns` : " "}
            action={
              can("integrations:manage") && (
                <Link to="/app/integrations" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
                  Manage <ArrowUpRight className="size-3.5" />
                </Link>
              )
            }
          />
          <div className="px-5 pb-2 grid grid-cols-3 gap-2">
            <Channel icon={<ShoppingBag className="size-4" />} label="Shopify" state={data?.channels.shopify ? (data.channels.shopify.mode === "sandbox" ? "Test mode" : "Live") : "Off"} on={!!data?.channels.shopify} />
            <Channel icon={<Webhook className="size-4" />} label="API keys" state={data ? String(data.channels.apiKeys) : "–"} on={!!data?.channels.apiKeys} />
            <Channel icon={<FileSpreadsheet className="size-4" />} label="CSV" state="Ready" on />
          </div>
          <ul className="px-5 pb-4 pt-2">
            {data?.syncRuns.length === 0 && <li className="text-[13px] text-muted py-4">No syncs yet.</li>}
            {data?.syncRuns.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ink truncate">
                    {SOURCES[s.source]} <span className="text-muted">· {s.label ?? s.trigger}</span>
                  </div>
                  <div className="text-[12px] text-faint">
                    {relative(s.startedAt)} · +{s.created} new, {s.updated} updated{s.failed ? `, ${s.failed} failed` : ""}
                  </div>
                </div>
                <SyncStatus status={s.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, note, accent, to }: { label: string; value?: string; note: string; accent?: boolean; to?: string }) {
  const body = (
    <div className="px-5 py-4 h-full">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        {accent && <span className="size-1.5 rounded-full bg-review" />}
        {label}
      </div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular">{value ?? <Skeleton className="h-7 w-20" />}</div>
      <div className="mt-2 text-[12px] text-faint">{note}</div>
    </div>
  );
  return to ? (
    <Link to={to} className="hover:!bg-paper/60 transition-colors">
      {body}
    </Link>
  ) : (
    body
  );
}

function Channel({ icon, label, state, on }: { icon: React.ReactNode; label: string; state: string; on: boolean }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="flex items-center justify-between text-muted">
        {icon}
        <span className={on ? "size-1.5 rounded-full bg-done" : "size-1.5 rounded-full bg-line-strong"} />
      </div>
      <div className="mt-2 text-[12px] text-muted">{label}</div>
      <div className="text-[13.5px] font-medium">{state}</div>
    </div>
  );
}
