import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import clsx from "clsx";

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fires once when the element scrolls into view. */
export function useInView<T extends Element = HTMLDivElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return setInView(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: ElementType }) {
  const [ref, inView] = useInView<HTMLElement>(0.15);
  return (
    <Tag ref={ref} className={clsx("reveal", inView && "is-in", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** Steps through 0..length-1 on an interval while `active`. */
export function useCycle(length: number, ms: number, active = true) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    const t = setInterval(() => setI((n) => (n + 1) % length), ms);
    return () => clearInterval(t);
  }, [length, ms, active]);
  return [i, setI] as const;
}

export function CountUp({ to, duration = 1400, format = (n: number) => Math.round(n).toLocaleString("en-IN"), start }: { to: number; duration?: number; format?: (n: number) => string; start: boolean }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion()) return setValue(to);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, start]);
  return <span className="tabular">{format(value)}</span>;
}

/** Types a string out character by character once `start` is true. */
export function useTypewriter(text: string, start: boolean, speed = 28) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion()) return setN(text.length);
    setN(0);
    const t = setInterval(() => setN((c) => (c >= text.length ? (clearInterval(t), c) : c + 1)), speed);
    return () => clearInterval(t);
  }, [text, start, speed]);
  return text.slice(0, n);
}
