import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useSessionQuery } from "@/lib/session";
import { Footer, Nav } from "../landing/Landing";

/** Shared shell for public marketing & legal pages. */
export function SiteLayout({ title, children }: { title: string; children: ReactNode }) {
  const { data: session } = useSessionQuery();
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${title} · ReturnFlow`;
    window.scrollTo(0, 0);
  }, [title, pathname]);
  const primary = session ? { to: "/app", label: "Open your console" } : { to: "/signup", label: "Create your workspace" };
  return (
    <div className="bg-paper text-ink min-h-dvh flex flex-col overflow-x-clip">
      <Nav signedIn={!!session} primary={primary} />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
    </div>
  );
}

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: ReactNode; intro?: ReactNode }) {
  return (
    <section className="relative border-b border-line">
      <div className="absolute inset-0 bg-ruled opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
      <div className="relative max-w-[1100px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20 pb-12 sm:pb-14 animate-rise">
        <div className="font-mono text-[11.5px] tracking-[0.16em] uppercase text-kraft-ink">{eyebrow}</div>
        <h1 className="mt-4 font-display text-[40px] sm:text-[56px] leading-[1.02] tracking-[-0.025em] max-w-[820px]">{title}</h1>
        {intro && <p className="mt-5 text-[17px] sm:text-[18px] leading-relaxed text-muted max-w-[640px]">{intro}</p>}
      </div>
    </section>
  );
}
