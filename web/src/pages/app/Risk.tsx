import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { MapPin, Package, Repeat, ShieldAlert, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { RETURN_STATUS } from "@/lib/domain";
import { money, relative } from "@/lib/format";
import { Code } from "@/components/ui/Badge";
import { Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/Card";

type Data = {
  highRisk: { id: string; rma: string; status: string; score: number; level: string; customer: string; valueMinor: number; currency: string; factors: { label: string; points: number }[]; flags: string[]; createdAt: string }[];
  serialReturners: { name: string; email: string; count: number; valueMinor: number; rmas: string[] }[];
  highValueClaims: { name: string; email: string; count: number; valueMinor: number; highValue: number }[];
  productSpikes: { key: string; name: string; recent: number; prior: number }[];
  locationSpikes: { key: string; recent: number; prior: number }[];
  distribution: { low: number; medium: number; high: number };
};

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = score >= 60 ? "var(--color-danger)" : score >= 30 ? "var(--color-review)" : "var(--color-done)";
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-paper-2)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute text-[13px] font-semibold tabular">{score}</span>
    </span>
  );
}

function Pattern({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={<span className="flex items-center gap-2">{icon}{title}</span>} />
      {empty ? <p className="px-5 pb-5 text-[13px] text-muted">Nothing unusual right now.</p> : <ul className="divide-y divide-line border-t border-line">{children}</ul>}
    </Card>
  );
}

export function RiskPage() {
  const { data } = useQuery({ queryKey: ["risk"], queryFn: () => api<Data>("/work/risk") });
  const total = data ? data.distribution.low + data.distribution.medium + data.distribution.high : 0;

  return (
    <>
      <PageHeader title="Risk & patterns" description="Every request is scored on return history, value, frequency and reason patterns. High-risk returns are held for inspection before any refund goes out." />
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[14px] font-semibold">Last 90 days</span>
              <span className="text-[12.5px] text-muted">{total} requests scored</span>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-paper-2">
              {(["low", "medium", "high"] as const).map((l) => data.distribution[l] > 0 && (
                <div key={l} style={{ flex: data.distribution[l] }} className={clsx(l === "low" ? "bg-done" : l === "medium" ? "bg-review" : "bg-danger")} title={`${data.distribution[l]} ${l}`} />
              ))}
            </div>
            <div className="mt-2.5 flex gap-5 text-[12.5px] text-muted">
              {(["low", "medium", "high"] as const).map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5"><span className={clsx("size-2 rounded-full", l === "low" ? "bg-done" : l === "medium" ? "bg-review" : "bg-danger")} />{l[0].toUpperCase() + l.slice(1)} <b className="text-ink font-medium tabular">{data.distribution[l]}</b></span>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] items-start">
            <Card className="overflow-hidden">
              <CardHeader title={<span className="flex items-center gap-2"><ShieldAlert className="size-4 text-danger" />Highest-risk requests</span>} />
              {data.highRisk.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">No risky requests.</p> : (
                <ul className="divide-y divide-line border-t border-line">
                  {data.highRisk.map((r) => (
                    <li key={r.id}>
                      <Link to={`/app/returns?open=${r.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-paper/60">
                        <ScoreRing score={r.score} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Code className="font-medium text-ink">{r.rma}</Code>
                            <span className="text-[13.5px]">{r.customer}</span>
                            <span className="text-[12.5px] text-muted">· {money(r.valueMinor, r.currency)} · {RETURN_STATUS[r.status]?.label} · {relative(r.createdAt)}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {r.factors.map((f) => <span key={f.label} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-paper text-[12px] text-ink-2">{f.label}<b className="text-faint font-medium">+{f.points}</b></span>)}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              <Pattern icon={<Repeat className="size-4 text-review" />} title="Serial returners" empty={!data.serialReturners.length}>
                {data.serialReturners.map((c) => (
                  <li key={c.email} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1"><div className="text-[13.5px]">{c.name}</div><div className="text-[12px] text-muted truncate">{c.rmas.join(", ")}</div></div>
                    <div className="text-right"><div className="text-[14px] font-semibold tabular">{c.count} returns</div><div className="text-[12px] text-muted">{money(c.valueMinor, "INR")}</div></div>
                  </li>
                ))}
              </Pattern>
              <Pattern icon={<TrendingUp className="size-4 text-danger" />} title="Repeated high-value claims" empty={!data.highValueClaims.length}>
                {data.highValueClaims.map((c) => (
                  <li key={c.email} className="flex items-center gap-3 px-5 py-3 text-[13.5px]"><span className="flex-1">{c.name}</span><span className="tabular">{c.highValue} over ₹5,000 · {money(c.valueMinor, "INR")}</span></li>
                ))}
              </Pattern>
              <Pattern icon={<Package className="size-4 text-progress" />} title="Product return spikes" empty={!data.productSpikes.length}>
                {data.productSpikes.map((p) => (
                  <li key={p.key} className="flex items-center gap-3 px-5 py-3 text-[13.5px]"><div className="flex-1 min-w-0"><div>{p.name}</div><Code className="text-[11.5px] text-muted">{p.key}</Code></div><span className="tabular">{p.recent} in 14 days <span className="text-muted">vs {p.prior}</span></span></li>
                ))}
              </Pattern>
              <Pattern icon={<MapPin className="size-4 text-kraft-ink" />} title="Location spikes" empty={!data.locationSpikes.length}>
                {data.locationSpikes.map((p) => (
                  <li key={p.key} className="flex items-center gap-3 px-5 py-3 text-[13.5px]"><span className="flex-1">{p.key}</span><span className="tabular">{p.recent} in 14 days <span className="text-muted">vs {p.prior}</span></span></li>
                ))}
              </Pattern>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
