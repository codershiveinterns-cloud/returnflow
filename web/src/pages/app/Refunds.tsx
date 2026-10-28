import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, ShieldAlert, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { RESOLUTIONS } from "@/lib/domain";
import { dateTime, money, relative } from "@/lib/format";
import { Badge, Code } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/misc";
import { ResolveModal, type Resolvable } from "@/components/returns/ResolveModal";

type CardRow = Resolvable & { grades: string[]; status: string; customer: string; orderNumber: string; riskLevel: string | null; holdRefund: boolean; mismatch: boolean; resolvable: { ok: boolean; why?: string } };
type Completed = { id: string; rma: string; returnId: string; customer: string; kind: string; method: string; amountMinor: number; currency: string; status: string; reference: string | null; gatewayMode: string | null; createdByName: string | null; createdAt: string; error: string | null };
type Data = { ready: CardRow[]; onHold: CardRow[]; completed: Completed[]; last30d: Record<string, { amountMinor: number; count: number }> };

const METHOD: Record<string, string> = { razorpay: "Razorpay", manual: "Bank / UPI", store_credit: "Store credit", replacement: "Replacement" };

export function RefundsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "ready" | "hold" | "done") || "ready";
  const [resolving, setResolving] = useState<CardRow | null>(null);
  const { data } = useQuery({ queryKey: ["refunds"], queryFn: () => api<Data>("/work/refunds") });

  return (
    <>
      <PageHeader title="Refunds" description="Issue refunds through Razorpay, record bank/UPI transfers for COD orders, add store credit or send replacements — once the parcel is back, or after inspection when a refund is on hold." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-[var(--radius-card)] overflow-hidden mb-6 [&>*]:bg-surface">
        {[
          ["Ready to resolve", data ? String(data.ready.length) : null, "Awaiting finance"],
          ["Refunded · 30 days", data ? money(data.last30d.refund?.amountMinor ?? 0, "INR", { compact: true }) : null, `${data?.last30d.refund?.count ?? 0} refunds`],
          ["Store credit · 30 days", data ? money(data.last30d.store_credit?.amountMinor ?? 0, "INR", { compact: true }) : null, `${data?.last30d.store_credit?.count ?? 0} credits`],
          ["Replacements · 30 days", data ? String(data.last30d.replacement?.count ?? 0) : null, "Exchanges sent"],
        ].map(([label, value, note]) => (
          <div key={label} className="px-5 py-4">
            <div className="text-[12.5px] text-muted">{label}</div>
            <div className="mt-1.5 text-[26px] leading-none font-semibold tabular">{value ?? <Skeleton className="h-7 w-16" />}</div>
            <div className="mt-1.5 text-[12px] text-faint">{note}</div>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="px-3 pt-1">
          <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} items={[
            { id: "ready", label: "Ready", count: data?.ready.length },
            { id: "hold", label: "On hold", count: data?.onHold.length },
            { id: "done", label: "Completed", count: data?.completed.length },
          ]} />
        </div>
        {!data ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : tab === "done" ? (
          data.completed.length === 0 ? <EmptyState icon={<Wallet className="size-5" />} title="No refunds yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13.5px]">
                <thead className="bg-paper/60 border-y border-line">
                  <tr className="text-left text-[12px] text-muted">
                    <th className="font-medium pl-5 pr-3 h-10">Return</th>
                    <th className="font-medium px-3">Customer</th>
                    <th className="font-medium px-3">Resolution</th>
                    <th className="font-medium px-3 text-right">Amount</th>
                    <th className="font-medium px-3">Reference</th>
                    <th className="font-medium pl-3 pr-5">Issued</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.completed.map((r) => (
                    <tr key={r.id} className="hover:bg-paper/50">
                      <td className="pl-5 pr-3 h-12"><Link to={`/app/returns?open=${r.returnId}`}><Code className="font-medium text-ink underline decoration-line-strong underline-offset-2">{r.rma}</Code></Link></td>
                      <td className="px-3 truncate max-w-[180px]">{r.customer}</td>
                      <td className="px-3">{RESOLUTIONS[r.kind]?.short} <span className="text-muted">· {METHOD[r.method]}</span> {r.gatewayMode === "test" && <Badge tone="review" className="ml-1">Test</Badge>} {r.status === "failed" && <Badge tone="danger" className="ml-1">Failed</Badge>}</td>
                      <td className="px-3 text-right tabular">{r.kind === "replacement" ? "—" : money(r.amountMinor, r.currency)}</td>
                      <td className="px-3"><Code className="text-[11.5px]">{r.reference ?? r.error ?? "—"}</Code></td>
                      <td className="pl-3 pr-5 text-muted whitespace-nowrap" title={dateTime(r.createdAt)}>{relative(r.createdAt)}{r.createdByName && ` · ${r.createdByName}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          (() => {
            const rows = tab === "ready" ? data.ready : data.onHold;
            if (!rows.length) return <EmptyState icon={<Wallet className="size-5" />} title={tab === "ready" ? "All caught up" : "Nothing on hold"}>{tab === "ready" ? "Returns appear here once they're back at the warehouse." : "Risky returns wait here until they're inspected."}</EmptyState>;
            return (
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
                    <div className="w-[96px]">
                      <Link to={`/app/returns?open=${r.id}`}><Code className="font-medium text-ink">{r.rma}</Code></Link>
                      <div className="text-[12px] text-faint font-mono">#{r.orderNumber}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px]">{r.customer}</div>
                      <div className="text-[12.5px] text-muted flex flex-wrap items-center gap-x-2">
                        Wants {RESOLUTIONS[r.resolution]?.short.toLowerCase()} · {r.paymentMethod === "cod" ? "COD order" : "Prepaid"}
                        {r.grades.length > 0 && <span>· Grade {r.grades.join(", ")}</span>}
                        {r.mismatch && <span className="text-danger inline-flex items-center gap-1"><ShieldAlert className="size-3.5" /> Condition mismatch</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[15px] font-semibold tabular">{money(r.valueMinor, r.currency)}</div>
                      <div className="text-[12px] text-muted">{r.status === "inspected" ? "Inspected" : "At warehouse"}</div>
                    </div>
                    {r.resolvable.ok ? (
                      <Button onClick={() => setResolving(r)}>Resolve</Button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted w-[150px]"><Lock className="size-3.5 shrink-0" /> Waiting for inspection</span>
                    )}
                  </li>
                ))}
              </ul>
            );
          })()
        )}
      </Card>
      {resolving && <ResolveModal ret={resolving} onClose={() => setResolving(null)} />}
    </>
  );
}
