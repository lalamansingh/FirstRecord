import { getTr, getLang } from "@/lib/i18n/server";
import Link from "next/link";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import { FilePlus2, LayoutList, KanbanSquare, FolderKanban } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { listCases, officerFilterOptions, assignableStaff, type CaseListFilters } from "@/lib/domain/cases";
import { getWorkflow, stateOf } from "@/lib/domain/workflow";
import { listStations } from "@/lib/domain/workflow";
import { ButtonLink, Card, EmptyState, PageHeader, Pagination, buttonClass, cx, inputClass } from "@/components/ui";
import { PriorityBadge } from "@/components/i18n/localized";
import { CaseTable, type SortLink, type TableCase } from "@/components/cases/case-table";
import { MoveStatusForm } from "@/components/cases/move-status-form";
import { formatDate, isOverdue } from "@/lib/format";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Cases") };
}

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requirePagePermission("case.view.assigned", "case.view.station", "case.view.all");
  const sp = await searchParams;
  const view = str(sp.view) === "board" ? "board" : "list";
  const filters: CaseListFilters = {
    q: str(sp.q)?.slice(0, 100),
    status: str(sp.status),
    priority: str(sp.priority),
    officer: str(sp.officer),
    station: str(sp.station),
    from: str(sp.from),
    to: str(sp.to),
    sort: str(sp.sort),
    dir: str(sp.dir) === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(str(sp.page)) || 1),
  };
  const wf = localizeWorkflow(getWorkflow("case"), tr);
  const result = listCases(user, filters, { all: view === "board" });
  const officers = officerFilterOptions(user);
  const showStation = can(user, "case.view.all");
  const stations = showStation ? listStations() : [];
  const canBulk = can(user, "case.bulk");
  const bulkStaff = canBulk && user.stationId ? assignableStaff(user.stationId) : [];

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...filters, page: String(filters.page), view, ...patch } as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "page" && v === "1") && !(k === "view" && v === "list") && !(k === "dir" && v === "desc" && !merged.sort)) p.set(k, v);
    }
    const s = p.toString();
    return s ? `/cases?${s}` : "/cases";
  };

  const sortLabels: Record<string, string> = {
    reference: tr("Reference"),
    title: tr("Title / type"),
    received: tr("Received"),
    status: tr("Status"),
    priority: tr("Priority"),
    officer: tr("Assigned to"),
    updated: tr("Updated"),
  };
  const activeSort = filters.sort && sortLabels[filters.sort] ? filters.sort : "updated";
  const sortLinks: Record<string, SortLink> = Object.fromEntries(
    Object.entries(sortLabels).map(([key, label]) => {
      const active = activeSort === key;
      const nextDir = active ? (filters.dir === "asc" ? "desc" : "asc") : key === "reference" || key === "title" || key === "officer" ? "asc" : "desc";
      return [key, { key, label, active, dir: active ? (filters.dir ?? "desc") : "desc", href: qs({ sort: key, dir: nextDir, page: "1" }) }];
    }),
  );

  const rows: TableCase[] = result.rows.map((r) => {
    const s = stateOf(wf, r.status);
    return { ...r, statusLabel: s.label, statusTone: s.color };
  });
  const hasFilters = !!(filters.q || filters.status || filters.priority || filters.officer || filters.station || filters.from || filters.to);

  return (
    <>
      <PageHeader
        icon={<FolderKanban />}
        title={tr("Cases")}
        description={tr("Internal case records. Workflow stages here are internal and do not represent official filing status.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Cases") }]}
        actions={
          <>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 ring-1 ring-inset ring-slate-200" role="group" aria-label={tr("View")}>
              <Link href={qs({ view: "list", page: "1" })} aria-current={view === "list" ? "page" : undefined} className={cx("inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors", view === "list" ? "bg-white text-navy-900 shadow-[var(--shadow-card)]" : "text-slate-600 hover:text-slate-900")}>
                <LayoutList className="h-4 w-4" aria-hidden /> {tr("List")}
              </Link>
              <Link href={qs({ view: "board", page: "1" })} aria-current={view === "board" ? "page" : undefined} className={cx("inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors", view === "board" ? "bg-white text-navy-900 shadow-[var(--shadow-card)]" : "text-slate-600 hover:text-slate-900")}>
                <KanbanSquare className="h-4 w-4" aria-hidden /> {tr("Board")}
              </Link>
            </div>
            {can(user, "statement.create") && (
              <ButtonLink href="/intake" variant="primary">
                <FilePlus2 className="h-4 w-4" aria-hidden /> {tr("New report")}
              </ButtonLink>
            )}
          </>
        }
      />

      <form method="get" action="/cases" className="mb-5 grid grid-cols-1 gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-white p-4 shadow-[var(--shadow-card)] sm:grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))]" role="search" aria-label={tr("Filter cases")}>
        {view === "board" && <input type="hidden" name="view" value="board" />}
        {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.sort && <input type="hidden" name="dir" value={filters.dir} />}
        <div className="sm:col-span-2">
          <label htmlFor="f-q" className="mb-1 block text-xs font-medium text-slate-700">{tr("Search")}</label>
          <input id="f-q" name="q" type="search" defaultValue={filters.q} placeholder={tr("Reference, title, location, type")} className={inputClass} maxLength={100} />
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs font-medium text-slate-700">{tr("Status")}</label>
          <select id="f-status" name="status" defaultValue={filters.status ?? ""} className={inputClass}>
            <option value="">{tr("Any status")}</option>
            <option value="open">{tr("All open")}</option>
            {wf.states.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-priority" className="mb-1 block text-xs font-medium text-slate-700">{tr("Priority")}</label>
          <select id="f-priority" name="priority" defaultValue={filters.priority ?? ""} className={inputClass}>
            <option value="">{tr("Any priority")}</option>
            {["urgent", "high", "medium", "low"].map((p) => <option key={p} value={p}>{trDyn(tr, p[0].toUpperCase() + p.slice(1))}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-officer" className="mb-1 block text-xs font-medium text-slate-700">{tr("Assigned to")}</label>
          <select id="f-officer" name="officer" defaultValue={filters.officer ?? ""} className={inputClass}>
            <option value="">{tr("Anyone")}</option>
            <option value="me">{tr("Me")}</option>
            <option value="unassigned">{tr("Unassigned")}</option>
            {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {showStation && (
          <div>
            <label htmlFor="f-station" className="mb-1 block text-xs font-medium text-slate-700">{tr("Station")}</label>
            <select id="f-station" name="station" defaultValue={filters.station ?? ""} className={inputClass}>
              <option value="">{tr("All stations")}</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-from" className="mb-1 block text-xs font-medium text-slate-700">{tr("Received from")}</label>
          <input id="f-from" name="from" type="date" defaultValue={filters.from} className={inputClass} />
        </div>
        <div>
          <label htmlFor="f-to" className="mb-1 block text-xs font-medium text-slate-700">{tr("Received to")}</label>
          <input id="f-to" name="to" type="date" defaultValue={filters.to} className={inputClass} />
        </div>
        <div className="col-span-full flex flex-wrap items-end gap-2">
          <button type="submit" className={buttonClass("primary")}>{tr("Apply filters")}</button>
          {hasFilters && <Link href={view === "board" ? "/cases?view=board" : "/cases"} className={buttonClass("ghost")}>{tr("Clear all")}</Link>}
          <p className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600" aria-live="polite">{result.total === 1 ? tr("1 case") : tr("{n} cases", { n: result.total })}</p>
        </div>
      </form>

      {result.total === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" />}
          title={hasFilters ? tr("No cases match these filters") : tr("No cases yet")}
          description={hasFilters ? "Try removing a filter or widening the date range." : "Cases are created when a report intake is completed. Cases assigned to you will appear here."}
          action={hasFilters ? <ButtonLink href="/cases">{tr("Clear filters")}</ButtonLink> : can(user, "statement.create") ? <ButtonLink href="/intake" variant="primary">{tr("Start a new report")}</ButtonLink> : undefined}
        />
      ) : view === "list" ? (
        <Card padded={false}>
          <CaseTable
            rows={rows}
            sortLinks={sortLinks}
            canBulk={canBulk}
            statuses={wf.states.map((s) => ({ key: s.key, label: s.label }))}
            staff={bulkStaff}
            showStation={showStation}
          />
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={(p) => qs({ page: String(p) })} />
        </Card>
      ) : (
        <>
          {result.total > result.rows.length && (
            <p className="mb-3 text-sm text-amber-800">{tr("Showing the {n} most recent of {total} cases. Narrow the filters to see more on the board.", { n: result.rows.length, total: result.total })}</p>
          )}
          <div className="flex gap-3 overflow-x-auto pb-4" aria-label={tr("Case board")}>
            {wf.states.map((state) => {
              const col = result.rows.filter((r) => r.status === state.key);
              return (
                <section key={state.key} aria-labelledby={`col-${state.key}`} className="flex w-72 shrink-0 flex-col rounded-lg border border-slate-200/80 bg-slate-100/60">
                  <header className="flex items-center justify-between px-3 py-2.5">
                    <h2 id={`col-${state.key}`} className="text-xs font-semibold text-slate-600">{state.label}</h2>
                    <span className="rounded bg-white px-1.5 text-xs font-semibold tabular-nums leading-5 text-slate-600 ring-1 ring-inset ring-slate-200">{col.length}</span>
                  </header>
                  <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                    {col.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">{tr("No cases")}</li>}
                    {col.map((r) => {
                      const options = (wf.transitions[r.status] ?? []).map((k) => stateOf(wf, k)).map((s) => ({ key: s.key, label: s.label, category: s.category }));
                      return (
                        <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]">
                          <div className="flex items-start justify-between gap-2">
                            <Link href={`/cases/${r.id}`} className="font-mono text-xs font-semibold text-[#1F4E9C] hover:underline">{r.reference}</Link>
                            <PriorityBadge priority={r.priority} />
                          </div>
                          <Link href={`/cases/${r.id}`} className="mt-1 block text-sm font-medium text-slate-900 hover:underline">{r.title}</Link>
                          <p className="mt-0.5 text-xs text-slate-500">{r.assignee_name ?? tr("Unassigned")}</p>
                          {r.next_action && (
                            <p className={cx("mt-1.5 line-clamp-2 text-xs", isOverdue(r.next_action_due) ? "text-red-700" : "text-slate-600")}>
                              Next: {r.next_action}
                              {r.next_action_due ? ` · ${formatDate(r.next_action_due, { lang })}` : ""}
                            </p>
                          )}
                          {can(user, "case.status") && (
                            <div className="mt-2 border-t border-slate-100 pt-2">
                              <MoveStatusForm caseId={r.id} reference={r.reference} options={options} compact />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
