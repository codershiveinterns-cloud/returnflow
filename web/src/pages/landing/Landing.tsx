import { useEffect, useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { ArrowRight, ArrowUpRight, Camera, Menu, ShieldCheck, Sparkles, X } from "lucide-react";
import { useSessionQuery } from "@/lib/session";
import { Logo } from "@/components/ui/misc";
import { ReturnLabel } from "./mocks";
import { ChaosToOrder, Developers, Faq, Features, Journey, Roles, Security, Ticker } from "./sections";

const NAV = [
  ["How it works", "#how"],
  ["Product", "#product"],
  ["Teams", "#teams"],
  ["Integrations", "#integrations"],
  ["FAQ", "#faq"],
];

export function LandingPage() {
  const { data: session } = useSessionQuery();
  useEffect(() => {
    document.title = "ReturnFlow — Returns, from doorstep to restock";
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);
  const primary = session ? { to: "/app", label: "Open your console" } : { to: "/signup", label: "Create your workspace" };

  return (
    <div className="bg-paper text-ink overflow-x-clip">
      <Nav signedIn={!!session} primary={primary} />
      <Hero primary={primary} />
      <Ticker />
      <ChaosToOrder />
      <Journey />
      <Features />
      <Roles />
      <Developers />
      <Security />
      <Faq />
      <FinalCta primary={primary} />
      <Footer />
    </div>
  );
}

function Nav({ signedIn, primary }: { signedIn: boolean; primary: { to: string; label: string } }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <header className={clsx("fixed inset-x-0 top-0 z-50 transition-[background,border-color,backdrop-filter] duration-300 border-b", scrolled || open ? "bg-paper/85 backdrop-blur-md border-line" : "bg-transparent border-transparent")}>
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center gap-8">
        <Link to="/" aria-label="ReturnFlow home"><Logo /></Link>
        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="h-9 px-3 inline-flex items-center rounded-md text-[14px] text-ink-2 hover:text-ink hover:bg-ink/[0.04] transition-colors">{label}</a>
          ))}
        </nav>
        <div className="ml-auto hidden sm:flex items-center gap-2">
          {!signedIn && <Link to="/login" className="h-9 px-3.5 inline-flex items-center rounded-lg text-[14px] font-medium text-ink-2 hover:text-ink">Sign in</Link>}
          <Link to={primary.to} className="group h-9 pl-4 pr-3 inline-flex items-center gap-1.5 rounded-lg bg-ink text-white text-[14px] font-medium hover:bg-ink-2 transition-colors">
            {signedIn ? "Open console" : "Get started"}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="ml-auto sm:ml-0 lg:hidden grid place-items-center size-10 -mr-2 rounded-lg hover:bg-ink/[0.05]" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="lg:hidden h-[calc(100dvh-64px)] bg-paper px-5 pt-4 pb-8 flex flex-col animate-fade-in">
          {NAV.map(([label, href], i) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="py-4 border-b border-line font-display text-[28px] text-ink animate-rise" style={{ animationDelay: `${i * 40}ms` }}>{label}</a>
          ))}
          <div className="mt-auto grid gap-2">
            {!signedIn && <Link to="/login" className="h-12 grid place-items-center rounded-xl border border-line-strong text-[15px] font-medium">Sign in</Link>}
            <Link to={primary.to} className="h-12 grid place-items-center rounded-xl bg-ink text-white text-[15px] font-medium">{primary.label}</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero({ primary }: { primary: { to: string; label: string } }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const rise = (d: number) => ({ className: clsx("transition-all duration-[900ms] ease-[cubic-bezier(.2,.7,.2,1)]", mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"), style: { transitionDelay: `${d}ms` } });

  return (
    <section className="relative pt-32 sm:pt-36 pb-20 sm:pb-28">
      <div className="absolute inset-0 bg-ruled opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden />
      <div className="absolute inset-0 bg-grain opacity-70 pointer-events-none" aria-hidden />
      <div className="absolute -top-40 right-[-10%] size-[640px] rounded-full bg-kraft/15 blur-[120px] pointer-events-none" aria-hidden />

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 grid grid-cols-1 gap-16 lg:gap-10 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="min-w-0">
          <div {...rise(0)}>
            <span className="inline-flex items-center gap-2 h-8 pl-2 pr-3 rounded-full border border-line-strong bg-surface/80 text-[12.5px] text-ink-2">
              <span className="size-2 rounded-full bg-kraft animate-pulse-ring" />
              Reverse logistics for D2C brands
            </span>
          </div>
          <h1 {...rise(90)} className={clsx(rise(90).className, "mt-7 font-display text-[48px] sm:text-[68px] lg:text-[76px] leading-[0.98] tracking-[-0.03em] text-ink")}>
            Returns, handled
            <br />
            from <em className="italic text-kraft-ink">doorstep</em>
            <br />
            to <em className="italic text-kraft-ink">restock.</em>
          </h1>
          <p {...rise(180)} className={clsx(rise(180).className, "mt-7 text-[18px] sm:text-[19px] leading-relaxed text-muted max-w-[520px]")}>
            ReturnFlow gives your customers a clean, branded return portal — and gives support, the warehouse and finance one shared line to work every return, from request to refund.
          </p>
          <div {...rise(270)} className={clsx(rise(270).className, "mt-9 flex flex-col sm:flex-row gap-3")}>
            <Link to={primary.to} className="group h-12 pl-5 pr-4 inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-white text-[15px] font-medium shadow-[0_10px_24px_-12px_rgb(21_23_26/0.6)] hover:bg-ink-2 transition-colors">
              {primary.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="/r/kaveri" target="_blank" rel="noreferrer" className="group h-12 px-5 inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface/70 text-[15px] font-medium text-ink hover:bg-surface transition-colors">
              Try the customer portal
              <ArrowUpRight className="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
          <div {...rise(360)} className={clsx(rise(360).className, "mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted")}>
            <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-faint">Syncs orders from</span>
            {["Shopify", "REST API", "Webhooks", "CSV"].map((s) => <span key={s} className="font-medium text-ink-2">{s}</span>)}
          </div>
        </div>

        <div className={clsx("relative mx-auto w-[calc(100%-16px)] sm:w-full max-w-[440px] transition-all duration-[1100ms] ease-[cubic-bezier(.2,.7,.2,1)]", mounted ? "opacity-100 translate-y-0 rotate-0" : "opacity-0 translate-y-10 rotate-2")} style={{ transitionDelay: "200ms" }}>
          <ReturnLabel />
          <FloatingChip className="-left-4 sm:-left-16 top-[54%]" delay="0s" rotate="-4deg">
            <Camera className="size-3.5 text-kraft-ink" /> 2 photos attached
          </FloatingChip>
          <FloatingChip className="-right-2 sm:-right-12 -top-7" delay="-2s" rotate="3deg">
            <Sparkles className="size-3.5 text-progress" /> Auto-approved · rule #3
          </FloatingChip>
          <FloatingChip className="right-4 sm:right-6 -bottom-6" delay="-4s" rotate="-2deg">
            <ShieldCheck className="size-3.5 text-done" /> Risk score 12 · low
          </FloatingChip>
        </div>
      </div>
    </section>
  );
}

function FloatingChip({ children, className, delay, rotate }: { children: React.ReactNode; className: string; delay: string; rotate: string }) {
  return (
    <div className={clsx("absolute z-10 hidden sm:flex items-center gap-2 h-9 px-3 rounded-full bg-surface border border-line text-[12.5px] font-medium text-ink shadow-[0_12px_28px_-14px_rgb(21_23_26/0.4)] animate-float", className)} style={{ animationDelay: delay, ["--r" as string]: rotate }}>
      {children}
    </div>
  );
}

function FinalCta({ primary }: { primary: { to: string; label: string } }) {
  return (
    <section className="relative bg-[#131519] text-white overflow-hidden">
      <div className="h-6 bg-tape" aria-hidden />
      <div className="absolute inset-0 top-6 opacity-[0.5] [background-image:linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:100%_32px]" aria-hidden />
      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 py-24 sm:py-32 text-center">
        <h2 className="font-display text-[40px] sm:text-[64px] leading-[1.02] tracking-[-0.025em] max-w-[860px] mx-auto">
          Make returns the <em className="italic text-kraft">calmest</em> part of your week.
        </h2>
        <p className="mt-6 text-[17px] text-[#a9a59c] max-w-[520px] mx-auto">Set up your portal, sync your orders and invite your team in an afternoon.</p>
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
          <Link to={primary.to} className="group h-12 pl-5 pr-4 inline-flex items-center justify-center gap-2 rounded-xl bg-kraft text-white text-[15px] font-semibold hover:brightness-105 transition">
            {primary.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="/r/kaveri" target="_blank" rel="noreferrer" className="h-12 px-5 inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 text-[15px] font-medium hover:bg-white/5 transition-colors">
            See a live portal <ArrowUpRight className="size-4 opacity-70" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0f1113] text-[#a9a59c]">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-4 text-[14px] max-w-[280px] leading-relaxed">Reverse logistics for modern commerce. Portal, workflow, inspection and refunds in one place.</p>
        </div>
        {[
          ["Product", [["How it works", "#how"], ["Customer portal", "#product"], ["Teams", "#teams"], ["Integrations", "#integrations"]]],
          ["Company", [["Security", "#security"], ["FAQ", "#faq"], ["Contact", "mailto:hello@returnflow.app"]]],
          ["Get started", [["Create a workspace", "/signup"], ["Sign in", "/login"], ["Customer portal", "/r/kaveri"]]],
        ].map(([title, links]) => (
          <div key={title as string}>
            <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#6f6c66]">{title as string}</div>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {(links as string[][]).map(([l, h]) => (
                <li key={l}>{h.startsWith("/") ? <Link to={h} className="hover:text-white transition-colors">{l}</Link> : <a href={h} className="hover:text-white transition-colors">{l}</a>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-14 flex items-center justify-between text-[12.5px] text-[#6f6c66]">
          <span>© {new Date().getFullYear()} ReturnFlow</span>
          <span className="font-mono">RF-∞ · handled</span>
        </div>
      </div>
    </footer>
  );
}
