import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertCircle, ArrowLeft, Check, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { JOURNEY, REASONS, RESOLUTIONS, RETURN_STATUS, type Organization } from "@/lib/domain";
import { date, dateTime, money } from "@/lib/format";
import { Spinner } from "@/components/ui/Spinner";
import { BrandButton, PortalShell } from "./PortalShell";

type Tracked = {
  rma: string; status: string; resolution: string; orderNumber: string; createdAt: string; valueMinor: number; currency: string;
  items: { name: string; variant: string | null; quantity: number; reason: string }[];
  timeline: { status: string | null; message: string; at: string }[];
};

export function TrackPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const info = useQuery({ queryKey: ["portal", slug], queryFn: () => api<{ organization: Organization }>(`/portal/${slug}`), retry: false });
  const [rma, setRma] = useState(params.get("rma") ?? "");
  const [contact, setContact] = useState("");
  const track = useMutation({ mutationFn: () => api<Tracked>(`/portal/${slug}/track`, { method: "POST", body: { rma, contact } }) });
  const err = track.error instanceof ApiError ? track.error : null;

  useEffect(() => {
    if (info.data) document.title = `Track a return · ${info.data.organization.name}`;
  }, [info.data]);

  if (info.isLoading) return <div className="min-h-dvh grid place-items-center text-muted"><Spinner className="size-5" /></div>;
  if (!info.data) return <div className="min-h-dvh grid place-items-center text-muted">This return portal doesn't exist.</div>;
  const t = track.data;

  return (
    <PortalShell
      org={info.data.organization}
      hero={
        t ? (
          <>
            <p className="text-[13px] opacity-75">Return · order #{t.orderNumber}</p>
            <h1 className="font-mono text-[30px] font-semibold tracking-tight">{t.rma}</h1>
          </>
        ) : (
          <>
            <h1 className="font-display text-[34px] leading-[1.05]">Track a return</h1>
            <p className="mt-2 text-[15px] opacity-80">Use the return number from your confirmation.</p>
          </>
        )
      }
    >
      <div className="bg-surface rounded-2xl border border-line shadow-[0_12px_32px_-16px_rgb(21_23_26/0.18)] animate-rise" key={t ? "t" : "f"}>
        {!t ? (
          <form
            className="p-5 sm:p-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              track.mutate();
            }}
          >
            <label className="block">
              <span className="text-[13.5px] font-medium text-ink-2">Return number</span>
              <input value={rma} onChange={(e) => setRma(e.target.value)} placeholder="RF-1001" className="mt-1.5 w-full h-12 rounded-xl border border-line-strong px-4 text-[16px] font-mono outline-none focus:border-ink" autoFocus={!rma} />
            </label>
            <label className="block">
              <span className="text-[13.5px] font-medium text-ink-2">Email or phone number</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="The one on your order" className="mt-1.5 w-full h-12 rounded-xl border border-line-strong px-4 text-[16px] outline-none focus:border-ink" autoFocus={!!rma} />
            </label>
            {err && (
              <div className="flex gap-2.5 rounded-xl bg-danger-bg text-danger px-4 py-3 text-[14px]">
                <AlertCircle className="size-4 mt-0.5 shrink-0" /> {err.fields?.[0]?.message ?? err.message}
              </div>
            )}
            <BrandButton type="submit" className="w-full" disabled={track.isPending}>
              {track.isPending ? <Spinner className="size-4" /> : <Search className="size-4" />} Check status
            </BrandButton>
          </form>
        ) : (
          <div>
            <div className="p-5 sm:p-6">
              <div className="text-[13px] text-muted">Current status</div>
              <div className="text-[22px] font-semibold">{RETURN_STATUS[t.status]?.customer ?? t.status}</div>
              <Journey status={t.status} />
            </div>
            <div className="border-t border-line p-5 sm:p-6">
              <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint mb-3">Items</h2>
              <ul className="space-y-2.5">
                {t.items.map((i, k) => (
                  <li key={k} className="flex justify-between gap-3 text-[14.5px]">
                    <span>
                      {i.name} {i.variant && <span className="text-muted">· {i.variant}</span>}
                      <span className="block text-[13px] text-muted">{REASONS[i.reason]}</span>
                    </span>
                    <span className="text-muted tabular">×{i.quantity}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl bg-paper px-4 py-3 flex justify-between text-[14px]">
                <span className="text-muted">{RESOLUTIONS[t.resolution]?.label}</span>
                {t.resolution !== "replacement" && <span className="font-semibold tabular">{money(t.valueMinor, t.currency)}</span>}
              </div>
            </div>
            <div className="border-t border-line p-5 sm:p-6">
              <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint mb-3">History</h2>
              <ol className="space-y-3">
                {[...t.timeline].reverse().map((e, i) => (
                  <li key={i} className="flex gap-3 text-[14px]">
                    <span className="mt-1.5 size-2 rounded-full shrink-0" style={{ background: i === 0 ? "var(--brand)" : "var(--color-line-strong)" }} />
                    <span>
                      {RETURN_STATUS[e.status ?? ""]?.customer ?? e.message}
                      <span className="block text-[12.5px] text-muted">{dateTime(e.at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[12.5px] text-muted">Requested {date(t.createdAt)}. We'll email you at every step.</p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-5 text-center">
        {t ? (
          <button onClick={() => track.reset()} className="text-[14px] text-muted hover:text-ink">Track another return</button>
        ) : (
          <Link to={`/r/${slug}`} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Start a new return
          </Link>
        )}
      </div>
    </PortalShell>
  );
}

function Journey({ status }: { status: string }) {
  const rejected = status === "rejected";
  const idx = Math.max(0, JOURNEY.indexOf((status === "replaced" || status === "closed" ? "refunded" : status) as (typeof JOURNEY)[number]));
  const labels = ["Requested", "Approved", "Pickup", "In transit", "Received", "Inspected", "Resolved"];
  if (rejected) return <p className="mt-3 text-[14px] text-danger">This request wasn't approved. Check your email for details.</p>;
  return (
    <ol className="mt-5 grid grid-cols-7 gap-1">
      {labels.map((l, i) => (
        <li key={l} className="flex flex-col items-center text-center">
          <span className={clsx("grid place-items-center size-6 rounded-full text-[11px] font-semibold", i > idx && "bg-paper-2 text-faint")} style={i <= idx ? { background: "var(--brand)", color: "var(--brand-fg)" } : undefined}>
            {i < idx ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
          </span>
          <span className={clsx("mt-1.5 text-[10.5px] sm:text-[11.5px] leading-tight", i === idx ? "text-ink font-medium" : "text-faint")}>{l}</span>
        </li>
      ))}
    </ol>
  );
}
