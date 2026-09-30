import clsx from "clsx";
import type { ReactNode } from "react";
import { ORDER_STATUS, RETURN_STATUS, type Tone } from "@/lib/domain";

const tones: Record<Tone, string> = {
  review: "bg-review-bg text-review",
  progress: "bg-progress-bg text-progress",
  danger: "bg-danger-bg text-danger",
  done: "bg-done-bg text-done",
  neutral: "bg-paper-2 text-muted",
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[12px] font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function ReturnStatusBadge({ status }: { status: string }) {
  const m = RETURN_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const m = ORDER_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** Monospace chip for machine identifiers: RMA numbers, SKUs, keys. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("font-mono text-[12px] tracking-tight text-ink-2", className)}>{children}</span>;
}
