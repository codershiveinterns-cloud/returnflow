import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight, PackageOpen, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { CHECKPOINTS, SHIPMENT_STATUS } from "@/lib/domain";
import { date, relative } from "@/lib/format";
import { Badge, Code } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";

type Shipment = {
  id: string; courier: string; awb: string; status: string; scheduledFor: string | null; pickupWindow: string | null; city: string | null;
  lastCheckpoint: { status: string; location: string | null; at: string } | null;
  returnId: string; rma: string; returnStatus: string; customer: string; orderNumber: string; items: number;
};
type Data = { awaitingPickup: number; counts: Record<string, number>; shipments: Shipment[] };

const TABS = [
  { id: "", label: "All" },
  { id: "scheduled", label: "Scheduled" },
  { id: "in_transit", label: "In transit" },
  { id: "delivered", label: "At warehouse" },
  { id: "failed", label: "Failed" },
];

export function PickupsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const { data } = useQuery({ queryKey: ["pickups", status], queryFn: () => api<Data>(`/pickups${status ? `?status=${status}` : ""}`) });
  const total = data ? Object.values(data.counts).reduce((s, n) => s + n, 0) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Pickups"
        description="Reverse pickups booked with couriers. Tracking updates arrive from courier webhooks or are recorded by the team."
        actions={data?.awaitingPickup ? <Link to="/app/returns?status=approved"><Button icon={<Truck className="size-4" />}>{data.awaitingPickup} awaiting pickup</Button></Link> : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-[var(--radius-card)] overflow-hidden mb-6 [&>*]:bg-surface">
        {[
          ["Awaiting booking", data?.awaitingPickup, "Approved, no pickup yet"],
          ["Scheduled", data?.counts.scheduled ?? 0, "Courier booked"],
          ["In transit", data?.counts.in_transit ?? 0, "On the way back"],
          ["At warehouse", data?.counts.delivered ?? 0, "Ready to inspect"],
        ].map(([label, value, note]) => (
          <div key={String(label)} className="px-5 py-4">
            <div className="text-[12.5px] text-muted">{label}</div>
            <div className="mt-1.5 text-[26px] leading-none font-semibold tabular">{value ?? <Skeleton className="h-7 w-10" />}</div>
            <div className="mt-1.5 text-[12px] text-faint">{note}</div>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex gap-1 px-3 pt-2 border-b border-line overflow-x-auto scrollbar-thin">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setParams(t.id ? { status: t.id } : {}, { replace: true })} className={clsx("relative h-10 px-3 text-[13.5px] font-medium whitespace-nowrap", status === t.id ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:bg-ink after:rounded-full" : "text-muted hover:text-ink")}>
              {t.label}
              <span className="ml-1.5 text-[12px] text-faint tabular">{t.id ? data?.counts[t.id] ?? 0 : total}</span>
            </button>
          ))}
        </div>
        {!data ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : data.shipments.length === 0 ? (
          <EmptyState icon={<PackageOpen className="size-5" />} title="No pickups here">Schedule a pickup from any approved return.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.shipments.map((s) => {
              const meta = SHIPMENT_STATUS[s.status] ?? { label: s.status, tone: "neutral" as const };
              const isToday = s.scheduledFor?.slice(0, 10) === today;
              return (
                <li key={s.id}>
                  <Link to={`/app/returns?open=${s.returnId}`} className="grid grid-cols-[1fr_auto] md:grid-cols-[110px_1.2fr_1fr_1.2fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-paper/60">
                    <div>
                      <Code className="font-medium text-ink">{s.rma}</Code>
                      <div className="text-[12px] text-faint font-mono">#{s.orderNumber}</div>
                    </div>
                    <div className="min-w-0 order-3 md:order-none">
                      <div className="text-[13.5px] truncate">{s.customer}</div>
                      <div className="text-[12px] text-muted">{s.city ?? "—"} · {s.items} item{s.items === 1 ? "" : "s"}</div>
                    </div>
                    <div className="min-w-0 order-4 md:order-none">
                      <div className="text-[13.5px]">{s.courier}</div>
                      <Code className="text-[11.5px] text-muted">{s.awb}</Code>
                    </div>
                    <div className="min-w-0 order-5 md:order-none text-[12.5px]">
                      {s.status === "scheduled" ? (
                        <span className={clsx(isToday && "text-review font-medium")}>{s.scheduledFor ? `${isToday ? "Today" : date(s.scheduledFor, { weekday: "short", day: "numeric", month: "short" })}${s.pickupWindow ? ` · ${s.pickupWindow}` : ""}` : "Date not set"}</span>
                      ) : s.lastCheckpoint ? (
                        <span>{CHECKPOINTS[s.lastCheckpoint.status]}{s.lastCheckpoint.location && <span className="text-muted"> · {s.lastCheckpoint.location}</span>}<span className="block text-faint">{relative(s.lastCheckpoint.at)}</span></span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 order-2 md:order-none">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <ArrowUpRight className="size-4 text-faint hidden md:block" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
