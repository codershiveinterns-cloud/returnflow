import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import clsx from "clsx";

type Toast = { id: number; tone: "success" | "error"; message: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2.5 pl-3 pr-4 h-10 rounded-lg bg-ink text-white text-[13.5px] shadow-[var(--shadow-pop)] animate-rise">
            {t.tone === "success" ? <CheckCircle2 className="size-4 text-[#7fd1a3]" /> : <AlertTriangle className={clsx("size-4 text-[#f5a38f]")} />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return { success: (message: string) => push({ tone: "success", message }), error: (message: string) => push({ tone: "error", message }) };
}
