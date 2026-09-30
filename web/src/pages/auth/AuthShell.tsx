import type { ReactNode } from "react";
import { Logo } from "@/components/ui/misc";

/**
 * Split layout: form on the left, a quiet "returns ledger" illustration on
 * the right that shows what the product does instead of a stock gradient.
 */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 sm:px-12 py-8">
        <Logo />
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[380px] mx-auto py-10 animate-rise">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em]">{title}</h1>
            <p className="mt-2 text-muted text-[14.5px]">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-8 text-[13.5px] text-muted">{footer}</div>
          </div>
        </div>
        <p className="text-[12px] text-faint">© {new Date().getFullYear()} ReturnFlow · Reverse logistics for modern commerce</p>
      </div>
      <aside className="hidden lg:flex relative overflow-hidden bg-[#131519] text-[#c9c6bf] p-12 flex-col justify-between">
        <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:100%_32px]" />
        <div className="relative">
          <p className="font-display text-[34px] leading-[1.12] text-white max-w-[460px] tracking-[-0.01em]">
            Every return, from <em className="text-kraft not-italic">doorstep</em> to <em className="text-kraft not-italic">restock</em>, on one line.
          </p>
          <p className="mt-4 max-w-[420px] text-[14.5px] text-[#9a968c]">One queue for support, the warehouse and finance. Customers get a clean portal instead of an email thread.</p>
        </div>
        <Ledger />
      </aside>
    </div>
  );
}

function Ledger() {
  const rows = [
    { rma: "RF-1042", item: "Linen Kurta · M", stage: 2, tone: "#e6b877", label: "Needs review" },
    { rma: "RF-1041", item: "Canvas Sneakers · UK 8", stage: 4, tone: "#8fb4ec", label: "In transit" },
    { rma: "RF-1039", item: "Leather Tote · Tan", stage: 6, tone: "#8fb4ec", label: "Inspected" },
    { rma: "RF-1036", item: "Silk Dupatta · Rust", stage: 7, tone: "#7fd1a3", label: "Refunded" },
  ];
  return (
    <div className="relative rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 h-11 border-b border-white/[0.07] text-[12px] text-[#8b877f]">
        <span className="font-mono">RETURN QUEUE</span>
        <span>Today</span>
      </div>
      {rows.map((r) => (
        <div key={r.rma} className="grid grid-cols-[76px_1fr_auto] items-center gap-4 px-5 h-[58px] border-b border-white/[0.05] last:border-0">
          <span className="font-mono text-[12px] text-white">{r.rma}</span>
          <div className="min-w-0">
            <div className="text-[13px] text-[#e9e6df] truncate">{r.item}</div>
            <div className="mt-1.5 flex gap-1">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < r.stage ? r.tone : "rgb(255 255 255 / 0.08)" }} />
              ))}
            </div>
          </div>
          <span className="text-[12px]" style={{ color: r.tone }}>
            {r.label}
          </span>
        </div>
      ))}
    </div>
  );
}
