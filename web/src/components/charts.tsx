import { useState } from "react";
import { date } from "@/lib/format";

/**
 * Single-series daily bar chart. One hue (ink), thin bars with 4px rounded
 * tops anchored to the baseline, recessive grid, and a per-bar hover tooltip.
 */
export function DailyBars({ data, valueKey, label }: { data: { date: string; [k: string]: number | string }[]; valueKey: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => Number(d[valueKey]));
  const max = Math.max(4, ...values);
  const nice = Math.ceil(max / 4) * 4;
  const W = 560, H = 168, padL = 28, padB = 22, padT = 8;
  const innerW = W - padL, innerH = H - padB - padT;
  const step = innerW / data.length;
  const barW = Math.min(18, step - 6);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${label} per day, last ${data.length} days`}>
        {[0, 0.5, 1].map((t) => {
          const y = padT + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--color-line)" strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={padL - 8} y={y + 3.5} textAnchor="end" className="fill-faint text-[10px] tabular">
                {Math.round(nice * t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const v = Number(d[valueKey]);
          const h = (v / nice) * innerH;
          const x = padL + i * step + (step - barW) / 2;
          const y = padT + innerH - h;
          const r = Math.min(4, h / 2);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * step} y={padT} width={step} height={innerH} fill="transparent" />
              {v > 0 && (
                <path
                  d={`M${x},${padT + innerH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${padT + innerH} Z`}
                  fill={hover === i ? "var(--color-kraft)" : "var(--color-ink)"}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                  className="transition-opacity"
                />
              )}
              {(i === 0 || i === data.length - 1 || i % 7 === 0) && (
                <text x={padL + i * step + step / 2} y={H - 6} textAnchor="middle" className="fill-faint text-[10px]">
                  {date(d.date, { day: "numeric", month: "short" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-ink text-white px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-pop)] whitespace-nowrap"
          style={{ left: `${((padL + hover * step + step / 2) / W) * 100}%`, top: 0 }}
        >
          <span className="text-[#b9b5ad]">{date(data[hover].date, { weekday: "short", day: "numeric", month: "short" })}</span>
          <span className="ml-2 font-semibold tabular">
            {Number(data[hover][valueKey])} {label.toLowerCase()}
          </span>
        </div>
      )}
    </div>
  );
}

/** Horizontal magnitude bars for a ranked breakdown (one hue, values in ink). */
export function RankedBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="group" title={`${r.label}: ${r.value} (${Math.round((r.value / total) * 100)}%)`}>
          <div className="flex items-baseline justify-between text-[13px] mb-1.5">
            <span className="text-ink-2">{r.label}</span>
            <span className="tabular text-muted">
              <span className="text-ink font-medium">{r.value}</span> · {Math.round((r.value / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-paper-2 overflow-hidden">
            <div className="h-full rounded-full bg-ink group-hover:bg-kraft transition-colors" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
