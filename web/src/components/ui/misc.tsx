import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { initials } from "@/lib/format";

export function Avatar({ name, size = 28, className }: { name?: string | null; size?: number; className?: string }) {
  // Stable, muted hue per person — never the status colours.
  const hues = ["#e8dfd0", "#dfe3d6", "#d9e0e6", "#e6dbe0", "#e3ddd2", "#d8e2dc"];
  const bg = hues[[...(name ?? "")].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  return (
    <span className={clsx("inline-grid place-items-center rounded-full font-semibold text-ink-2 shrink-0", className)} style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}>
      {initials(name)}
    </span>
  );
}

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className={clsx("inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12.5px] font-medium text-ink-2 hover:bg-paper-2", className)}
    >
      {done ? <Check className="size-3.5 text-done" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex items-center gap-1 border-b border-line overflow-x-auto scrollbar-thin">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            "relative h-10 px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors",
            value === t.id ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:bg-ink after:rounded-full" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-[12px] text-faint tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between px-4 h-12 border-t border-line text-[13px] text-muted">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid place-items-center size-8 rounded-md hover:bg-paper-2 disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-1 tabular">
          {page} / {pages}
        </span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid place-items-center size-8 rounded-md hover:bg-paper-2 disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Two-column label/value list used in detail panels. */
export function DefinitionList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={clsx("grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2.5 text-[13.5px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-ink min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill={inverted ? "#f5f3ee" : "#15171a"} />
        <path d="M9 12.5h10.5a4.5 4.5 0 0 1 0 9H13" fill="none" stroke="#c48a3f" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M12.5 8.5 8.5 12.5l4 4" fill="none" stroke="#c48a3f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={clsx("font-semibold tracking-[-0.02em] text-[16px]", inverted ? "text-white" : "text-ink")}>ReturnFlow</span>
    </span>
  );
}
