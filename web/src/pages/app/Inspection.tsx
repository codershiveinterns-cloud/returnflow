import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Camera, Check, ChevronRight, ClipboardCheck, PackageCheck, PackageOpen, ShieldAlert, Sparkles, Truck, X } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { CHECKLIST, DISPOSITIONS, GRADES, REASONS } from "@/lib/domain";
import { relative } from "@/lib/format";
import { Badge, Code } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

type QueueItem = { id: string; name: string; variant: string | null; sku: string; quantity: number; reason: string; inspection: { grade: string; disposition: string } | null };
type QueueReturn = { id: string; rma: string; status: string; customer: string; reasons: string[]; holdRefund: boolean; riskLevel: string | null; shipment: { courier: string; awb: string; status: string } | null; items: QueueItem[]; updatedAt: string };
type Queue = { toInspect: QueueReturn[]; incoming: QueueReturn[]; recent: QueueReturn[] };

export function InspectionQueuePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["inspections"], queryFn: () => api<Queue>("/work/inspections"), refetchInterval: 30_000 });
  const receive = useMutation({
    mutationFn: (id: string) => api(`/returns/${id}/receive`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Marked as received");
      qc.invalidateQueries({ queryKey: ["inspections"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Inspection" description="Check every returned item against a standard checklist, with photos and a condition grade. Restocked items sync back to your store automatically." />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">Ready to inspect · {data?.toInspect.length ?? "–"}</h2>
          {!data ? (
            <Skeleton className="h-40" />
          ) : data.toInspect.length === 0 ? (
            <Card><EmptyState icon={<ClipboardCheck className="size-5" />} title="Nothing waiting">Parcels appear here once they're received at the warehouse.</EmptyState></Card>
          ) : (
            <div className="space-y-2.5">
              {data.toInspect.map((r) => {
                const done = r.items.filter((i) => i.inspection).length;
                return (
                  <Link key={r.id} to={`/app/inspection/${r.id}`} className="block">
                    <Card className="p-4 sm:p-5 hover:border-line-strong transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="grid place-items-center size-12 rounded-xl bg-kraft-soft text-kraft-ink shrink-0"><PackageOpen className="size-6" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[15px] font-semibold">{r.rma}</span>
                            {r.holdRefund && <Badge tone="danger">Refund on hold</Badge>}
                          </div>
                          <div className="text-[13.5px] text-ink-2 truncate">{r.items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}</div>
                          <div className="text-[12.5px] text-muted">{r.customer} · {r.reasons.map((x) => REASONS[x]).join(", ")}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13px] tabular text-muted">{done}/{r.items.length}</div>
                          <ChevronRight className="size-5 text-faint ml-auto" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}

          {data && data.recent.length > 0 && (
            <>
              <h2 className="mt-8 mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">Recently inspected</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {data.recent.map((r) => (
                  <Link key={r.id} to={`/app/returns?open=${r.id}`} className="flex items-center gap-3 px-4 h-12 hover:bg-paper/60 text-[13.5px]">
                    <Code className="font-medium text-ink w-[72px]">{r.rma}</Code>
                    <span className="flex-1 truncate text-ink-2">{r.items.map((i) => i.name).join(", ")}</span>
                    {r.items.map((i) => i.inspection && <Badge key={i.id} tone={DISPOSITIONS[i.inspection.disposition].tone}>{i.inspection.grade} · {DISPOSITIONS[i.inspection.disposition].label}</Badge>)}
                  </Link>
                ))}
              </Card>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">On the way · {data?.incoming.length ?? "–"}</h2>
          <Card className="divide-y divide-line overflow-hidden">
            {!data ? (
              <div className="p-4"><Skeleton className="h-24" /></div>
            ) : data.incoming.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted">No parcels in transit.</p>
            ) : (
              data.incoming.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Truck className="size-4 text-faint shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px]"><span className="font-mono font-medium">{r.rma}</span> <span className="text-muted">· {r.items.length} item{r.items.length > 1 ? "s" : ""}</span></div>
                    <div className="text-[12px] text-muted truncate">{r.shipment ? `${r.shipment.courier} · ${r.shipment.awb}` : "No pickup booked"} · {relative(r.updatedAt)}</div>
                  </div>
                  <Button size="sm" variant="secondary" loading={receive.isPending && receive.variables === r.id} onClick={() => receive.mutate(r.id)}>Mark received</Button>
                </div>
              ))
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

// ───────────────────────── Inspect one return ─────────────────────────

type Detail = {
  id: string;
  rma: string;
  status: string;
  holdRefund: boolean;
  customer: { name: string | null };
  items: { id: string; name: string; variant: string | null; sku: string; quantity: number; reason: string; reasonDetail: string | null; photos: string[]; ai: { reason: string; summary: string } | null; inspection: unknown }[];
};
type Checklist = Record<"packaging" | "tags" | "damage" | "usage", "pass" | "fail">;
type Suggestion = { grade: "A" | "B" | "C" | "D"; disposition: string; mismatch: boolean; explanation: string; source: "claude" | "rules" };

const FRESH: Checklist = { packaging: "pass", tags: "pass", damage: "pass", usage: "pass" };

export function InspectReturnPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, refetch } = useQuery({ queryKey: ["return", id], queryFn: () => api<Detail>(`/returns/${id}`) });
  const pending = data?.items.filter((i) => !i.inspection) ?? [];
  const item = pending[0];
  const index = data ? data.items.length - pending.length : 0;

  const [checklist, setChecklist] = useState<Checklist>(FRESH);
  const [grade, setGrade] = useState<Suggestion["grade"] | null>(null);
  const [disposition, setDisposition] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  useEffect(() => {
    setChecklist(FRESH);
    setGrade(null);
    setDisposition(null);
    setNotes("");
    setPhotos([]);
    setSuggestion(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [item?.id]);

  const analyze = useMutation({
    mutationFn: () => api<Suggestion>(`/returns/${id}/items/${item!.id}/analyze`, { method: "POST", body: { checklist } }),
    onSuccess: setSuggestion,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({ checklist, grade, disposition, notes: notes || undefined, aiSuggestion: suggestion }));
      photos.forEach((p) => fd.append("photos", p, p.name));
      return api<{ complete: boolean }>(`/returns/${id}/items/${item!.id}/inspect`, { method: "POST", body: fd });
    },
    onSuccess: async (r) => {
      toast.success(r.complete ? "Inspection complete" : "Saved — next item");
      ["inspections", "returns", "refunds", "inventory"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      await refetch();
    },
  });

  if (!data) return <Skeleton className="h-96 max-w-2xl mx-auto" />;

  if (!item) {
    return (
      <div className="max-w-xl mx-auto text-center pt-10 animate-rise">
        <div className="mx-auto grid place-items-center size-14 rounded-full bg-done-bg text-done"><PackageCheck className="size-7" /></div>
        <h1 className="mt-5 text-[22px] font-semibold">{data.rma} inspected</h1>
        <p className="mt-1 text-muted">{data.holdRefund ? "The refund hold is released — finance can resolve it now." : "Finance can now issue the refund, credit or replacement."}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-2 justify-center">
          <Button size="lg" onClick={() => navigate("/app/inspection")}>Next parcel</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate(`/app/returns?open=${data.id}`)}>View return</Button>
        </div>
      </div>
    );
  }

  const canSave = !!grade && !!disposition;
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <div className="max-w-2xl mx-auto pb-28">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/app/inspection" className="grid place-items-center size-10 rounded-xl border border-line bg-surface hover:bg-paper" aria-label="Back"><ArrowLeft className="size-5" /></Link>
        <div className="flex-1">
          <div className="font-mono text-[17px] font-semibold">{data.rma}</div>
          <div className="text-[13px] text-muted">Item {index + 1} of {data.items.length} · {data.customer.name}</div>
        </div>
        <div className="flex gap-1">{data.items.map((_, i) => <span key={i} className={clsx("h-1.5 w-6 rounded-full", i < index ? "bg-done" : i === index ? "bg-ink" : "bg-line")} />)}</div>
      </div>

      {data.status !== "received" && data.status !== "inspected" && (
        <div className="mb-4 rounded-xl bg-review-bg text-review px-4 py-3 text-[14px]">This parcel hasn't been marked as received yet.</div>
      )}

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-semibold leading-tight">{item.name}</h1>
            <div className="text-[13.5px] text-muted mt-0.5">{[item.variant, `Qty ${item.quantity}`].filter(Boolean).join(" · ")} · <Code>{item.sku}</Code></div>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-paper px-4 py-3">
          <div className="text-[12px] text-muted">Customer says</div>
          <div className="text-[14.5px] font-medium">{REASONS[item.reason]}</div>
          {item.reasonDetail && <p className="text-[14px] text-ink-2 mt-0.5">“{item.reasonDetail}”</p>}
          {item.ai && item.ai.reason !== item.reason && <p className="mt-1.5 text-[12.5px] text-progress flex items-center gap-1"><Sparkles className="size-3.5" /> Reads like: {REASONS[item.ai.reason]}</p>}
        </div>
        {item.photos.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-thin">
            {item.photos.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Customer photo" className="size-20 rounded-lg object-cover border border-line" /></a>)}
          </div>
        )}
      </Card>

      <h2 className="mt-6 mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">Checklist</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {(Object.keys(CHECKLIST) as (keyof Checklist)[]).map((k) => (
          <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3">
            <span className="flex-1 text-[15px] font-medium">{CHECKLIST[k].label}</span>
            <div className="grid grid-cols-2 gap-2 sm:w-[300px]">
              {(["pass", "fail"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => { setChecklist((c) => ({ ...c, [k]: v })); setSuggestion(null); }}
                  className={clsx("h-12 rounded-xl border-2 text-[14px] font-medium flex items-center justify-center gap-1.5 transition-colors",
                    checklist[k] === v ? (v === "pass" ? "border-done bg-done-bg text-done" : "border-danger bg-danger-bg text-danger") : "border-line text-muted hover:border-line-strong")}
                >
                  {v === "pass" ? <Check className="size-4" /> : <X className="size-4" />}
                  {v === "pass" ? CHECKLIST[k].pass : CHECKLIST[k].fail}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Card>

      <h2 className="mt-6 mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">Photos</h2>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative size-24 rounded-xl overflow-hidden border border-line">
            <img src={src} alt="" className="size-full object-cover" />
            <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute top-1 right-1 grid place-items-center size-6 rounded-full bg-ink/75 text-white" aria-label="Remove"><X className="size-3.5" /></button>
          </div>
        ))}
        {photos.length < 6 && (
          <button onClick={() => fileRef.current?.click()} className="size-24 rounded-xl border-2 border-dashed border-line-strong grid place-items-center text-muted hover:text-ink hover:border-faint">
            <span className="flex flex-col items-center gap-1 text-[12.5px] font-medium"><Camera className="size-6" /> Take photo</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 6)); e.target.value = ""; }} />
      </div>

      <div className="mt-6">
        {suggestion ? (
          <Card className={clsx("p-4 animate-rise", suggestion.mismatch && "border-danger/40")}>
            <div className="flex items-start gap-3">
              <span className="grid place-items-center size-9 rounded-lg bg-progress-bg text-progress shrink-0"><Sparkles className="size-4" /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold">Suggested: grade {suggestion.grade} · {DISPOSITIONS[suggestion.disposition]?.label}</div>
                <p className="text-[13.5px] text-ink-2 mt-0.5">{suggestion.explanation}</p>
                {suggestion.mismatch && <p className="mt-1.5 text-[13px] text-danger font-medium flex items-center gap-1.5"><ShieldAlert className="size-4" /> Condition doesn't match the customer's reason</p>}
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={() => { setGrade(suggestion.grade); setDisposition(suggestion.disposition); }}>Use suggestion</Button>
                  <span className="text-[11.5px] text-faint">{suggestion.source === "claude" ? "AI analysis of photos & checklist" : "Based on the checklist"} · you make the final call</span>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" size="lg" className="w-full" icon={<Sparkles className="size-4" />} loading={analyze.isPending} onClick={() => analyze.mutate()}>Suggest a grade</Button>
        )}
      </div>

      <h2 className="mt-6 mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">Grade</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.keys(GRADES) as Suggestion["grade"][]).map((g) => (
          <button key={g} onClick={() => setGrade(g)} className={clsx("rounded-xl border-2 px-3 py-3 text-left transition-colors", grade === g ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-line-strong")}>
            <div className="text-[22px] font-semibold leading-none">{g}</div>
            <div className={clsx("mt-1.5 text-[12px]", grade === g ? "text-white/70" : "text-muted")}>{GRADES[g].hint}</div>
          </button>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">What happens to it</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(DISPOSITIONS).map(([k, v]) => (
          <button key={k} onClick={() => setDisposition(k)} className={clsx("h-14 rounded-xl border-2 text-[14.5px] font-medium transition-colors", disposition === k ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-line-strong")}>
            {v.label}
          </button>
        ))}
      </div>

      <Textarea className="mt-6" label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything finance or support should know" />

      <div className="fixed bottom-0 inset-x-0 lg:left-[244px] z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="flex-1 text-[13px] text-muted">{err ? <span className="text-danger">{err.message}</span> : canSave ? `Grade ${grade} · ${DISPOSITIONS[disposition!].label}` : "Choose a grade and what happens to the item"}</span>
          <Button size="lg" disabled={!canSave} loading={save.isPending} onClick={() => save.mutate()}>{pending.length > 1 ? "Save & next item" : "Finish inspection"}</Button>
        </div>
      </div>
    </div>
  );
}
