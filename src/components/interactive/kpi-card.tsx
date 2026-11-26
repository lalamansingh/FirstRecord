import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { CountUp } from "./count-up";

/**
 * Clickable KPI tile: links to the filtered list behind the number, lifts on hover,
 * and animates the number (Geist Mono). Server component with a small client island.
 */
export function KpiCard({
  label,
  value,
  href,
  hint,
  icon,
  tone,
  trend,
  linkLabel,
}: {
  label: string;
  value: number;
  href?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  /** red = overdue/urgent; attention = needs action (peach); undefined = neutral */
  tone?: "red" | "attention";
  trend?: { value: string; direction: "up" | "down" | "flat"; label?: string };
  linkLabel?: string;
}) {
  const valueColor = tone === "red" ? "text-[#B42318]" : "text-[#111216]";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-[#4E545A]">{label}</p>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors [&_svg]:h-4 [&_svg]:w-4 ${
            tone === "attention" ? "bg-[#FFE2C4] text-[#111216]" : tone === "red" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#E7F6E9] text-[#111216]"
          } ${href ? "group-hover:bg-[#9DF0C4] group-hover:text-[#111216]" : ""}`}
          aria-hidden
        >
          {href ? (
            <>
              <span className="group-hover:hidden">{icon}</span>
              <ArrowUpRight className="hidden group-hover:block" />
            </>
          ) : (
            icon
          )}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <CountUp value={value} className={`font-mono text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${valueColor}`} />
        {trend && (
          <span
            title={trend.label}
            className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${
              trend.direction === "up" ? "bg-[#E7F6E9] text-[#0F7A4C]" : trend.direction === "down" ? "bg-[#FFE2C4] text-[#7A3B0C]" : "bg-[#F3F3EF] text-[#5B5E66]"
            }`}
          >
            {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "•"} {trend.value}
            {trend.label && <span className="sr-only"> {trend.label}</span>}
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-xs leading-5 text-[#5B5E66]">{hint}</p>}
    </>
  );
  const cls =
    "group relative block h-full rounded-[14px] border border-[#E6E4DE] bg-white p-5 transition-[transform,box-shadow,border-color] duration-200 motion-reduce:transition-none";
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link
      href={href}
      aria-label={linkLabel ? `${label}: ${value}. ${linkLabel}` : undefined}
      className={`${cls} hover:-translate-y-0.5 hover:border-[#111216]/20 hover:shadow-[0_10px_30px_-12px_rgba(17,18,22,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111216] focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0`}
    >
      {body}
    </Link>
  );
}
