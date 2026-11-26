"use client";
/**
 * Minimal accessible charts (single series, one hue). Per the dataviz method:
 * thin marks (<=24px), 4px rounded data-ends anchored to the baseline, 2px gaps,
 * recessive axes, direct value labels, hover/focus tooltip, and a table view.
 */
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/messages";

const SERIES = "#14523F"; // brand deep green; single-hue charts

export interface Datum {
  label: string;
  value: number;
  href?: string;
  hint?: string;
}

function TableView({ data, labelHeader, valueHeader, format }: { data: Datum[]; labelHeader: string; valueHeader: string; format: (n: number) => string }) {
  const tr = useT();
  return (
    <details className="mt-3">
      <summary className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--link)] hover:text-slate-900 hover:underline">{tr("View as table")}</summary>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-600">
            <th scope="col" className="py-1 pr-2 font-semibold">{labelHeader}</th>
            <th scope="col" className="py-1 text-right font-semibold">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-t border-slate-100">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-slate-700">{d.label}</th>
              <td className="py-1 text-right tabular-nums text-slate-900">{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Horizontal bar chart: magnitude per category, direct value labels at bar end. */
export function BarList({
  data,
  label,
  labelHeader = "Category",
  valueHeader = "Count",
  decimals = 0,
  suffix = "",
  empty = "No data for the selected filters.",
}: {
  data: Datum[];
  label: string;
  labelHeader?: string;
  valueHeader?: string;
  /** Serializable formatting options (functions can't cross the server/client boundary). */
  decimals?: number;
  suffix?: string;
  empty?: string;
}) {
  const tr = useT();
  labelHeader = tr(labelHeader as MsgKey);
  valueHeader = tr(valueHeader as MsgKey);
  empty = tr(empty as MsgKey);
  const format = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix;
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <figure aria-label={label}>
      <ul className="space-y-[2px]">
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          const name = `${d.label}: ${format(d.value)}${d.hint ? ` (${d.hint})` : ""}`;
          const row = (
            <div className="grid grid-cols-[minmax(7rem,38%)_1fr] items-center gap-3 rounded-md px-2 py-1.5 group-hover:bg-slate-50">
              <span className="truncate text-sm text-slate-700" title={d.label}>{d.label}</span>
              <span className="flex items-center gap-3">
                <span className="relative block h-2 flex-1 overflow-hidden rounded-sm bg-slate-100" aria-hidden>
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{ width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`, background: SERIES }}
                  />
                </span>
                <span className="w-12 text-right text-sm font-medium tabular-nums text-slate-900">{format(d.value)}</span>
              </span>
            </div>
          );
          return (
            <li key={d.label} className="group" title={name}>
              {d.href ? (
                <Link href={d.href} aria-label={name} className="block rounded focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
                  {row}
                </Link>
              ) : (
                <div tabIndex={0} aria-label={name} className="rounded focus-visible:ring-2 focus-visible:ring-[var(--brand)]">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      <TableView data={data} labelHeader={labelHeader} valueHeader={valueHeader} format={format} />
    </figure>
  );
}

/** Vertical column chart for a time series (e.g. weekly intake), with hover/focus tooltip. */
export function ColumnChart({
  data,
  label,
  labelHeader = "Period",
  valueHeader = "Count",
  height = 160,
}: {
  data: Datum[];
  label: string;
  labelHeader?: string;
  valueHeader?: string;
  height?: number;
}) {
  const tr = useT();
  labelHeader = tr(labelHeader as MsgKey);
  valueHeader = tr(valueHeader as MsgKey);
  const [active, setActive] = useState<number | null>(null);
  if (data.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{tr("No data for the selected period.")}</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const W = 600;
  const padL = 28;
  const padB = 22;
  const plotH = height - padB - 6;
  const band = (W - padL) / data.length;
  const barW = Math.min(24, Math.max(4, band - 2));
  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.ceil(data.length / 6);
  const fmt = (n: number) => n.toLocaleString("en-IN");
  const a = active !== null ? data[active] : null;

  return (
    <figure aria-label={label} className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label={`${label}. ${data.map((d) => `${d.label}: ${d.value}`).join("; ")}`}>
        {ticks.map((t) => {
          const y = 6 + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="#e4eae7" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 3"} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={11} fill="#6f7a75">{fmt(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / niceMax) * plotH;
          const x = padL + i * band + (band - barW) / 2;
          const y = 6 + plotH - h;
          const r = Math.min(4, h / 2, barW / 2);
          const path = h > 0 ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z` : "";
          return (
            <g key={d.label}>
              {active === i && <rect x={padL + i * band} y={6} width={band} height={plotH} fill="#f0f3f1" rx={2} />}
              {path && <path d={path} fill={SERIES} opacity={active === null || active === i ? 1 : 0.55} />}
              {/* hit target larger than the mark */}
              <rect
                x={padL + i * band}
                y={6}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label}: ${fmt(d.value)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none focus-visible:stroke-[var(--brand)]"
                strokeWidth={2}
              />
              {i % labelEvery === 0 && (
                <text x={padL + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="#6f7a75">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {a && active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute -top-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-[var(--shadow-pop)]"
          style={{ left: `clamp(0px, calc(${((padL + active * band + band / 2) / W) * 100}% - 4rem), calc(100% - 8rem))` }}
        >
          <p className="text-slate-500">{a.label}{a.hint ? ` · ${a.hint}` : ""}</p>
          <p className="font-semibold tabular-nums text-slate-900">{fmt(a.value)} {valueHeader.toLocaleLowerCase()}</p>
        </div>
      )}
      <TableView data={data} labelHeader={labelHeader} valueHeader={valueHeader} format={fmt} />
    </figure>
  );
}
