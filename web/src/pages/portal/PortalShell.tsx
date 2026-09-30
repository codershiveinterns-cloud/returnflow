import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Organization } from "@/lib/domain";

/** Pick black or white text for a given brand colour (WCAG relative luminance). */
export function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? "#15171a" : "#ffffff";
}

export function PortalShell({ org, children, hero }: { org: Organization; children: ReactNode; hero?: ReactNode }) {
  const fg = readableOn(org.brandColor);
  return (
    <div className="min-h-dvh bg-paper" style={{ ["--brand" as string]: org.brandColor, ["--brand-fg" as string]: fg }}>
      <div className="relative" style={{ background: org.brandColor, color: fg }}>
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:14px_14px]" />
        <div className="relative max-w-[640px] mx-auto px-5 pt-5 pb-16">
          <Link to={`/r/${org.slug}`} className="inline-flex items-center gap-2.5">
            <span className="size-9 rounded-lg overflow-hidden grid place-items-center text-[15px] font-semibold" style={{ background: org.logoUrl ? "#fff" : "rgb(255 255 255 / 0.16)" }}>
              {org.logoUrl ? <img src={org.logoUrl} alt="" className="size-full object-contain" /> : org.name[0]}
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{org.name}</span>
          </Link>
          {hero && <div className="mt-8">{hero}</div>}
        </div>
      </div>
      <main className="relative max-w-[640px] mx-auto px-4 -mt-10 pb-16">{children}</main>
      <footer className="max-w-[640px] mx-auto px-5 pb-10 text-center text-[12px] text-faint">
        {org.supportEmail && (
          <p className="mb-2">
            Need help? <a className="underline underline-offset-2" href={`mailto:${org.supportEmail}`}>{org.supportEmail}</a>
          </p>
        )}
        Returns powered by <span className="font-medium text-muted">ReturnFlow</span>
      </footer>
    </div>
  );
}

export function BrandButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl text-[15px] font-semibold transition-[filter,opacity] hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none ${className}`}
      style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
    >
      {children}
    </button>
  );
}
