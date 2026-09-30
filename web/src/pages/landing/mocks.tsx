import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { Camera, Check, CreditCard, Gift, PackageCheck, RefreshCcw, ShieldAlert, Search } from "lucide-react";
import { useCycle, useInView, useTypewriter, CountUp } from "./motion";

/* ───────────────────────── Hero: return label ───────────────────────── */

const LABEL_STAGES = [
  { label: "Requested", color: "#b26b00", note: "Photo attached · within window" },
  { label: "Approved", color: "#1f5fbf", note: "Auto-approved by rule #3" },
  { label: "Picked up", color: "#1f5fbf", note: "Delhivery · AWB 7751 0932 4418" },
  { label: "Inspected", color: "#1f5fbf", note: "Grade A · tags intact" },
  { label: "Restocked", color: "#1d7a4a", note: "+1 KRT-LIN-M-IND synced to Shopify" },
  { label: "Refunded", color: "#1d7a4a", note: "₹1,899 → store credit" },
];

function Barcode({ seed = 7, className }: { seed?: number; className?: string }) {
  const bars = Array.from({ length: 46 }, (_, i) => ((i * 7919 + seed * 104729) % 11) % 4);
  return (
    <svg viewBox="0 0 184 40" preserveAspectRatio="none" className={className} aria-hidden>
      {bars.reduce<{ x: number; els: React.ReactElement[] }>(
        (acc, w, i) => {
          const width = w + 1;
          if (i % 2 === 0) acc.els.push(<rect key={i} x={acc.x} y={0} width={width} height={40} fill="currentColor" />);
          acc.x += width + 1.1;
          return acc;
        },
        { x: 0, els: [] },
      ).els}
    </svg>
  );
}

export function ReturnLabel() {
  const [i] = useCycle(LABEL_STAGES.length, 2400);
  const stage = LABEL_STAGES[i];
  return (
    <div className="relative">
      {/* Carton flap behind the label */}
      <div className="absolute -inset-3 sm:-inset-8 rounded-[28px] bg-[#d9b27a] rotate-[4deg] shadow-[0_30px_60px_-30px_rgb(90_60_20/0.55)] bg-grain" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 bg-tape opacity-70" />
      </div>

      <div className="relative rotate-[-2.5deg] rounded-[14px] bg-[#fffdf8] shadow-[0_1px_0_rgb(0_0_0/0.04),0_24px_48px_-20px_rgb(21_23_26/0.45)] overflow-hidden">
        {/* perforation */}
        <div className="absolute left-0 right-0 top-[92px] border-t-2 border-dashed border-[#e2dccf]" aria-hidden />
        <div className="flex items-start justify-between px-6 pt-5">
          <div>
            <div className="font-mono text-[10.5px] tracking-[0.14em] text-muted">RETURN AUTHORISATION</div>
            <div className="mt-1 font-mono text-[34px] leading-none font-semibold tracking-tight text-ink">RF-1042</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10.5px] tracking-[0.14em] text-muted">ORDER</div>
            <div className="mt-1 font-mono text-[15px] text-ink">#10234</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 px-6 pt-8 pb-4 text-[12.5px]">
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-faint">FROM</div>
            <div className="mt-1 font-medium text-ink">Ananya Rao</div>
            <div className="text-muted leading-snug">Indiranagar, Bengaluru<br />560038</div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-faint">TO</div>
            <div className="mt-1 font-medium text-ink">Kaveri & Co. Returns</div>
            <div className="text-muted leading-snug">Bay 4, Bhiwandi DC<br />421302</div>
          </div>
        </div>

        <div className="mx-6 flex items-center gap-3 rounded-lg bg-paper px-3 py-2.5">
          <div className="grid place-items-center size-9 rounded-md bg-surface border border-line font-semibold text-[12px] text-muted">LK</div>
          <div className="min-w-0 flex-1 text-[12.5px]">
            <div className="font-medium text-ink truncate">Linen Kurta · M / Indigo</div>
            <div className="text-muted">Doesn't fit — “tight at the shoulders”</div>
          </div>
          <Camera className="size-4 text-faint" />
        </div>

        <div className="px-6 pt-5 pb-5 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Barcode className="h-10 w-full text-ink" />
            <div className="mt-1 font-mono text-[10px] tracking-[0.3em] text-muted">RF1042 KAV 10234</div>
          </div>
          <div className="relative w-[118px] h-[62px] shrink-0">
            <div
              key={i}
              className="animate-stamp absolute inset-0 grid place-items-center rounded-md border-[2.5px] font-mono text-[13px] font-bold tracking-[0.12em] uppercase"
              style={{ color: stage.color, borderColor: stage.color, background: `color-mix(in srgb, ${stage.color} 6%, transparent)` }}
            >
              {stage.label}
            </div>
          </div>
        </div>

        <div className="border-t border-[#ece6d9] bg-[#faf6ee] px-6 py-3 flex items-center gap-3">
          <div className="flex gap-1">
            {LABEL_STAGES.map((s, k) => (
              <span key={s.label} className="h-1.5 w-5 rounded-full transition-colors duration-500" style={{ background: k <= i ? stage.color : "#e2dccf" }} />
            ))}
          </div>
          <span key={`n${i}`} className="text-[12px] text-ink-2 truncate animate-fade-in">{stage.note}</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Portal phone ───────────────────────── */

export const BRAND_SWATCHES = [
  { name: "Terracotta", hex: "#8a3b12" },
  { name: "Forest", hex: "#1d4d4f" },
  { name: "Ink", hex: "#1f2a37" },
  { name: "Plum", hex: "#5b2150" },
];

export function PortalPhone({ brand }: { brand: string }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [step] = useCycle(4, 2600, inView);
  return (
    <div ref={ref} className="relative mx-auto w-[248px] rounded-[40px] bg-[#16181b] p-[9px] shadow-[0_40px_80px_-30px_rgb(21_23_26/0.55)]">
      <div className="relative h-[492px] rounded-[32px] bg-paper overflow-hidden">
        <div className="absolute left-1/2 top-2 -translate-x-1/2 h-5 w-20 rounded-full bg-[#16181b] z-10" />
        <div className="px-4 pt-10 pb-10 text-white transition-colors duration-500" style={{ background: brand }}>
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-md bg-white/20 grid place-items-center text-[10px] font-semibold">K</span>
            <span className="text-[11.5px] font-semibold">Kaveri & Co.</span>
          </div>
          <div className="mt-4 font-display text-[19px] leading-tight">
            {["Start a return", "What's going back?", "What went wrong?", "Request received"][step]}
          </div>
        </div>
        <div className="-mt-6 mx-3 rounded-2xl bg-surface border border-line p-3 shadow-sm" key={step}>
          {step === 0 && (
            <div className="space-y-2 animate-rise">
              <div className="h-9 rounded-lg border border-line px-3 flex items-center text-[11px] text-ink font-mono">10234</div>
              <div className="h-9 rounded-lg border border-line px-3 flex items-center text-[11px] text-ink">ananya@…</div>
              <div className="h-9 rounded-lg grid place-items-center text-[11.5px] font-semibold text-white gap-1 transition-colors" style={{ background: brand }}>
                <span className="flex items-center gap-1.5"><Search className="size-3" /> Find my order</span>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-2 animate-rise">
              {[["Linen Kurta", "M / Indigo", true], ["Silk Dupatta", "Rust", false]].map(([n, v, on]) => (
                <div key={String(n)} className="flex items-center gap-2 rounded-lg border-2 p-2" style={{ borderColor: on ? brand : "var(--color-line)" }}>
                  <span className="grid place-items-center size-4 rounded" style={{ background: on ? brand : "transparent", border: on ? "none" : "1.5px solid var(--color-line-strong)" }}>
                    {on && <Check className="size-3 text-white" strokeWidth={3} />}
                  </span>
                  <div className="text-[11px] leading-tight"><div className="font-medium">{n}</div><div className="text-muted">{v}</div></div>
                </div>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-1.5 animate-rise">
              {["Doesn't fit", "Damaged", "Wrong item"].map((r, k) => (
                <div key={r} className="rounded-lg border-2 px-2.5 py-1.5 text-[11px] font-medium" style={{ borderColor: k === 0 ? brand : "var(--color-line)" }}>{r}</div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <div className="size-9 rounded-md bg-[#c9a57a]" />
                <div className="size-9 rounded-md border border-dashed border-line-strong grid place-items-center"><Camera className="size-3.5 text-faint" /></div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="text-center py-2 animate-rise">
              <div className="mx-auto grid place-items-center size-9 rounded-full text-white" style={{ background: brand }}><PackageCheck className="size-4.5" /></div>
              <div className="mt-2 text-[10px] text-muted">Your return number</div>
              <div className="font-mono text-[17px] font-semibold">RF-1042</div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {[CreditCard, Gift, RefreshCcw].map((I, k) => (
                  <div key={k} className="h-7 rounded-md grid place-items-center" style={{ background: k === 1 ? brand : "var(--color-paper-2)", color: k === 1 ? "#fff" : "var(--color-muted)" }}><I className="size-3.5" /></div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5">
          {[0, 1, 2, 3].map((k) => <span key={k} className="h-1 rounded-full transition-all duration-500" style={{ width: k === step ? 18 : 6, background: k === step ? brand : "var(--color-line-strong)" }} />)}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Rules engine ───────────────────────── */

const RULES = [
  { when: "return value > ₹10,000", then: "require manager approval" },
  { when: "risk score is high", then: "hold refund until inspection" },
  { when: "reason is “changed mind” and days > 30", then: "reject with policy note" },
];

export function RuleCard() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [idx] = useCycle(RULES.length, 4200, inView);
  const rule = RULES[idx];
  const typed = useTypewriter(`IF ${rule.when}\nTHEN ${rule.then}`, inView, 24);
  const [ifLine, thenLine = ""] = typed.split("\n");
  return (
    <div ref={ref} className="rounded-xl bg-[#131519] text-[#d9d5cc] p-4 font-mono text-[12.5px] leading-relaxed min-h-[132px]">
      <div className="flex items-center justify-between text-[10.5px] tracking-[0.12em] text-[#8b877f] mb-3">
        <span>RULE #{idx + 3}</span>
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#7fd1a3]" />ACTIVE</span>
      </div>
      <div><span className="text-[#e6b877]">{ifLine.slice(0, 2)}</span>{ifLine.slice(2)}</div>
      <div className="min-h-[1.6em]">
        <span className="text-[#8fb4ec]">{thenLine.slice(0, 4)}</span>
        {thenLine.slice(4)}
        <span className="inline-block w-[7px] h-[14px] -mb-[2px] ml-0.5 bg-[#e6b877] animate-caret" />
      </div>
    </div>
  );
}

/* ───────────────────────── Inspection ───────────────────────── */

const CHECKS = ["Original packaging", "Tags attached", "No visible damage", "Unworn / unused"];

export function InspectionCard() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setDone((d) => (d >= CHECKS.length + 3 ? 0 : d + 1)), 700);
    return () => clearInterval(t);
  }, [inView]);
  const complete = done >= CHECKS.length;
  return (
    <div ref={ref} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-medium">RF-1042 · Linen Kurta</div>
        <span className="font-mono text-[10.5px] text-faint">1 / 1</span>
      </div>
      <ul className="mt-3 space-y-2">
        {CHECKS.map((c, i) => (
          <li key={c} className="flex items-center gap-2.5 text-[13px]">
            <span className={clsx("grid place-items-center size-5 rounded-md border transition-colors", i < done ? "bg-done border-done" : "border-line-strong")}>
              {i < done && <Check className="size-3.5 text-white animate-tick" strokeWidth={3} />}
            </span>
            <span className={i < done ? "text-ink" : "text-muted"}>{c}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2">
        {["A", "B", "C", "D"].map((g) => (
          <span key={g} className={clsx("grid place-items-center size-8 rounded-lg border text-[13px] font-semibold transition-all duration-300", complete && g === "A" ? "bg-ink text-white border-ink scale-105" : "border-line text-muted")}>{g}</span>
        ))}
        <span className={clsx("ml-auto text-[12px] font-medium transition-opacity duration-300", complete ? "opacity-100 text-done" : "opacity-0")}>→ Restock</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Risk ───────────────────────── */

const RISKS = [
  { rma: "RF-1049", who: "Priya N.", score: 12, note: "First return" },
  { rma: "RF-1050", who: "Rahul M.", score: 34, note: "Size exchange, 2nd this year" },
  { rma: "RF-1051", who: "K. Verma", score: 88, note: "6 returns in 30 days · ₹41k claimed", flag: true },
  { rma: "RF-1052", who: "Sneha K.", score: 21, note: "Damaged · photo matches claim" },
];

export function RiskCard() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  return (
    <div ref={ref} className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
      {RISKS.map((r, i) => (
        <div key={r.rma} className={clsx("grid grid-cols-[64px_1fr_92px] items-center gap-3 px-4 h-[54px]", r.flag && "bg-danger-bg/50")}>
          <span className="font-mono text-[11.5px] text-ink">{r.rma}</span>
          <div className="min-w-0">
            <div className="text-[12.5px] text-ink truncate flex items-center gap-1.5">
              {r.who} {r.flag && <ShieldAlert className="size-3.5 text-danger" />}
            </div>
            <div className="text-[11.5px] text-muted truncate">{r.note}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-paper-2 overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-[1200ms] ease-out" style={{ width: inView ? `${r.score}%` : "0%", transitionDelay: `${i * 140}ms`, background: r.score > 70 ? "var(--color-danger)" : r.score > 30 ? "var(--color-review)" : "var(--color-done)" }} />
            </div>
            <span className="text-[11.5px] tabular text-ink-2 w-6 text-right">{r.score}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Analytics ───────────────────────── */

const WEEK = [18, 24, 21, 30, 27, 36, 22, 19, 26, 31, 28, 24, 17, 20];

export function AnalyticsCard() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const max = Math.max(...WEEK);
  return (
    <div ref={ref} className="grid gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line rounded-xl overflow-hidden border border-line">
        {[
          { label: "Return rate", to: 8.4, fmt: (n: number) => `${n.toFixed(1)}%` },
          { label: "Avg. resolution", to: 3.2, fmt: (n: number) => `${n.toFixed(1)}d` },
          { label: "Restocked", to: 71, fmt: (n: number) => `${Math.round(n)}%` },
          { label: "Refund value", to: 482300, fmt: (n: number) => `₹${(n / 100000).toFixed(2)}L` },
        ].map((k) => (
          <div key={k.label} className="bg-surface px-4 py-3.5">
            <div className="text-[11.5px] text-muted">{k.label}</div>
            <div className="mt-1 text-[20px] font-semibold tracking-[-0.02em] whitespace-nowrap"><CountUp to={k.to} start={inView} format={k.fmt} /></div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-[5px] h-[104px]">
        {WEEK.map((v, i) => (
          <div key={i} className="flex-1 rounded-t-[4px] origin-bottom" style={{ height: `${(v / max) * 100}%`, background: i === 5 ? "var(--color-kraft)" : "var(--color-ink)", transform: inView ? "scaleY(1)" : "scaleY(0)", transition: `transform 700ms cubic-bezier(.2,.8,.2,1) ${i * 45}ms` }} />
        ))}
      </div>
    </div>
  );
}
