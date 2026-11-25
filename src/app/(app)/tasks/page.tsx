import { getTr, getLang } from "@/lib/i18n/server";
import Link from "next/link";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import { Plus, List, Columns3, AlertTriangle } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { listTasks, quickCounts, linkableCases, assignableUsers, taskTypeLabel, type TaskFilters } from "@/lib/domain/tasks";
import { getWorkflow, getSetting, stateOf } from "@/lib/domain/workflow";
import { formatDate, isOverdue } from "@/lib/format";
import { PageHeader, ButtonLink, Card, Table, Th, Td, Badge, EmptyState, Pagination, buttonClass, inputClass, cx } from "@/components/ui";
import { PriorityBadge } from "@/components/i18n/localized";
import { StatusSelect } from "@/components/tasks/task-controls";
import { changeTaskStatusAction } from "./actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Tasks") };
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
const QUICK = ["mine", "overdue", "due_soon", "completed", "all"] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requirePagePermission("task.view");
  const sp = await searchParams;
  const view = one(sp.view) === "board" ? "board" : "list";
  const quickRaw = one(sp.quick);
  const quick = (QUICK as readonly string[]).includes(quickRaw ?? "") ? (quickRaw as TaskFilters["quick"]) : "all";
  const filters: TaskFilters = {
    quick,
    caseId: one(sp.caseId),
    assigneeId: one(sp.assignee),
    status: one(sp.status),
    type: one(sp.type),
    priority: one(sp.priority),
    q: one(sp.q)?.slice(0, 100) ?? null,
    page: Number(one(sp.page)) || 1,
    pageSize: view === "board" ? 200 : 25,
    sort: (one(sp.sort) as TaskFilters["sort"]) ?? undefined,
  };
  const { rows, total, page, pageSize } = listTasks(user, filters);
  const counts = quickCounts(user);
  const wf = localizeWorkflow(getWorkflow("task"), tr);
  const types = getSetting("task.types").map((t) => ({ ...t, label: trDyn(tr, t.label) }));
  const cases = linkableCases(user);
  const people = assignableUsers(user.stationId);
  const manage = can(user, "task.manage");

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = {
      view: view === "board" ? "board" : null,
      quick: quick === "all" ? null : quick ?? null,
      caseId: filters.caseId ?? null,
      assignee: filters.assigneeId ?? null,
      status: filters.status ?? null,
      type: filters.type ?? null,
      priority: filters.priority ?? null,
      q: filters.q ?? null,
      sort: filters.sort ?? null,
    };
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };

  const quickTabs: { key: (typeof QUICK)[number]; label: string; count?: number }[] = [
    { key: "all", label: tr("All tasks") },
    { key: "mine", label: tr("My open tasks"), count: counts.mine },
    { key: "overdue", label: tr("Overdue"), count: counts.overdue },
    { key: "due_soon", label: tr("Due in 48h"), count: counts.due_soon },
    { key: "completed", label: tr("Completed"), count: counts.completed },
  ];
  const hasFilters = !!(filters.caseId || filters.assigneeId || filters.status || filters.type || filters.priority || filters.q);

  return (
    <>
      <PageHeader
        title={tr("Tasks")}
        description={tr("Follow-up work across the cases you can access.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Tasks") }]}
        actions={
          <>
            <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5" role="group" aria-label={tr("View")}>
              <Link href={qs({ view: null, page: null })} aria-current={view === "list" ? "page" : undefined} className={cx("inline-flex items-center gap-1 rounded px-2.5 py-1 text-sm", view === "list" ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:text-slate-900")}>
                <List className="h-4 w-4" aria-hidden /> {tr("List")}
              </Link>
              <Link href={qs({ view: "board", page: null })} aria-current={view === "board" ? "page" : undefined} className={cx("inline-flex items-center gap-1 rounded px-2.5 py-1 text-sm", view === "board" ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:text-slate-900")}>
                <Columns3 className="h-4 w-4" aria-hidden /> {tr("Board")}
              </Link>
            </div>
            {manage && (
              <ButtonLink href={filters.caseId ? `/tasks/new?caseId=${filters.caseId}` : "/tasks/new"} variant="primary">
                <Plus className="h-4 w-4" aria-hidden /> {tr("New task")}
              </ButtonLink>
            )}
          </>
        }
      />

      <nav aria-label={tr("Quick filters")} className="mb-4 flex flex-wrap gap-2">
        {quickTabs.map((t) => (
          <Link
            key={t.key}
            href={qs({ quick: t.key === "all" ? null : t.key, page: null })}
            aria-current={quick === t.key ? "page" : undefined}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm",
              quick === t.key ? "border-navy-300 bg-navy-50 font-medium text-navy-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cx("rounded px-1.5 text-xs", t.key === "overdue" && t.count > 0 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600")}>{t.count}</span>}
          </Link>
        ))}
      </nav>

      <form method="get" action="/tasks" className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-4 xl:grid-cols-7">
        {view === "board" && <input type="hidden" name="view" value="board" />}
        {quick !== "all" && <input type="hidden" name="quick" value={quick} />}
        <div className="col-span-2 md:col-span-4 xl:col-span-2">
          <label htmlFor="f-q" className="sr-only">{tr("Search tasks")}</label>
          <input id="f-q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder={tr("Search title or case reference")} className={inputClass} maxLength={100} />
        </div>
        <FilterSelect id="f-case" name="caseId" label={tr("Case")} value={filters.caseId} options={cases.map((c) => ({ value: c.id, label: c.reference }))} />
        <FilterSelect id="f-assignee" name="assignee" label={tr("Owner")} value={filters.assigneeId} options={[{ value: "unassigned", label: tr("Unassigned") }, ...people.map((u) => ({ value: u.id, label: u.name }))]} />
        <FilterSelect id="f-status" name="status" label={tr("Status")} value={filters.status} options={wf.states.map((s) => ({ value: s.key, label: s.label }))} />
        <FilterSelect id="f-type" name="type" label={tr("Type")} value={filters.type} options={types.map((t) => ({ value: t.key, label: t.label }))} />
        <FilterSelect id="f-priority" name="priority" label={tr("Priority")} value={filters.priority} options={["urgent", "high", "medium", "low"].map((p) => ({ value: p, label: trDyn(tr, p[0].toUpperCase() + p.slice(1)) }))} />
        <div className="col-span-2 flex items-center gap-2 md:col-span-4 xl:col-span-7">
          {view === "list" && (
            <>
              <label htmlFor="f-sort" className="text-xs font-medium text-slate-600">{tr("Sort")}</label>
              <select id="f-sort" name="sort" defaultValue={filters.sort ?? ""} className={`${inputClass} !w-auto !py-1 text-xs`}>
                <option value="">{tr("Due date")}</option>
                <option value="priority">{tr("Priority")}</option>
                <option value="updated">{tr("Recently updated")}</option>
                <option value="created">{tr("Newest")}</option>
              </select>
            </>
          )}
          <button type="submit" className={buttonClass("secondary", "sm")}>{tr("Apply filters")}</button>
          {hasFilters && <Link href={qs({ caseId: null, assignee: null, status: null, type: null, priority: null, q: null, page: null })} className="text-xs text-[#1F4E9C] hover:underline">{tr("Clear filters")}</Link>}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={hasFilters || quick !== "all" ? "No tasks match these filters" : tr("No tasks yet")}
          description={hasFilters || quick !== "all" ? "Try clearing filters or choosing a different quick filter." : "Tasks you create or are assigned will appear here."}
          action={manage ? <ButtonLink href="/tasks/new" variant="primary">{tr("Create a task")}</ButtonLink> : undefined}
        />
      ) : view === "list" ? (
        <Card padded={false}>
          <Table caption={tr("Tasks")}>
            <thead>
              <tr>
                <Th>{tr("Task")}</Th>
                <Th>{tr("Case")}</Th>
                <Th>{tr("Status")}</Th>
                <Th>{tr("Priority")}</Th>
                <Th>{tr("Owner")}</Th>
                <Th>{tr("Due")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const st = stateOf(wf, t.status);
                const overdue = isOverdue(t.due_at, t.completed_at);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/tasks/${t.id}`} className="font-medium text-slate-900 hover:text-[#183E7C] hover:underline">{t.title}</Link>
                      <p className="text-xs text-slate-500">{trDyn(tr, taskTypeLabel(t.task_type))}</p>
                    </Td>
                    <Td>{t.case_id ? <Link href={`/cases/${t.case_id}`} className="text-[#1F4E9C] hover:underline">{t.case_reference}</Link> : <span className="text-slate-400">—</span>}</Td>
                    <Td><Badge tone={st.color}>{st.label}</Badge></Td>
                    <Td><PriorityBadge priority={t.priority} /></Td>
                    <Td>{t.assignee_name ?? <span className="text-slate-400">{tr("Unassigned")}</span>}</Td>
                    <Td className={overdue ? "font-medium text-red-700" : undefined}>
                      {overdue && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
                      {formatDate(t.due_at, { time: true, lang })}
                      {overdue && <span className="sr-only"> ({tr("overdue")})</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => qs({ page: String(p) })} />
        </Card>
      ) : (
        <div className="grid gap-4 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${wf.states.length}, minmax(16rem, 1fr))` }}>
          {wf.states.map((s) => {
            const col = rows.filter((r) => r.status === s.key);
            return (
              <section key={s.key} aria-labelledby={`col-${s.key}`} className="flex min-h-40 flex-col rounded-lg border border-slate-200 bg-slate-50/70">
                <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                  <h2 id={`col-${s.key}`} className="text-sm font-semibold text-slate-800">{s.label}</h2>
                  <Badge tone={s.color}>{col.length}</Badge>
                </header>
                <ul className="flex-1 space-y-2 p-2">
                  {col.length === 0 && <li className="px-1 py-4 text-center text-xs text-slate-400">{tr("No tasks")}</li>}
                  {col.map((t) => {
                    const overdue = isOverdue(t.due_at, t.completed_at);
                    const allowed = (wf.transitions[t.status] ?? []).map((k) => ({ key: k, label: stateOf(wf, k).label }));
                    return (
                      <li key={t.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                        <Link href={`/tasks/${t.id}`} className="text-sm font-medium text-slate-900 hover:text-[#183E7C] hover:underline">{t.title}</Link>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <PriorityBadge priority={t.priority} />
                          {t.case_reference && <span>{t.case_reference}</span>}
                        </div>
                        <p className={cx("mt-1 text-xs", overdue ? "font-medium text-red-700" : "text-slate-500")}>
                          {t.assignee_name ?? tr("Unassigned")} · {t.due_at ? tr("Due {date}", { date: formatDate(t.due_at, { lang }) }) : tr("No due date")}
                          {overdue && ` · ${tr("Overdue")}`}
                        </p>
                        {manage && allowed.length > 0 && (
                          <div className="mt-2 border-t border-slate-100 pt-2">
                            <StatusSelect action={changeTaskStatusAction} taskId={t.id} current={t.status} options={allowed} compact label={tr("Change status of {title}", { title: t.title })} />
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
      )}
      {view === "board" && total > pageSize && (
        <p className="mt-3 text-xs text-slate-500">{tr("Showing the first {n} of {total} tasks. Use filters to narrow the board, or switch to list view.", { n: pageSize, total })}</p>
      )}
    </>
  );
}

async function FilterSelect({ id, name, label, value, options }: { id: string; name: string; label: string; value: string | null | undefined; options: { value: string; label: string }[] }) {
  const tr = await getTr();
  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} name={name} defaultValue={value ?? ""} className={inputClass}>
        <option value="">{tr("Any: {label}", { label })}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
