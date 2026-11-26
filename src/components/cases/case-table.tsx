"use client";
import { trDyn } from "@/lib/i18n/dynamic";
import { useT, useLang } from "@/lib/i18n/client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, inputClass, cx, type Tone } from "@/components/ui";
import { PriorityBadge } from "@/components/i18n/localized";
import { bulkAction } from "@/app/(app)/cases/actions";
import { formatDate, formatRelative, isOverdue } from "@/lib/format";

export interface TableCase {
  id: string;
  reference: string;
  title: string;
  incident_type: string;
  status: string;
  statusLabel: string;
  statusTone: Tone;
  priority: string;
  assignee_name: string | null;
  next_action: string | null;
  next_action_due: string | null;
  received_at: string;
  updated_at: string;
  station_code: string;
  is_demo: number;
}

export interface SortLink {
  key: string;
  label: string;
  href: string;
  active: boolean;
  dir: "asc" | "desc";
}

export function CaseTable({
  rows,
  sortLinks,
  canBulk,
  statuses,
  staff,
  showStation,
}: {
  rows: TableCase[];
  sortLinks: Record<string, SortLink>;
  canBulk: boolean;
  statuses: { key: string; label: string }[];
  staff: { id: string; name: string }[];
  showStation: boolean;
}) {
  const tr = useT();
  const lang = useLang();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<"status" | "assign" | "priority">("status");
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const header = (key: string, extra?: string) => {
    const s = sortLinks[key];
    const Icon = !s?.active ? ArrowUpDown : s.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={s?.active ? (s.dir === "asc" ? "ascending" : "descending") : undefined}
        className={cx("border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11.5px] font-semibold text-slate-500", extra)}
      >
        {s ? (
          <Link href={s.href} className="inline-flex items-center gap-1 hover:text-slate-900">
            {s.label}
            <Icon className="h-3 w-3" aria-hidden />
            <span className="sr-only">{s.active ? `, ${s.dir === "asc" ? tr("sorted ascending") : tr("sorted descending")}` : `, ${tr("sortable")}`}</span>
          </Link>
        ) : null}
      </th>
    );
  };

  return (
    <div>
      {canBulk && selected.size > 0 && (
        <ActionForm
          action={bulkAction}
          confirmTitle={tr("Apply to {n} case(s)?", { n: selected.size })}
          confirm={
            <p>
              {tr("This change will be applied to each selected case individually. Cases where the change is not allowed by the workflow or your permissions will be skipped and reported. Every change is recorded in the audit history.")}
            </p>
          }
          confirmLabel={tr("Apply changes")}
          onSuccess={() => setSelected(new Set())}
          className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3"
        >
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <p className="mr-2 self-center text-sm font-medium text-blue-900" role="status">
            {tr("{n} selected", { n: selected.size })}
          </p>
          <div>
            <label htmlFor="bulk-op" className="block text-xs font-medium text-slate-700">{tr("Action")}</label>
            <select id="bulk-op" name="op" value={op} onChange={(e) => setOp(e.target.value as typeof op)} className={cx(inputClass, "!py-1.5")}>
              <option value="status">{tr("Change status")}</option>
              <option value="assign">{tr("Assign to")}</option>
              <option value="priority">{tr("Set priority")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="bulk-value" className="block text-xs font-medium text-slate-700">{tr("Value")}</label>
            <select key={op} id="bulk-value" name="value" className={cx(inputClass, "!py-1.5")} required={op !== "assign"} defaultValue="">
              <option value="" disabled={op !== "assign"}>
                {op === "assign" ? tr("Unassigned") : tr("Choose…")}
              </option>
              {op === "status" && statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              {op === "assign" && staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {op === "priority" &&
                ["low", "medium", "high", "urgent"].map((p) => (
                  <option key={p} value={p}>{trDyn(tr, p[0].toUpperCase() + p.slice(1))}</option>
                ))}
            </select>
          </div>
          <SubmitButton size="sm">{tr("Apply")}</SubmitButton>
          <button type="button" className="text-sm text-[#1B6650] underline" onClick={() => setSelected(new Set())}>
            {tr("Clear selection")}
          </button>
        </ActionForm>
      )}
      {/* Mobile: stacked cards */}
      <ul className="divide-y divide-slate-100 sm:hidden" aria-label={tr("Cases")}>
        {rows.map((r) => (
          <li key={r.id} className={cx("flex gap-3 px-4 py-3.5", selected.has(r.id) && "bg-navy-50")}>
            {canBulk && (
              <input
                type="checkbox"
                aria-label={tr("Select {ref}", { ref: r.reference })}
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-700"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/cases/${r.id}`} className="font-mono text-xs font-semibold text-[#1B6650] hover:underline">
                  {r.reference}
                </Link>
                <span className="shrink-0 text-xs text-slate-500" title={formatDate(r.updated_at, { time: true, lang })}>
                  {formatRelative(r.updated_at, lang)}
                </span>
              </div>
              <Link href={`/cases/${r.id}`} className="mt-0.5 block break-words font-medium text-slate-900 hover:underline">
                {r.title}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone={r.statusTone}>{r.statusLabel}</Badge>
                <PriorityBadge priority={r.priority} />
                {showStation && <span className="text-xs text-slate-500">{r.station_code}</span>}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {r.assignee_name ?? <span className="text-slate-500">{tr("Unassigned")}</span>}
              </p>
              {r.next_action && (
                <div className="mt-1 text-sm text-slate-700">
                  <p className="line-clamp-2 break-words">{r.next_action}</p>
                  {r.next_action_due && (
                    <p className={cx("text-xs", isOverdue(r.next_action_due) ? "font-medium text-red-700" : "text-slate-500")}>
                      {isOverdue(r.next_action_due) ? tr("Overdue · ") : tr("Due ")}
                      {formatDate(r.next_action_due, { lang })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-separate border-spacing-0 text-sm [&_tbody_tr:last-child>td]:border-b-0 [&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5">
          <caption className="sr-only">{tr("Cases")}</caption>
          <thead>
            <tr>
              {canBulk && (
                <th scope="col" className="w-10 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={tr("Select all cases on this page")}
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="h-4 w-4 rounded border-slate-300 accent-blue-700"
                  />
                </th>
              )}
              {header("reference")}
              {header("title")}
              {header("received")}
              {header("status")}
              {header("priority")}
              {header("officer")}
              <th scope="col" className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11.5px] font-semibold text-slate-500">
                {tr("Next action")}
              </th>
              {header("updated")}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cx("transition-colors hover:bg-slate-50", selected.has(r.id) && "bg-navy-50")}>
                {canBulk && (
                  <td className="border-b border-slate-100 px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      aria-label={tr("Select {ref}", { ref: r.reference })}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-700"
                    />
                  </td>
                )}
                <td className="border-b border-slate-100 px-3 py-3 align-top whitespace-nowrap">
                  <Link href={`/cases/${r.id}`} className="font-mono text-xs font-semibold text-[#1B6650] hover:underline">
                    {r.reference}
                  </Link>
                  {showStation && <p className="text-xs text-slate-500">{r.station_code}</p>}
                </td>
                <td className="min-w-[14rem] border-b border-slate-100 px-3 py-3 align-top">
                  <Link href={`/cases/${r.id}`} className="font-medium text-slate-900 hover:underline">
                    {r.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.incident_type ? trDyn(tr, r.incident_type) : null}
                    
                  </p>
                </td>
                <td className="border-b border-slate-100 px-3 py-3 align-top whitespace-nowrap text-slate-600">{formatDate(r.received_at, { lang })}</td>
                <td className="border-b border-slate-100 px-3 py-3 align-top"><Badge tone={r.statusTone}>{r.statusLabel}</Badge></td>
                <td className="border-b border-slate-100 px-3 py-3 align-top"><PriorityBadge priority={r.priority} /></td>
                <td className="border-b border-slate-100 px-3 py-3 align-top whitespace-nowrap text-slate-700">
                  {r.assignee_name ?? <span className="text-slate-500">{tr("Unassigned")}</span>}
                </td>
                <td className="min-w-[11rem] border-b border-slate-100 px-3 py-3 align-top text-slate-700">
                  {r.next_action ? (
                    <>
                      <p className="line-clamp-2">{r.next_action}</p>
                      {r.next_action_due && (
                        <p className={cx("text-xs", isOverdue(r.next_action_due) ? "font-medium text-red-700" : "text-slate-500")}>
                          {isOverdue(r.next_action_due) ? tr("Overdue · ") : tr("Due ")}
                          {formatDate(r.next_action_due, { lang })}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-3 align-top whitespace-nowrap text-xs text-slate-500" title={formatDate(r.updated_at, { time: true, lang })}>
                  {formatRelative(r.updated_at, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
