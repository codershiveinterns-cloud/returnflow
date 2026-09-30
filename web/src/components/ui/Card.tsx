import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx("min-w-0 bg-surface border border-line rounded-[var(--radius-card)]", className)}>{children}</section>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={clsx("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">{eyebrow}</div>}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-muted max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center text-center px-6 py-14", className)}>
      {icon && <div className="mb-4 grid place-items-center size-11 rounded-xl bg-paper-2 text-muted">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 text-[13.5px] text-muted max-w-sm">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-paper-2", className)} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx("border-0 border-t border-line", className)} />;
}
