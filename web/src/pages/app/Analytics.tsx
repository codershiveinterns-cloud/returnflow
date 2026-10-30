import { useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Download, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { DISPOSITIONS, RESOLUTIONS } from "@/lib/domain";
import { money, number, percent } from "@/lib/format";
import { Code } from "@/components/ui/Badge";
import { Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/Card";
import { DailyBars, RankedBars } from "@/components/charts";

type Data = {
  currency: string;
  days: number;
  kpis: { orders: number; returns: number; returnRate: number; refundedMinor: number; storeCreditMinor: number; replacements: number; avgResolutionHours: number | null; restockRate: number | null; automationRate: number; rejected: number };
  series: { date: string; returns: number; refundedMinor: number }[];
  bucket: "day" | "week";
  reasons: { reason: string; label: string; count: number }[];
  products: { sku: string; name: string; returned: number; sold: number | null; returnRate: number | null; valueMinor: number }[];
  stages: { key: string; label: string; hours: number | null }[];
  resolutions: { resolution: string; count: number }[];
  locations: { city: string; count: number }[];
  dispositions: { disposition: string; units: number }[];
};

const RANGES = [7, 30, 90, 365];
const hours = (h: number | null) => (h === null ? "—" : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const days = Number(params.get("days") ?? 30);
  const { data, isFetching } = useQuery({ queryKey: ["analytics", days], queryFn: () => api<Data>(`/analytics?days=${days}`), placeholderData: keepPreviousData });
  const maxStage = data ? Math.max(1, ...data.stages.map((s) => s.hours ?? 0)) : 1;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How returns are trending, why things come back, and how fast your team resolves them."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5" role="tablist" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r} role="tab" aria-selected={days === r} onClick={() => setParams({ days: String(r) }, { replace: true })} className={clsx("h-8 px-3 rounded-md text-[13px] font-medium", days === r ? "bg-ink text-white" : "text-muted hover:text-ink")}>
                  {r === 365 ? "12 mo" : `${r} days`}
                </button>
              ))}
            </div>
            <a href={`/api/analytics/report.pdf?days=${days}`} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-ink text-white text-[13.5px] font-medium hover:bg-ink-2"><FileText className="size-4" /> PDF report</a>
          </div>
        }
      />

      <div className={clsx("transition-opacity", isFetching && "opacity-70")}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-[var(--radius-card)] overflow-hidden [&>*]:bg-surface">
          {[
            ["Return rate", data && percent(data.kpis.returnRate), data ? `${number(data.kpis.returns)} requests · ${number(data.kpis.orders)} orders shipped` : ""],
            ["Refunded", data && money(data.kpis.refundedMinor, data.currency, { compact: true }), data ? `+ ${money(data.kpis.storeCreditMinor, data.currency, { compact: true })} store credit · ${data.kpis.replacements} replacements` : ""],
            ["Avg. time to resolve", data && hours(data.kpis.avgResolutionHours), "Request to refund, credit or replacement"],
            ["Decided automatically", data && percent(data.kpis.automationRate, 0), data ? `Restock rate ${data.kpis.restockRate === null ? "—" : percent(data.kpis.restockRate, 0)}` : ""],
          ].map(([label, value, note]) => (
            <div key={String(label)} className="px-5 py-4">
              <div className="text-[12.5px] text-muted">{label}</div>
              <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular">{value ?? <Skeleton className="h-7 w-20" />}</div>
              <div className="mt-2 text-[12px] text-faint">{note}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader title="Return requests" description={`Per ${data?.bucket ?? "day"}, last ${days === 365 ? "12 months" : `${days} days`}`} />
            <div className="px-5 pb-4">{data ? <DailyBars data={data.series} valueKey="returns" label="Returns" /> : <Skeleton className="h-[168px]" />}</div>
          </Card>
          <Card>
            <CardHeader title="Top reasons" description="By item, using AI-cleaned reasons" />
            <div className="px-5 pb-5">{data ? (data.reasons.length ? <RankedBars rows={data.reasons.slice(0, 6).map((r) => ({ label: r.label, value: r.count }))} /> : <p className="text-[13px] text-muted py-6 text-center">No returns in this period.</p>) : <Skeleton className="h-40" />}</div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader title="Most returned products" description="Return rate = units returned ÷ units shipped in this period" />
            {!data ? <div className="p-5"><Skeleton className="h-40" /></div> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[13.5px]">
                  <thead className="bg-paper/60 border-y border-line">
                    <tr className="text-left text-[12px] text-muted">
                      <th className="font-medium pl-5 pr-3 h-10">Product</th>
                      <th className="font-medium px-3 text-right">Returned</th>
                      <th className="font-medium px-3 text-right">Shipped</th>
                      <th className="font-medium px-3">Return rate</th>
                      <th className="font-medium pl-3 pr-5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.products.map((p) => (
                      <tr key={p.sku}>
                        <td className="pl-5 pr-3 py-2.5"><div>{p.name}</div><Code className="text-[11.5px] text-muted">{p.sku}</Code></td>
                        <td className="px-3 text-right tabular">{p.returned}</td>
                        <td className="px-3 text-right tabular text-muted">{p.sold ?? "—"}</td>
                        <td className="px-3">
                          {p.returnRate === null ? <span className="text-faint">—</span> : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 rounded-full bg-paper-2 overflow-hidden"><div className={clsx("h-full rounded-full", p.returnRate > 0.3 ? "bg-danger" : p.returnRate > 0.15 ? "bg-review" : "bg-ink")} style={{ width: `${Math.min(100, p.returnRate * 100)}%` }} /></div>
                              <span className="tabular text-[12.5px]">{percent(p.returnRate, 0)}</span>
                            </div>
                          )}
                        </td>
                        <td className="pl-3 pr-5 text-right tabular">{money(p.valueMinor, data.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Processing time" description="Average hours at each stage" />
              <ul className="px-5 pb-5 space-y-3">
                {data?.stages.map((s) => (
                  <li key={s.key}>
                    <div className="flex justify-between text-[13px] mb-1.5"><span className="text-ink-2">{s.label}</span><span className="tabular font-medium">{hours(s.hours)}</span></div>
                    <div className="h-1.5 rounded-full bg-paper-2 overflow-hidden"><div className="h-full rounded-full bg-ink" style={{ width: `${((s.hours ?? 0) / maxStage) * 100}%` }} /></div>
                  </li>
                )) ?? <Skeleton className="h-32" />}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Outcomes" />
              <div className="px-5 pb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                {data?.resolutions.map((r) => <div key={r.resolution} className="flex justify-between"><span className="text-muted">{RESOLUTIONS[r.resolution]?.short}</span><span className="tabular">{r.count}</span></div>)}
                {data?.dispositions.map((d) => <div key={d.disposition} className="flex justify-between"><span className="text-muted">{DISPOSITIONS[d.disposition]?.label}</span><span className="tabular">{d.units} units</span></div>)}
              </div>
            </Card>
          </div>
        </div>

        <Card className="mt-6 p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <div className="text-[14px] font-semibold">Export data</div>
            <p className="text-[13px] text-muted">Spreadsheet-ready CSVs for the selected period. Every export is recorded in the audit log.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[["Returns CSV", `/api/analytics/export/returns.csv?days=${days}`], ["Refunds CSV", `/api/analytics/export/refunds.csv?days=${days}`], ["PDF report", `/api/analytics/report.pdf?days=${days}`]].map(([label, href]) => (
              <a key={label} href={href} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-line-strong bg-surface text-[13.5px] font-medium hover:bg-paper"><Download className="size-4" /> {label}</a>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
