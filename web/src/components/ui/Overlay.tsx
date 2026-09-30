import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { X } from "lucide-react";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, subtitle, actions, children, width = "max-w-[640px]" }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/25 animate-fade-in" onClick={onClose} />
      <aside className={clsx("relative h-full w-full bg-paper shadow-[var(--shadow-drawer)] flex flex-col animate-slide-in", width)}>
        <header className="flex items-start gap-3 px-6 py-4 border-b border-line bg-surface">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-ink truncate">{title}</div>
            {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
          </div>
          {actions}
          <button onClick={onClose} className="grid place-items-center size-8 rounded-md text-muted hover:bg-paper-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} />
      <div className={clsx("relative w-full bg-surface rounded-xl shadow-[var(--shadow-pop)] border border-line animate-rise", { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size])}>
        <div className="px-6 pt-5 pb-1 pr-12">
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-[13.5px] text-muted">{description}</p>}
        </div>
        <button onClick={onClose} className="absolute top-4 right-4 grid place-items-center size-8 rounded-md text-muted hover:bg-paper-2" aria-label="Close">
          <X className="size-4" />
        </button>
        {children && <div className="px-6 py-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-line bg-paper/60 rounded-b-xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
