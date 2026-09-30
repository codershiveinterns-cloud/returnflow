import { useEffect, useState } from "react";
import clsx from "clsx";
import { Check, FileSpreadsheet, Mail, MessageCircle, Minus, NotebookPen, Plus, Truck, Wallet } from "lucide-react";
import { Reveal, useInView } from "./motion";
import { AnalyticsCard, BRAND_SWATCHES, InspectionCard, PortalPhone, RiskCard, RuleCard } from "./mocks";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("font-mono text-[11.5px] tracking-[0.16em] uppercase text-kraft-ink", className)}>{children}</div>;
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={clsx("font-display text-[34px] sm:text-[46px] leading-[1.04] tracking-[-0.02em] text-ink", className)}>{children}</h2>;
}

/* ───────────────────────── Live ticker ───────────────────────── */

const EVENTS = [
  ["RF-1042", "Linen Kurta", "Pickup scheduled", "#1f5fbf", "Bengaluru"],
  ["RF-1043", "Canvas Sneakers", "Needs review", "#b26b00", "Pune"],
  ["RF-1038", "Leather Tote", "Restocked", "#1d7a4a", "Bhiwandi DC"],
  ["RF-1044", "Handloom Saree", "Flagged · high value", "#b42318", "Delhi"],
  ["RF-1036", "Silk Dupatta", "Refunded ₹749", "#1d7a4a", "Mumbai"],
  ["RF-1045", "Oxford Shirt", "In transit", "#1f5fbf", "Hyderabad"],
  ["RF-1040", "Analog Watch", "Inspected · grade B", "#1f5fbf", "Chennai"],
  ["RF-1046", "Slim Jeans", "Replacement shipped", "#1d7a4a", "Kochi"],
];

export function Ticker() {
  const row = [...EVENTS, ...EVENTS];
  return (
    <div className="relative border-y border-line bg-surface/70 overflow-hidden" aria-label="Example return activity">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-paper to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-paper to-transparent z-10" />
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {row.map(([rma, item, status, color, city], i) => (
          <div key={i} className="flex items-center gap-3 px-6 h-12 border-r border-line whitespace-nowrap text-[13px]">
            <span className="font-mono text-[12px] text-ink">{rma}</span>
            <span className="text-muted">{item}</span>
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color }}>
              <span className="size-1.5 rounded-full" style={{ background: color }} />
              {status}
            </span>
            <span className="text-faint">· {city}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Chaos → order ───────────────────────── */

const SCRAPS = [
  { icon: Mail, src: "Inbox", text: "“Hi, the kurta doesn't fit. How do I send it back??”", scatter: { left: "2%", top: "6%", r: -7 }, stage: "Requested", color: "#b26b00" },
  { icon: FileSpreadsheet, src: "returns_FINAL_v3.xlsx", text: "Row 214 — status: ??? — ask Ravi", scatter: { left: "52%", top: "0%", r: 5 }, stage: "Approved", color: "#1f5fbf" },
  { icon: MessageCircle, src: "WhatsApp", text: "“pickup kab aayega? 3 din ho gaye”", scatter: { left: "30%", top: "30%", r: -3 }, stage: "Pickup scheduled", color: "#1f5fbf" },
  { icon: Truck, src: "Courier portal", text: "AWB 7751 0932 4418 · out for pickup", scatter: { left: "62%", top: "40%", r: 8 }, stage: "In transit", color: "#1f5fbf" },
  { icon: NotebookPen, src: "Warehouse notebook", text: "Kurta M indigo — ok? tag missing", scatter: { left: "6%", top: "58%", r: 4 }, stage: "Inspected · grade B", color: "#1f5fbf" },
  { icon: Wallet, src: "Gateway dashboard", text: "Refund rfnd_Kx81… initiated manually", scatter: { left: "44%", top: "70%", r: -6 }, stage: "Refunded", color: "#1d7a4a" },
];

export function ChaosToOrder() {
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [ordered, setOrdered] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!inView || touched) return;
    const t = setTimeout(() => setOrdered(true), 1500);
    return () => clearTimeout(t);
  }, [inView, touched]);

  return (
    <section className="relative py-24 sm:py-32">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] items-center">
        <div className="min-w-0">
          <Reveal><Eyebrow>The problem</Eyebrow></Reveal>
          <Reveal delay={80}><SectionTitle className="mt-4">One return. <br className="hidden sm:block" />Six places to <em className="italic text-kraft-ink">look for it.</em></SectionTitle></Reveal>
          <Reveal delay={160}>
            <p className="mt-5 text-[17px] leading-relaxed text-muted max-w-[460px]">
              The request arrives by email, the status lives in a spreadsheet, the customer chases on WhatsApp, the courier has its own portal, the warehouse writes in a notebook and finance refunds from the gateway. Nobody sees the whole thing.
            </p>
          </Reveal>
          <Reveal delay={220}>
            <div className="mt-8 inline-flex rounded-full border border-line-strong bg-surface p-1" role="tablist" aria-label="Compare">
              {[["Today", false], ["With ReturnFlow", true]].map(([label, v]) => (
                <button
                  key={String(label)}
                  role="tab"
                  aria-selected={ordered === v}
                  onClick={() => { setTouched(true); setOrdered(v as boolean); }}
                  className={clsx("h-9 px-4 rounded-full text-[13.5px] font-medium transition-colors", ordered === v ? "bg-ink text-white" : "text-muted hover:text-ink")}
                >
                  {label}
                </button>
              ))}
            </div>
          </Reveal>
        </div>

        <div ref={ref} className="relative h-[460px] sm:h-[430px]">
          {ordered && (
            <div className="absolute -left-1 top-[18px] bottom-[18px] w-px bg-line-strong animate-fade-in hidden sm:block" aria-hidden />
          )}
          {SCRAPS.map((s, i) => {
            const Icon = s.icon;
            const style: React.CSSProperties = ordered
              ? { left: "0%", top: `${i * 72}px`, width: "100%", transform: "rotate(0deg)" }
              : { left: `min(${s.scatter.left}, calc(100% - min(290px, 62%) - 8px))`, top: s.scatter.top, width: "min(290px, 62%)", transform: `rotate(${s.scatter.r}deg)` };
            return (
              <div
                key={s.src}
                className="absolute transition-all duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]"
                style={{ ...style, transitionDelay: `${ordered ? i * 70 : (5 - i) * 50}ms` }}
              >
                <div className={clsx("flex items-center gap-3 rounded-xl border bg-surface px-3.5 py-3 transition-shadow duration-700", ordered ? "border-line shadow-none h-[60px]" : "border-line-strong shadow-[0_14px_30px_-18px_rgb(21_23_26/0.35)]")}>
                  <span className={clsx("grid place-items-center size-8 rounded-lg shrink-0 transition-colors duration-700", ordered ? "bg-paper-2 text-ink-2" : "bg-kraft-soft text-kraft-ink")}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={clsx("font-mono text-[10.5px] tracking-[0.08em] truncate transition-colors", ordered ? "text-faint" : "text-kraft-ink")}>
                      {ordered ? `RF-1042 · STEP ${i + 1}` : s.src.toUpperCase()}
                    </div>
                    <div className={clsx("text-[13px] text-ink-2 leading-snug", ordered ? "truncate" : "line-clamp-2")}>{s.text}</div>
                  </div>
                  <span
                    className={clsx("hidden sm:inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all duration-500", ordered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2")}
                    style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 10%, white)`, transitionDelay: `${ordered ? 500 + i * 80 : 0}ms` }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: s.color }} />
                    {s.stage}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Journey ───────────────────────── */

const JOURNEY = [
  ["Requested", "Customer", "Portal: order lookup, items, reason, photos."],
  ["Checked", "Rules", "Window, category, value and history checked instantly."],
  ["Approved", "Support", "Exceptions only. High value goes to a manager."],
  ["Picked up", "Courier", "Pickup booked, AWB tracked, customer notified."],
  ["Received", "Warehouse", "Scanned at the dock against the RMA."],
  ["Inspected", "Warehouse", "Checklist, photos and a condition grade."],
  ["Resolved", "Finance", "Refund, store credit or replacement issued."],
  ["Restocked", "Inventory", "Sellable stock synced back to the store."],
];

export function Journey() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  return (
    <section id="how" className="relative py-24 sm:py-32 bg-surface border-y border-line scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <div className="max-w-[640px]">
          <Reveal><Eyebrow>How it works</Eyebrow></Reveal>
          <Reveal delay={80}><SectionTitle className="mt-4">From doorstep to restock, <em className="italic text-kraft-ink">on one line.</em></SectionTitle></Reveal>
          <Reveal delay={160}><p className="mt-5 text-[17px] text-muted leading-relaxed">Every return moves through the same eight stops. Each team works its own stretch; everyone sees the whole line.</p></Reveal>
        </div>

        <div ref={ref} className="mt-16 relative">
          {/* track (desktop horizontal / mobile vertical) */}
          <div className="absolute hidden lg:block left-0 right-0 top-[15px] h-[2px] bg-line" />
          <div className="absolute hidden lg:block left-0 top-[15px] h-[2px] bg-ink origin-left transition-transform duration-[2400ms] ease-[cubic-bezier(.4,0,.2,1)]" style={{ right: 0, transform: inView ? "scaleX(1)" : "scaleX(0)" }} />
          <div className="absolute lg:hidden left-[15px] top-0 bottom-0 w-[2px] bg-line" />
          <div className="absolute lg:hidden left-[15px] top-0 w-[2px] bg-ink origin-top transition-transform duration-[2400ms] ease-[cubic-bezier(.4,0,.2,1)]" style={{ bottom: 0, transform: inView ? "scaleY(1)" : "scaleY(0)" }} />

          <ol className="relative grid gap-8 lg:grid-cols-8 lg:gap-4">
            {JOURNEY.map(([name, who, body], i) => (
              <li key={name} className="relative pl-12 lg:pl-0">
                <span
                  className={clsx("absolute left-0 lg:static grid place-items-center size-8 rounded-full border-2 text-[12px] font-semibold font-mono transition-all duration-500", inView ? "bg-ink border-ink text-white" : "bg-surface border-line-strong text-faint")}
                  style={{ transitionDelay: `${i * 290}ms` }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className={clsx("lg:mt-5 transition-all duration-500", inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")} style={{ transitionDelay: `${i * 290 + 120}ms` }}>
                  <div className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-kraft-ink">{who}</div>
                  <div className="mt-1 text-[16px] font-semibold text-ink">{name}</div>
                  <p className="mt-1 text-[13.5px] text-muted leading-snug">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Feature desk ───────────────────────── */

function Panel({ tag, title, body, children, className, delay = 0 }: { tag: string; title: string; body: string; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={clsx("group rounded-[20px] border border-line bg-surface p-6 sm:p-7 flex flex-col transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-[0_20px_40px_-28px_rgb(21_23_26/0.35)]", className)}>
      <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-faint">{tag}</div>
      <h3 className="mt-2 text-[21px] leading-tight font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="mt-2 text-[14.5px] text-muted leading-relaxed max-w-[440px]">{body}</p>
      <div className="mt-6 flex-1 flex flex-col justify-end">{children}</div>
    </Reveal>
  );
}

export function Features() {
  const [brand, setBrand] = useState(BRAND_SWATCHES[0].hex);
  return (
    <section id="product" className="py-24 sm:py-32 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-[620px]">
            <Reveal><Eyebrow>The product</Eyebrow></Reveal>
            <Reveal delay={80}><SectionTitle className="mt-4">Built for the people who <em className="italic text-kraft-ink">actually</em> handle returns.</SectionTitle></Reveal>
          </div>
          <Reveal delay={160}><p className="text-[16px] text-muted max-w-[360px] leading-relaxed">Support clears exceptions, the warehouse grades with photos, finance refunds with evidence. The busywork in between is automated.</p></Reveal>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-12 [&>*]:min-w-0">
          <Panel
            className="lg:col-span-7 lg:row-span-2"
            tag="Customer portal"
            title="A return page that looks like your store, not a ticket form."
            body="Customers find their order, pick items, choose a reason, snap photos and pick refund, store credit or a replacement. About two minutes, on any phone."
          >
            <div className="grid sm:grid-cols-[1fr_auto] gap-8 items-center">
              <div className="order-2 sm:order-1">
                <div className="text-[12.5px] font-medium text-ink-2 mb-3">Try your brand colour</div>
                <div className="flex flex-wrap gap-2">
                  {BRAND_SWATCHES.map((s) => (
                    <button key={s.hex} onClick={() => setBrand(s.hex)} className={clsx("flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border text-[13px] transition-colors", brand === s.hex ? "border-ink bg-paper" : "border-line hover:border-line-strong")}>
                      <span className="size-6 rounded-full" style={{ background: s.hex }} />
                      {s.name}
                    </button>
                  ))}
                </div>
                <ul className="mt-6 space-y-2.5 text-[14px] text-ink-2">
                  {["Your logo, colours and return policy", "Order lookup by email or phone", "Photo upload straight from the camera", "Live tracking page for every return"].map((t) => (
                    <li key={t} className="flex gap-2.5"><Check className="size-4 text-done mt-0.5 shrink-0" />{t}</li>
                  ))}
                </ul>
              </div>
              <div className="order-1 sm:order-2"><PortalPhone brand={brand} /></div>
            </div>
          </Panel>

          <Panel className="lg:col-span-5" delay={80} tag="Rules engine" title="Staff only see the exceptions." body="IF/THEN rules on value, reason, category, history or risk decide what's auto-approved, rejected or escalated.">
            <RuleCard />
          </Panel>

          <Panel className="lg:col-span-5" delay={140} tag="Warehouse" title="Inspection that settles arguments." body="A per-item checklist, photos and a condition grade on a tablet-sized screen. Restock, refurbish or write off in one tap.">
            <InspectionCard />
          </Panel>

          <Panel className="lg:col-span-6" tag="Risk detection" title="Catch serial returners before the refund goes out." body="Every request is scored on history, value, frequency and reason patterns. High-risk returns wait for inspection automatically.">
            <RiskCard />
          </Panel>

          <Panel className="lg:col-span-6" delay={80} tag="Analytics" title="Know why things come back." body="Return rate, top reasons, top returned products, refund value and processing time, exportable to CSV or PDF.">
            <AnalyticsCard />
          </Panel>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Roles ───────────────────────── */

const ROLES = [
  { id: "support", name: "Support", line: "Clears the review queue", points: ["Photos, order and customer history in one panel", "Approve, reject with a reason, or escalate", "No more copying order numbers between tabs"], rows: [["RF-1043", "Canvas Sneakers · damaged", "Needs review", "#b26b00"], ["RF-1047", "Oxford Shirt · wrong size", "Approved", "#1f5fbf"]] as string[][], stat: ["14", "waiting for review"] },
  { id: "warehouse", name: "Warehouse", line: "Receives and grades", points: ["Big tap targets, one item in focus", "Camera upload straight into the record", "Restock syncs inventory back to the store"], rows: [["RF-1038", "Leather Tote · grade A", "Restock", "#1d7a4a"], ["RF-1041", "Analog Watch · scratched", "Refurbish", "#1f5fbf"]] as string[][], stat: ["32", "parcels expected today"] },
  { id: "manager", name: "Manager", line: "Owns the exceptions", points: ["High-value and flagged returns land here", "Approve with full evidence", "Trends by reason, product and region"], rows: [["RF-1044", "Handloom Saree · ₹12,499", "Over ₹10k", "#b26b00"], ["RF-1051", "3 items · ₹41k claimed", "High risk", "#b42318"]] as string[][], stat: ["3", "escalations"] },
  { id: "finance", name: "Finance", line: "Closes the loop", points: ["Refunds and store credit with reference IDs", "COD / bank transfer marked manually", "Reconciliation-ready exports"], rows: [["RF-1036", "Silk Dupatta · ₹749", "Refunded", "#1d7a4a"], ["RF-1039", "COD · bank transfer", "Mark as paid", "#b26b00"]] as string[][], stat: ["₹48,230", "refunded this week"] },
  { id: "admin", name: "Admin", line: "Sets the rules", points: ["Branding, policy and automation rules", "Team roles with server-enforced access", "Full audit trail of every decision"], rows: [["Rule #3", "Auto-approve under ₹2,000", "Active", "#1d7a4a"], ["Team", "Ravi K. added as Warehouse", "Audited", "#1f5fbf"]] as string[][], stat: ["5", "roles, zero shared logins"] },
];

export function Roles() {
  const [active, setActive] = useState(0);
  const r = ROLES[active];
  return (
    <section id="teams" className="py-24 sm:py-32 bg-paper-2/60 border-y border-line scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal><Eyebrow>One queue, five desks</Eyebrow></Reveal>
        <Reveal delay={80}><SectionTitle className="mt-4 max-w-[720px]">Everyone works the same return. <em className="italic text-kraft-ink">Nobody sees more than they need.</em></SectionTitle></Reveal>

        <Reveal delay={160} className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr] [&>*]:min-w-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin -mx-5 px-5 lg:mx-0 lg:px-0" role="tablist">
            {ROLES.map((role, i) => (
              <button
                key={role.id}
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={clsx("text-left shrink-0 rounded-xl px-4 py-3 transition-colors", i === active ? "bg-surface border border-line shadow-sm" : "border border-transparent hover:bg-surface/60")}
              >
                <div className={clsx("text-[15px] font-semibold", i === active ? "text-ink" : "text-ink-2")}>{role.name}</div>
                <div className="text-[12.5px] text-muted whitespace-nowrap">{role.line}</div>
              </button>
            ))}
          </div>

          <div key={r.id} className="grid md:grid-cols-[1.2fr_1fr] gap-px rounded-[20px] overflow-hidden border border-line bg-line animate-rise">
            <div className="bg-surface p-7 sm:p-9">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-faint">{r.name} view</div>
              <ul className="mt-5 space-y-4">
                {r.points.map((p, i) => (
                  <li key={p} className="flex gap-3 text-[16px] text-ink animate-rise" style={{ animationDelay: `${i * 80}ms` }}>
                    <span className="mt-2.5 size-1.5 rounded-full bg-kraft shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-8 rounded-xl border border-line divide-y divide-line overflow-hidden">
                {r.rows.map(([id, text, status, color], i) => (
                  <div key={id} className="flex items-center gap-3 px-4 h-12 text-[13px] animate-rise" style={{ animationDelay: `${200 + i * 90}ms` }}>
                    <span className="font-mono text-[11.5px] text-ink w-16 shrink-0">{id}</span>
                    <span className="flex-1 min-w-0 truncate text-muted">{text}</span>
                    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11.5px] font-medium whitespace-nowrap" style={{ color, background: `color-mix(in srgb, ${color} 10%, white)` }}>
                      <span className="size-1.5 rounded-full" style={{ background: color }} />
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#131519] text-white p-7 sm:p-9 flex flex-col justify-between min-h-[220px] relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] [background-size:100%_28px]" />
              <div className="relative font-mono text-[10.5px] tracking-[0.14em] uppercase text-[#8b877f]">Right now</div>
              <div className="relative">
                <div className="font-display text-[56px] leading-none">{r.stat[0]}</div>
                <div className="mt-2 text-[14px] text-[#b9b5ad]">{r.stat[1]}</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Developers ───────────────────────── */

const SNIPPETS: Record<string, React.ReactNode> = {
  "REST API": (
    <>
      <span className="text-[#8b877f]">$</span> curl -X POST https://api.returnflow.app/v1/orders \{"\n"}
      {"  "}-H <span className="text-[#a7d4a0]">"Authorization: Bearer rf_live_…"</span> \{"\n"}
      {"  "}-d <span className="text-[#a7d4a0]">'{"{"}</span>{"\n"}
      {"    "}<span className="text-[#8fb4ec]">"order_number"</span>: <span className="text-[#a7d4a0]">"10234"</span>,{"\n"}
      {"    "}<span className="text-[#8fb4ec]">"status"</span>: <span className="text-[#a7d4a0]">"delivered"</span>,{"\n"}
      {"    "}<span className="text-[#8fb4ec]">"customer"</span>: {"{"} <span className="text-[#8fb4ec]">"email"</span>: <span className="text-[#a7d4a0]">"asha@…"</span> {"}"},{"\n"}
      {"    "}<span className="text-[#8fb4ec]">"items"</span>: [{"{"} <span className="text-[#8fb4ec]">"sku"</span>: <span className="text-[#a7d4a0]">"KRT-LIN-M"</span>, <span className="text-[#8fb4ec]">"quantity"</span>: <span className="text-[#e6b877]">1</span> {"}"}]{"\n"}
      {"  "}<span className="text-[#a7d4a0]">{"}'"}</span>{"\n\n"}
      <span className="text-[#7fd1a3]">→ 201</span> {"{"} <span className="text-[#8fb4ec]">"created"</span>: <span className="text-[#e6b877]">1</span>, <span className="text-[#8fb4ec]">"updated"</span>: <span className="text-[#e6b877]">0</span> {"}"}
    </>
  ),
  Webhook: (
    <>
      <span className="text-[#8b877f]">// Signed, replay-protected</span>{"\n"}
      <span className="text-[#e6b877]">const</span> t = Math.floor(Date.now() / <span className="text-[#e6b877]">1000</span>);{"\n"}
      <span className="text-[#e6b877]">const</span> sig = hmac(<span className="text-[#a7d4a0]">"sha256"</span>, SECRET){"\n"}
      {"  "}.update(<span className="text-[#a7d4a0]">`${"{"}t{"}"}.${"{"}body{"}"}`</span>).digest(<span className="text-[#a7d4a0]">"hex"</span>);{"\n\n"}
      <span className="text-[#e6b877]">await</span> fetch(webhookUrl, {"{"}{"\n"}
      {"  "}method: <span className="text-[#a7d4a0]">"POST"</span>,{"\n"}
      {"  "}headers: {"{"} <span className="text-[#a7d4a0]">"X-ReturnFlow-Signature"</span>: <span className="text-[#a7d4a0]">`t=${"{"}t{"}"},v1=${"{"}sig{"}"}`</span> {"}"},{"\n"}
      {"  "}body,{"\n"}
      {"}"});
    </>
  ),
  CSV: (
    <>
      <span className="text-[#8fb4ec]">order_number,placed_at,customer_email,sku,product_name,quantity,unit_price</span>{"\n"}
      1001,2026-09-02,ananya@…,KRT-LIN-M-IND,Linen Kurta,1,1899{"\n"}
      1001,2026-09-02,ananya@…,DUP-SLK-RST,Silk Dupatta,2,749{"\n"}
      1002,2026-09-03,vikram@…,SNK-CNV-8-WHT,Canvas Sneakers,1,2499{"\n\n"}
      <span className="text-[#7fd1a3]">✓ 2 new orders · 3 lines</span>{"\n"}
      <span className="text-[#e6b877]">! row 5 — customer_email is not valid (skipped)</span>
    </>
  ),
};

export function Developers() {
  const tabs = Object.keys(SNIPPETS);
  const [tab, setTab] = useState(tabs[0]);
  return (
    <section id="integrations" className="relative py-24 sm:py-32 bg-[#131519] text-[#e9e6df] overflow-hidden scroll-mt-16">
      <div className="absolute inset-0 opacity-[0.6] [background-image:linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:100%_32px]" />
      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 grid grid-cols-1 gap-14 lg:grid-cols-[0.9fr_1.1fr] items-center">
        <div className="min-w-0">
          <Reveal><Eyebrow className="!text-kraft">Order sync</Eyebrow></Reveal>
          <Reveal delay={80}><h2 className="mt-4 font-display text-[34px] sm:text-[46px] leading-[1.04] tracking-[-0.02em] text-white">Orders in from <em className="italic text-kraft">wherever they live.</em></h2></Reveal>
          <Reveal delay={160}><p className="mt-5 text-[17px] text-[#a9a59c] leading-relaxed max-w-[460px]">Connect Shopify in a minute, push from your own checkout over the API, or drop in a CSV. Orders match on order number, so re-syncs update and never duplicate.</p></Reveal>
          <Reveal delay={220}>
            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 max-w-[440px]">
              {[["Shopify", "Pull + real-time webhooks"], ["REST API", "Per-workspace keys"], ["Webhooks", "HMAC-signed, 5-min window"], ["CSV", "Preview before import"]].map(([k, v]) => (
                <div key={k} className="border-t border-white/10 pt-3">
                  <dt className="text-[15px] font-semibold text-white">{k}</dt>
                  <dd className="text-[13.5px] text-[#8b877f]">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        <Reveal delay={120} className="min-w-0">
          <div className="rounded-2xl border border-white/10 bg-[#0d0e10] shadow-[0_40px_80px_-40px_rgb(0_0_0/0.8)] overflow-hidden">
            <div className="flex items-center gap-1 px-3 h-11 border-b border-white/[0.07]">
              <span className="flex gap-1.5 mr-3">{[0, 1, 2].map((k) => <span key={k} className="size-2.5 rounded-full bg-white/10" />)}</span>
              {tabs.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={clsx("h-7 px-3 rounded-md text-[12.5px] font-medium transition-colors", tab === t ? "bg-white/10 text-white" : "text-[#8b877f] hover:text-white")}>{t}</button>
              ))}
            </div>
            <pre key={tab} className="p-5 sm:p-6 text-[12.5px] leading-[1.75] font-mono text-[#d9d5cc] overflow-x-auto scrollbar-thin min-h-[300px] animate-fade-in">{SNIPPETS[tab]}</pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Security spec sheet ───────────────────────── */

const SPECS = [
  ["Tenant isolation", "Each business's orders, returns and customers are scoped server-side on every query."],
  ["Role-enforced API", "Permissions are checked on the server for every request — not just hidden in the UI."],
  ["Private evidence", "Customer and inspection photos live in access-controlled storage, never public URLs."],
  ["Encrypted secrets", "Store tokens and webhook secrets are encrypted at rest with AES-256-GCM."],
  ["Audit trail", "Approvals, rule overrides, refunds and inventory changes are logged with who and when."],
  ["Signed integrations", "Shopify HMAC and signed webhooks with replay protection."],
];

export function Security() {
  return (
    <section id="security" className="py-24 sm:py-32 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] [&>*]:min-w-0">
        <div>
          <Reveal><Eyebrow>Trust</Eyebrow></Reveal>
          <Reveal delay={80}><SectionTitle className="mt-4">Refunds are money. <em className="italic text-kraft-ink">We treat them that way.</em></SectionTitle></Reveal>
        </div>
        <Reveal delay={120}>
          <dl className="border-t border-ink">
            {SPECS.map(([k, v]) => (
              <div key={k} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-6 py-5 border-b border-line">
                <dt className="font-mono text-[12px] tracking-[0.08em] uppercase text-ink">{k}</dt>
                <dd className="text-[15px] text-muted leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */

const FAQS = [
  ["Do my customers need an account?", "No. They look up their order with the order number and the email or phone they used at checkout. The session is scoped to that one order."],
  ["We run on Shopify. How long does setup take?", "Create a custom app with read access to orders, paste the token, and ReturnFlow pulls your history and listens for new orders in real time."],
  ["We're not on Shopify.", "Push orders from any checkout or ERP with the REST API or a signed webhook, or upload a CSV export. All three land in the same place."],
  ["Can we run more than one brand?", "Yes. Each brand is its own isolated workspace with its own portal, team, rules and data."],
  ["How do refunds work for COD orders?", "Refunds go through your existing gateway (Razorpay, Stripe or Shopify refunds). COD and bank-transfer refunds can be marked as paid manually with a reference."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 sm:py-28 bg-surface border-t border-line scroll-mt-16">
      <div className="max-w-[860px] mx-auto px-5 sm:px-8">
        <Reveal><Eyebrow className="text-center">Questions</Eyebrow></Reveal>
        <Reveal delay={80}><SectionTitle className="mt-4 text-center">Things people ask first</SectionTitle></Reveal>
        <Reveal delay={140} className="mt-12 border-t border-line">
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q} className="border-b border-line">
                <button onClick={() => setOpen(isOpen ? null : i)} className="w-full flex items-center justify-between gap-6 py-5 text-left" aria-expanded={isOpen}>
                  <span className="text-[17px] font-medium text-ink">{q}</span>
                  <span className={clsx("grid place-items-center size-8 rounded-full border shrink-0 transition-colors", isOpen ? "bg-ink border-ink text-white" : "border-line-strong text-muted")}>
                    {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
                  </span>
                </button>
                <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                  <div className="overflow-hidden">
                    <p className="pb-6 pr-14 text-[15.5px] text-muted leading-relaxed">{a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
