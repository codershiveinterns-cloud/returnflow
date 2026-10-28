import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Boxes, RefreshCw } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { DISPOSITIONS } from "@/lib/domain";
import { dateTime, relative } from "@/lib/format";
import { Badge, Code } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

type Movement = { id: string; sku: string; name: string; quantity: number; disposition: string; syncStatus: string; syncTarget: string | null; syncMessage: string | null; createdAt: string; rma: string; returnId: string };
type Data = { summary: Record<string, number>; movements: Movement[] };

const SYNC: Record<string, [string, "done" | "danger" | "neutral" | "review"]> = {
  synced: ["Synced", "done"],
  failed: ["Sync failed", "danger"],
  not_connected: ["Not synced", "review"],
  not_required: ["Not for sale", "neutral"],
};

export function InventoryPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const disposition = params.get("disposition") ?? "";
  const { data } = useQuery({ queryKey: ["inventory", disposition], queryFn: () => api<Data>(`/work/inventory${disposition ? `?disposition=${disposition}` : ""}`) });
  const retry = useMutation({
    mutationFn: (id: string) => api<Movement>(`/work/inventory/${id}/sync`, { method: "POST" }),
    onSuccess: (m) => {
      m.syncStatus === "synced" ? toast.success("Stock synced") : toast.error(m.syncMessage ?? "Sync failed");
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Inventory" description="Every inspected item lands here. Restocked items are added back to your store's available stock automatically." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Object.entries(DISPOSITIONS).map(([k, v]) => (
          <button key={k} onClick={() => setParams(disposition === k ? {} : { disposition: k }, { replace: true })} className={clsx("text-left rounded-[var(--radius-card)] border bg-surface px-5 py-4 transition-colors", disposition === k ? "border-ink" : "border-line hover:border-line-strong")}>
            <div className="text-[12.5px] text-muted">{v.label === "Restock" ? "Restocked" : v.label}</div>
            <div className="mt-1.5 text-[26px] leading-none font-semibold tabular">{data ? data.summary[k] ?? 0 : <Skeleton className="h-7 w-10" />}</div>
            <div className="mt-1.5 text-[12px] text-faint">units</div>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {!data ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.movements.length === 0 ? (
          <EmptyState icon={<Boxes className="size-5" />} title="No stock movements yet">Inspected items will appear here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-[13.5px]">
              <thead className="bg-paper/60 border-b border-line">
                <tr className="text-left text-[12px] text-muted">
                  <th className="font-medium pl-5 pr-3 h-10">Item</th>
                  <th className="font-medium px-3 text-right">Qty</th>
                  <th className="font-medium px-3">Outcome</th>
                  <th className="font-medium px-3">Store sync</th>
                  <th className="font-medium px-3">Return</th>
                  <th className="font-medium pl-3 pr-5 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.movements.map((m) => {
                  const [label, tone] = SYNC[m.syncStatus] ?? [m.syncStatus, "neutral"];
                  return (
                    <tr key={m.id} className="hover:bg-paper/50">
                      <td className="pl-5 pr-3 py-2.5"><div>{m.name}</div><Code className="text-[11.5px] text-muted">{m.sku}</Code></td>
                      <td className="px-3 text-right tabular">{m.disposition === "restock" ? `+${m.quantity}` : m.quantity}</td>
                      <td className="px-3"><Badge tone={DISPOSITIONS[m.disposition].tone}>{DISPOSITIONS[m.disposition].label}</Badge></td>
                      <td className="px-3">
                        <div className="flex items-center gap-2">
                          <Badge tone={tone}>{label}</Badge>
                          {(m.syncStatus === "failed" || m.syncStatus === "not_connected") && m.disposition === "restock" && (
                            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} loading={retry.isPending && retry.variables === m.id} onClick={() => retry.mutate(m.id)}>Retry</Button>
                          )}
                        </div>
                        {m.syncMessage && <div className="text-[12px] text-muted mt-0.5">{m.syncMessage}</div>}
                      </td>
                      <td className="px-3"><Link to={`/app/returns?open=${m.returnId}`} className="font-mono text-[12px] underline decoration-line-strong underline-offset-2">{m.rma}</Link></td>
                      <td className="pl-3 pr-5 text-right text-muted whitespace-nowrap" title={dateTime(m.createdAt)}>{relative(m.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
