/** Server-safe presentational primitives. Keep styling consistent by using these. */
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import { T } from "./i18n/t";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export const btn = {
  base: "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium leading-5 select-none transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#9df0c4]/70 focus-visible:ring-offset-1 whitespace-nowrap [&_svg]:shrink-0 [&_svg]:h-4 [&_svg]:w-4",
  primary: "bg-[#111216] text-white border border-[#111216] hover:bg-[#2a2c33] hover:border-[#2a2c33] active:bg-[#08060c] px-4 py-2 min-h-9",
  secondary: "bg-white text-[#111216] border border-[#e6e4de] hover:border-[#d7d2cc] hover:bg-[#f5f3f1] active:bg-[#ebe9e3] px-4 py-2 min-h-9",
  ghost: "text-[#4e545a] hover:bg-[#f5f3f1] hover:text-[#111216] active:bg-[#ebe9e3] px-3 py-1.5",
  danger: "bg-[var(--danger)] text-white border border-[var(--danger)] hover:bg-red-800 hover:border-red-800 px-4 py-2 min-h-9",
  soft: "bg-[#e7f6e9] text-[#111216] border border-[#c9f3dd] hover:bg-[#c9f3dd] px-4 py-2 min-h-9",
  sm: "!px-3.5 !py-1 !min-h-8 !gap-1.5 text-[13px] [&_svg]:!h-3.5 [&_svg]:!w-3.5",
  lg: "!px-5 !py-2.5 !min-h-11 [&_svg]:!h-4 [&_svg]:!w-4",
  icon: "!p-0 !min-h-9 h-9 w-9",
};

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export function buttonClass(variant: ButtonVariant = "secondary", size?: ButtonSize) {
  return cx(btn.base, btn[variant], size === "sm" && btn.sm, size === "lg" && btn.lg, size === "icon" && btn.icon);
}

export function ButtonLink({
  href,
  children,
  variant = "secondary",
  size,
  className,
  icon,
  title,
}: {
  href: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Leading icon element (e.g. a lucide icon). */
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <Link href={href} title={title} className={cx(buttonClass(variant, size), className)}>
      {icon && <span aria-hidden className="contents">{icon}</span>}
      {children}
    </Link>
  );
}

/** Server-safe button (works inside <form action>). */
export function Button({
  children,
  variant = "secondary",
  size,
  icon,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <button type="button" {...rest} className={cx(buttonClass(variant, size), className)}>
      {icon && <span aria-hidden className="contents">{icon}</span>}
      {children}
    </button>
  );
}

const TONES = {
  slate: "bg-[#f5f3f1] text-[#3a3d44] border-[#e6e4de]",
  blue: "bg-[#e7f6e9] text-[#111216] border-[#c9f3dd]",
  amber: "bg-[#ffe2c4] text-[#8a5a12] border-[#ffd1a3]",
  violet: "bg-[#fff0e0] text-[#8a5a12] border-[#ffe2c4]",
  green: "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]",
  red: "bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]",
  teal: "bg-[#e7f6e9] text-[#0f7f51] border-[#c9f3dd]",
} as const;
const DOTS: Record<keyof typeof TONES, string> = {
  slate: "bg-[#a7b0ac]",
  blue: "bg-[#111216]",
  amber: "bg-[#d9913e]",
  violet: "bg-[#d9913e]",
  green: "bg-[#19c37d]",
  red: "bg-red-600",
  teal: "bg-[#19c37d]",
};
export type Tone = keyof typeof TONES;

export function Badge({
  tone = "slate",
  children,
  className,
  dot = false,
  size = "md",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Leading status dot (default off). */
  dot?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap [&_svg]:h-3 [&_svg]:w-3",
        size === "sm" ? "px-1.5 py-px text-[11px] leading-4" : "px-2 py-0.5 text-xs leading-5",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Alias: soft-tinted status pill. */
export const StatusPill = Badge;

export const PRIORITY_TONE: Record<string, Tone> = { low: "slate", medium: "blue", high: "amber", urgent: "red" };

export function PriorityBadge({ priority }: { priority: string }) {
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return <Badge tone={PRIORITY_TONE[priority] ?? "slate"}>{label}</Badge>;
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
  icon,
  footer,
  variant = "default",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** Small icon shown in a tinted tile next to the title. */
  icon?: ReactNode;
  /** Footer row (e.g. "View all" link). */
  footer?: ReactNode;
  variant?: "default" | "elevated" | "muted";
}) {
  return (
    <section
      className={cx(
        "overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)]",
        variant === "muted" ? "bg-[var(--surface-sunken)]" : "bg-white",
        variant === "elevated" && "shadow-[var(--shadow-xs)]",
        "transition-[border-color,box-shadow] duration-150 hover:border-[#d7d2cc]",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 flex shrink-0 items-center text-slate-500 [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold leading-6 tracking-[-0.01em] text-[#111216]">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] leading-5 text-slate-600">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
      {footer && <footer className="border-t border-[var(--border-subtle)] px-5 py-3 text-[13px]">{footer}</footer>}
    </section>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  meta,
  icon,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
  /** Icon shown in a tile left of the title. */
  icon?: ReactNode;
  /** Small label above the title. */
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-slate-500">
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
                {c.href ? (
                  <Link href={c.href} className="text-slate-600 hover:text-slate-900 hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-slate-800">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="mt-1 hidden shrink-0 text-slate-400 sm:flex [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-[13px] font-medium text-slate-500">{eyebrow}</p>}
            <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#111216]">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#d7d2cc] bg-white px-6 py-10 text-center">
      <div className="mb-3 text-slate-400 [&_svg]:h-6 [&_svg]:w-6" aria-hidden>
        {icon ?? <Inbox />}
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "blue",
  title,
  children,
  className,
}: {
  tone?: "blue" | "amber" | "red" | "green" | "slate";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    blue: "border-[var(--info-border)] bg-[var(--info-bg)] text-slate-800 [&_p:first-child]:text-[#111216]",
    amber: "border-[var(--warning-border)] bg-[var(--warning-bg)] text-slate-800 [&_p:first-child]:text-[#8a5a12]",
    red: "border-[var(--danger-border)] bg-[var(--danger-bg)] text-slate-800 [&_p:first-child]:text-[#912018]",
    green: "border-[var(--success-border)] bg-[var(--success-bg)] text-slate-800 [&_p:first-child]:text-[#085d3a]",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  }[tone];
  return (
    <div role={tone === "red" ? "alert" : "note"} className={cx("rounded-[12px] border px-4 py-3 text-sm leading-6", styles, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

/** Table primitives */
export function Table({
  children,
  caption,
  dense,
  stickyHeader = true,
  className,
}: {
  children: ReactNode;
  caption?: string;
  /** Tighter rows for data-heavy lists. */
  dense?: boolean;
  /** Keep the header visible while the page scrolls (default on). */
  stickyHeader?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table
        className={cx(
          "w-full border-separate border-spacing-0 text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[#f5f3f1] [&_tbody_tr:last-child>td]:border-b-0",
          stickyHeader && "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[1]",
          dense && "[&_td]:!py-2 [&_th]:!py-2",
        )}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap border-b border-[var(--border-subtle)] bg-[#fafaf7] px-4 py-2.5 text-left text-xs font-medium text-[#5b5e66] first:pl-5 last:pr-5",
        className,
      )}
    >
      {children}
    </th>
  );
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-[#ebe9e3] px-4 py-3 align-top text-sm leading-6 text-[#111216] first:pl-5 last:pr-5", className)}>{children}</td>;
}

export function Stat({
  label,
  value,
  hint,
  href,
  tone,
  icon,
  trend,
  spark,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  /** red = overdue/urgent, amber = needs attention (saffron), green = done */
  tone?: "red" | "amber" | "green";
  icon?: ReactNode;
  /** Change indicator, e.g. { value: "+12%", direction: "up", good: true }. */
  trend?: { value: string; direction: "up" | "down" | "flat"; good?: boolean; label?: string };
  /** Small sparkline series (oldest → newest). */
  spark?: number[];
}) {
  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-600">{label}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <p className={cx("font-mono text-[30px] font-medium leading-none tracking-[-0.03em] tabular-nums", tone === "red" ? "text-[var(--danger)]" : tone === "amber" ? "text-[#8a5a12]" : tone === "green" ? "text-[var(--success)]" : "text-slate-900")}>{value}</p>
          {trend && <TrendChip {...trend} />}
        </div>
        {hint && <p className="mt-2 text-xs leading-5 text-slate-600">{hint}</p>}
        {spark && spark.length > 1 && <Sparkline data={spark} tone={tone} />}
      </div>
      {icon && (
        <span className="shrink-0 text-slate-400 [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
          {icon}
        </span>
      )}
    </div>
  );
  const cls = "group relative block rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-white p-5 transition-[border-color,box-shadow,transform] duration-150";
  return href ? (
    <Link href={href} className={cx(cls, "hover:-translate-y-px hover:border-[#d7d2cc] hover:shadow-[0_4px_16px_rgb(17_18_22/0.06)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#9df0c4]/70")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Alias for KPI tiles. */
export const StatCard = Stat;

function TrendChip({ value, direction, good, label }: { value: string; direction: "up" | "down" | "flat"; good?: boolean; label?: string }) {
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "■";
  const toneCls = direction === "flat" || good === undefined ? "text-slate-600" : good ? "text-[var(--success)]" : "text-[var(--danger)]";
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-medium tabular-nums", toneCls)} title={label}>
      <span aria-hidden className="text-[8px]">{arrow}</span>
      {value}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  );
}

/** Tiny inline trend line (decorative; the value is shown as text). */
export function Sparkline({ data, tone, className }: { data: number[]; tone?: "red" | "amber" | "green"; className?: string }) {
  const w = 120;
  const h = 28;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const stroke = tone === "red" ? "#b42318" : tone === "amber" ? "#d9913e" : tone === "green" ? "#19c37d" : "#111216";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("mt-3 h-7 w-full max-w-[140px]", className)} aria-hidden preserveAspectRatio="none">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Tabs({
  tabs,
  active,
  variant = "underline",
}: {
  tabs: { key: string; label: string; href: string; count?: number }[];
  active: string;
  variant?: "underline" | "pills";
}) {
  if (variant === "pills") {
    return (
      <nav aria-label="Sections" className="mb-6">
        <ul className="inline-flex max-w-full overflow-x-auto rounded-full border border-[#e6e4de] bg-[#f5f3f1] p-0.5">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={t.key === active ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-8 items-center gap-2 rounded-full px-3.5 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                  t.key === active ? "bg-white text-[#111216] shadow-[0_1px_2px_rgb(17_18_22/0.08)]" : "text-[#5b5e66] hover:text-[#111216]",
                )}
              >
                {t.label}
                {t.count !== undefined && <span className="text-xs tabular-nums text-slate-500">{t.count}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Sections" className="mb-6 border-b border-[#e6e4de]">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === active ? "page" : undefined}
              className={cx(
                "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                t.key === active
                  ? "border-[#111216] text-[#111216]"
                  : "border-transparent text-[#5b5e66] hover:border-[#d7d2cc] hover:text-[#111216]",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="rounded-full bg-white px-1.5 font-mono text-xs font-medium tabular-nums leading-5 text-[#5b5e66]">{t.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-4 py-3 text-[13px] text-slate-600">
      <p>
        <T k="Showing {from}–{to} of {total}" vars={{ from, to, total }} />
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={buttonClass("secondary", "sm")} href={hrefFor(page - 1)}><T k="Previous" /></Link>
        ) : (
          <span className={cx(buttonClass("secondary", "sm"), "opacity-50")} aria-disabled><T k="Previous" /></span>
        )}
        <span className="px-1 py-1 text-[13px] tabular-nums"><T k="Page {page} of {pages}" vars={{ page, pages }} /></span>
        {page < pages ? (
          <Link className={buttonClass("secondary", "sm")} href={hrefFor(page + 1)}><T k="Next" /></Link>
        ) : (
          <span className={cx(buttonClass("secondary", "sm"), "opacity-50")} aria-disabled><T k="Next" /></span>
        )}
      </div>
    </nav>
  );
}

/** Form field styling */
export const inputClass =
  "block min-h-10 w-full rounded-[10px] border border-[#e6e4de] bg-white px-3 py-2 text-sm leading-6 text-[#111216] placeholder:text-[#a7b0ac] transition-[border-color,box-shadow] hover:border-[#d7d2cc] focus:border-[#111216] focus:outline-none focus:ring-[3px] focus:ring-[#9df0c4]/60 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-600 aria-[invalid=true]:focus:ring-red-600";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-700" aria-hidden>*</span>}
        {required && <span className="sr-only"> <T k="(required)" /></span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-slate-600">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs font-medium text-slate-600">{i.label}</dt>
          <dd className="mt-1 text-sm leading-6 text-slate-900">{i.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Loading placeholder. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("skeleton block rounded-md", className ?? "h-4 w-full")} />;
}

/** Initials avatar. */
export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const initials = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full border border-[#c9f3dd] bg-[#e7f6e9] font-semibold text-[#111216]", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initials || "?"}
    </span>
  );
}

/** Section title row used between card groups. */
export function SectionHeading({ id, title, description, action }: { id?: string; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Plain bordered icon tile. */
export function IconTile({ children, tone = "slate", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  const color = tone === "red" ? "text-[var(--danger)]" : tone === "amber" ? "text-[var(--warning)]" : tone === "green" ? "text-[var(--success)]" : "text-slate-500";
  return (
    <span aria-hidden className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6e4de] bg-white [&_svg]:h-[18px] [&_svg]:w-[18px]", color, className)}>
      {children}
    </span>
  );
}
