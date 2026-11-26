import { getTr, getLang } from "@/lib/i18n/server";
import Link from "next/link";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import { localizeAuditSummary } from "@/lib/i18n/audit-summary";
import { CalendarDays, Clock, AlertTriangle, FilePlus2, ListChecks, ShieldCheck, Settings, Users, Archive, FolderOpen, ClipboardCheck, History, SlidersHorizontal, UserCheck, UserX, KeyRound, Cpu } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can, type AuthUser } from "@/lib/rbac/access";
import { all, get } from "@/lib/db";
import { getWorkflow, stateOf, doneStates, listStations } from "@/lib/domain/workflow";
import { listTasks, type TaskRow } from "@/lib/domain/tasks";
import {
  sanitizeFilters,
  caseWhere,
  casesByStage,
  intakeByWeek,
  workloadByOfficer,
  overdueTaskCount,
  officerOptions,
  hasAnyCaseScope,
  hasStationScope,
  type AnalyticsFilters,
} from "@/lib/domain/analytics";
import { publicConfigStatus } from "@/lib/config";
import { formatDate, formatRelative, isOverdue } from "@/lib/format";
import { SectionHeading, Avatar, Card, Stat, Badge, Table, Th, Td, EmptyState, ButtonLink, Notice, KeyValue, buttonClass, inputClass } from "@/components/ui";
import { PriorityBadge } from "@/components/i18n/localized";
import { BarList, ColumnChart } from "@/components/charts/charts";
import { KpiCard } from "@/components/interactive/kpi-card";
import { ClickableRow } from "@/components/interactive/clickable-row";
import { LiveRefresh } from "@/components/interactive/live-refresh";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Overview") };
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const sp = await searchParams;
  const f = sanitizeFilters(user, { from: one(sp.from), to: one(sp.to), status: one(sp.status), officerId: one(sp.officerId), stationId: one(sp.stationId) });
  const scoped = hasAnyCaseScope(user);

  const today = new Intl.DateTimeFormat(lang === "en" ? "en-IN" : `${lang}-IN`, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <>
      <header aria-label={tr("Summary")} className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            <time dateTime={new Date().toISOString().slice(0, 10)}>{today}</time>
          </p>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-slate-900">
            {tr(greeting() === "morning" ? "Good morning, {name}" : greeting() === "afternoon" ? "Good afternoon, {name}" : "Good evening, {name}", { name: user.name })}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {tr(user.roleName as Parameters<typeof tr>[0])}
            {user.stationName && <span className="text-slate-400"> · </span>}
            {user.stationName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(user, "task.manage") && (
            <ButtonLink href="/tasks/new" variant="secondary" icon={<ListChecks />}>
              {tr("New task")}
            </ButtonLink>
          )}
          {can(user, "statement.create") && (
            <ButtonLink href="/intake/new" variant="primary" icon={<FilePlus2 />}>
              {tr("Create New Report")}
            </ButtonLink>
          )}
        </div>
      </header>
      {scoped ? <CaseOverview user={user} f={f} /> : <TechnicalOverview user={user} />}
    </>
  );
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400e3).toISOString();
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

async function CaseOverview({ user, f }: { user: AuthUser; f: AnalyticsFilters }) {
  const tr = await getTr();
  const lang = await getLang();
  const wf = localizeWorkflow(getWorkflow("case"), tr);
  const done = doneStates(wf);
  const notDone = done.length ? `AND c.status NOT IN (${done.map(() => "?").join(",")})` : "";
  // KPIs reflect current state: station/officer filters apply, date & status filters do not.
  const kw = caseWhere(user, f, { ignoreDates: true, ignoreStatus: true });
  const openCases = get<{ n: number }>(`SELECT COUNT(*) AS n FROM cases c WHERE ${kw.sql} ${notDone}`, ...kw.params, ...done)!.n;
  const reviewState = wf.states.find((s) => s.key === "officer_review")?.key ?? "officer_review";
  const awaitingReview = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cases c WHERE ${kw.sql} ${notDone}
       AND (c.status = ? OR EXISTS (SELECT 1 FROM drafts d WHERE d.case_id = c.id AND d.status IN ('draft','clarification_requested')))`,
    ...kw.params,
    ...done,
    reviewState,
  )!.n;
  const weekAgo = isoDaysAgo(7);
  const updated7d = get<{ n: number }>(`SELECT COUNT(*) AS n FROM cases c WHERE ${kw.sql} AND c.updated_at >= ?`, ...kw.params, weekAgo)!.n;
  const updatedPrev7d = get<{ n: number }>(`SELECT COUNT(*) AS n FROM cases c WHERE ${kw.sql} AND c.updated_at >= ? AND c.updated_at < ?`, ...kw.params, isoDaysAgo(14), weekAgo)!.n;
  const updDelta = updated7d - updatedPrev7d;
  const overdue = overdueTaskCount(user, { stationId: f.stationId });

  const stage = casesByStage(user, f);
  const weekly = intakeByWeek(user, f, lang);
  const stationScope = hasStationScope(user);
  const workload = stationScope ? workloadByOfficer(user, f).slice(0, 8) : [];

  const rw = caseWhere(user, f);
  const recentCases = all<{ id: string; reference: string; title: string; status: string; priority: string; next_action: string | null; next_action_due: string | null; assignee: string | null; updated_at: string; official_status: string }>(
    `SELECT c.id, c.reference, c.title, c.status, c.priority, c.next_action, c.next_action_due, u.name AS assignee, c.updated_at, c.official_status
       FROM cases c LEFT JOIN users u ON u.id = c.assigned_to WHERE ${rw.sql} ORDER BY c.updated_at DESC LIMIT 8`,
    ...rw.params,
  );

  const av = caseWhere(user, { stationId: f.stationId, officerId: f.officerId }, { ignoreDates: true, ignoreStatus: true });
  const activity = all<{ id: string; summary: string; created_at: string; actor: string | null; case_id: string; reference: string }>(
    `SELECT a.id, a.summary, a.created_at, u.name AS actor, a.case_id, c.reference
       FROM audit_events a JOIN cases c ON c.id = a.case_id LEFT JOIN users u ON u.id = a.actor_id
      WHERE ${av.sql} ORDER BY a.seq DESC LIMIT 10`,
    ...av.params,
  );

  const myTasks = can(user, "task.view") ? listTasks(user, { quick: "mine", pageSize: 6 }) : null;
  const overdueTasks = can(user, "task.view") ? listTasks(user, { quick: "overdue", pageSize: 5 }) : null;
  const dueSoon = can(user, "task.view") ? listTasks(user, { quick: "due_soon", pageSize: 5 }) : null;

  const stations = can(user, "case.view.all") ? listStations() : [];
  const officers = officerOptions(user);
  const filtered = !!(f.from || f.to || f.status || f.officerId || f.stationId);

  const hasTasks = can(user, "task.view") && myTasks && overdueTasks && dueSoon;

  return (
    <div className="space-y-8">
      {/* 1. Summary */}
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">{tr("Summary")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={tr("Open cases")} value={openCases} href="/cases" linkLabel={tr("View {label}", { label: tr("Cases") })} icon={<FolderOpen />} hint={stationScope ? tr("All open cases visible to you") : tr("Assigned to or created by you")} />
          <KpiCard label={tr("Awaiting review")} value={awaitingReview} href={`/cases?status=${reviewState}`} linkLabel={tr("View {label}", { label: tr("Awaiting review") })} icon={<ClipboardCheck />} hint={tr("Officer review or unreviewed drafts")} tone={awaitingReview > 0 ? "attention" : undefined} />
          <KpiCard label={tr("Overdue tasks")} value={overdue} href="/tasks?quick=overdue" linkLabel={tr("View {label}", { label: tr("Overdue tasks") })} icon={<AlertTriangle />} tone={overdue > 0 ? "red" : undefined} hint={overdue > 0 ? tr("Past due date — needs action") : tr("Nothing overdue")} />
          <KpiCard label={tr("Recent updates")} value={updated7d} href="/cases?sort=updated" linkLabel={tr("View {label}", { label: tr("Recent updates") })} icon={<History />} hint={tr("Cases updated in the last 7 days")} trend={{ value: `${updDelta > 0 ? "+" : ""}${updDelta}`, direction: updDelta > 0 ? "up" : updDelta < 0 ? "down" : "flat", label: tr("vs previous 7 days") }} />
        </div>
      </section>

      <details className="group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-white" open={filtered}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--radius-card)] px-5 py-3 text-sm font-semibold text-navy-900 hover:bg-slate-50">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-navy-700" aria-hidden />
            {tr("Filter dashboard")}
            {filtered && <Badge tone="blue">{tr("Filters applied")}</Badge>}
          </span>
          <span className="text-xs font-medium text-slate-500 group-open:hidden">{tr("Show")}</span>
          <span className="hidden text-xs font-medium text-slate-500 group-open:inline">{tr("Hide")}</span>
        </summary>
        <form method="get" action="/" className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-4" aria-label={tr("Dashboard filters")}>
          <div>
            <label htmlFor="o-from" className="mb-1.5 block text-sm font-semibold text-navy-900">{tr("Received from")}</label>
            <input id="o-from" name="from" type="date" defaultValue={f.from ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor="o-to" className="mb-1.5 block text-sm font-semibold text-navy-900">{tr("Received to")}</label>
            <input id="o-to" name="to" type="date" defaultValue={f.to ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor="o-status" className="mb-1.5 block text-sm font-semibold text-navy-900">{tr("Status")}</label>
            <select id="o-status" name="status" defaultValue={f.status ?? ""} className={inputClass}>
              <option value="">{tr("All statuses")}</option>
              {wf.states.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          {officers.length > 0 && (
            <div>
              <label htmlFor="o-officer" className="mb-1.5 block text-sm font-semibold text-navy-900">{tr("Officer")}</label>
              <select id="o-officer" name="officerId" defaultValue={f.officerId ?? ""} className={inputClass}>
                <option value="">{tr("All officers")}</option>
                {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          {stations.length > 0 && (
            <div>
              <label htmlFor="o-station" className="mb-1.5 block text-sm font-semibold text-navy-900">{tr("Station")}</label>
              <select id="o-station" name="stationId" defaultValue={f.stationId ?? ""} className={inputClass}>
                <option value="">{tr("All stations")}</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className={buttonClass("primary")}>{tr("Apply filters")}</button>
          {filtered && <Link href="/" className={buttonClass("ghost")}>{tr("Clear filters")}</Link>}
        </form>
      </details>

      {/* 2. Case status */}
      <section aria-labelledby="status-heading" className="space-y-3">
        <SectionHeading id="status-heading" title={tr("Case status")} description={f.from || f.to ? tr("Cases received in the selected period.") : tr("Where cases you can access currently stand.")} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title={tr("Cases by stage")} description={tr("Select a stage to open the filtered case list.")}>
            <BarList label={tr("Cases by stage")} labelHeader={tr("Stage")} data={stage.map((s) => ({ label: trDyn(tr, s.label), value: s.value, href: `/cases?status=${s.key}` }))} empty={tr("No cases to show.")} />
          </Card>
          <Card title={tr("Intake trend")} description={tr("Reports received per week.")}>
            <ColumnChart label={tr("Reports received per week")} labelHeader={tr("Week starting")} valueHeader={tr("Cases")} data={weekly.map((w) => ({ label: w.label, value: w.value }))} />
          </Card>
        </div>
      </section>

      {/* 3. Assigned tasks */}
      {hasTasks && (
        <section aria-labelledby="tasks-heading" className="space-y-3">
          <SectionHeading
            id="tasks-heading"
            title={tr("Assigned tasks")}
            description={tr("Your open work, anything overdue, and what is due in the next 48 hours.")}
            action={<Link href="/tasks" className="text-sm font-semibold text-blue-700 hover:underline">{tr("Open task list")}</Link>}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <TaskPanel title={tr("My open tasks")} href="/tasks?quick=mine" rows={myTasks.rows} total={myTasks.total} empty={tr("No open tasks assigned to you.")} />
            <TaskPanel title={tr("Overdue")} href="/tasks?quick=overdue" rows={overdueTasks.rows} total={overdueTasks.total} empty={tr("Nothing overdue.")} danger />
            <TaskPanel title={tr("Due in the next 48 hours")} href="/tasks?quick=due_soon" rows={dueSoon.rows} total={dueSoon.total} empty={tr("Nothing due soon.")} />
          </div>
        </section>
      )}

      {/* 4. Recently updated cases */}
      <section aria-labelledby="recent-heading" className="space-y-3">
        <SectionHeading
          id="recent-heading"
          title={tr("Recently updated cases")}
          description={filtered ? tr("Filtered by your selection.") : tr("The most recently updated cases you can access, with the next action for each.")}
          action={<Link href="/cases" className="text-sm font-semibold text-blue-700 hover:underline">{tr("View all cases")}</Link>}
        />
        <Card padded={false}>
          {recentCases.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={filtered ? tr("No cases match these filters") : tr("No cases yet")}
                description={filtered ? tr("Try widening the date range or clearing filters.") : tr("Cases appear here once a report intake is completed.")}
                action={can(user, "statement.create") && !filtered ? <ButtonLink href="/intake/new" variant="primary">{tr("Create new report")}</ButtonLink> : undefined}
              />
            </div>
          ) : (
            <>
            <ul className="divide-y divide-slate-100 sm:hidden" aria-label={tr("Recently updated cases")}>
              {recentCases.map((c) => {
                const st = stateOf(wf, c.status);
                const due = isOverdue(c.next_action_due);
                return (
                  <li key={c.id} className="relative px-4 py-3.5 transition-colors hover:bg-[#FAFAF7]">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/cases/${c.id}`} className="font-mono text-[13px] font-semibold text-[#111216] after:absolute after:inset-0 after:content-[''] hover:underline">{c.reference}</Link>
                      <time dateTime={c.updated_at} className="shrink-0 text-xs text-slate-500">{formatRelative(c.updated_at, lang)}</time>
                    </div>
                    <Link href={`/cases/${c.id}`} className="mt-0.5 block break-words text-sm font-medium text-slate-900 hover:underline">{c.title}</Link>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={st.color}>{st.label}</Badge>
                      <PriorityBadge priority={c.priority} />
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{c.assignee ?? <span className="text-slate-500">{tr("Unassigned")}</span>}</p>
                    {c.next_action && (
                      <div className="mt-1 text-sm text-slate-700">
                        <p className="line-clamp-2 break-words">{c.next_action}</p>
                        {c.next_action_due && <p className={`text-xs ${due ? "font-semibold text-red-700" : "text-slate-500"}`}>{due ? tr("Overdue · ") : tr("Due ")}{formatDate(c.next_action_due, { lang })}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block">
            <Table caption={tr("Recently updated cases")}>
              <thead>
                <tr>
                  <Th>{tr("Reference")}</Th>
                  <Th>{tr("Title")}</Th>
                  <Th>{tr("Status")}</Th>
                  <Th>{tr("Priority")}</Th>
                  <Th>{tr("Assigned")}</Th>
                  <Th>{tr("Next action")}</Th>
                  <Th>{tr("Updated")}</Th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((c) => {
                  const st = stateOf(wf, c.status);
                  const due = isOverdue(c.next_action_due);
                  return (
                    <ClickableRow key={c.id} href={`/cases/${c.id}`} label={tr("Open {ref}", { ref: `${c.reference} — ${c.title}` })}>
                      <Td><Link href={`/cases/${c.id}`} tabIndex={-1} className="whitespace-nowrap font-mono text-[13px] font-semibold text-[#111216] hover:underline">{c.reference}</Link></Td>
                      <Td className="max-w-[18rem]"><span className="line-clamp-2">{c.title}</span></Td>
                      <Td><Badge tone={st.color}>{st.label}</Badge></Td>
                      <Td><PriorityBadge priority={c.priority} /></Td>
                      <Td>{c.assignee ?? <span className="text-slate-500">{tr("Unassigned")}</span>}</Td>
                      <Td className="max-w-[16rem]">
                        {c.next_action ? (
                          <>
                            <span className="line-clamp-2">{c.next_action}</span>
                            {c.next_action_due && <span className={`text-xs ${due ? "font-semibold text-red-700" : "text-slate-500"}`}>{due ? tr("Overdue · ") : tr("Due ")}{formatDate(c.next_action_due, { lang })}</span>}
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-slate-500"><time dateTime={c.updated_at}>{formatRelative(c.updated_at, lang)}</time></Td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </Table>
            </div>
            </>
          )}
        </Card>
      </section>

      {/* 5. Workload and activity */}
      <section aria-labelledby="activity-heading" className="space-y-3">
        <SectionHeading id="activity-heading" title={tr("Workload and activity")} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {stationScope && (
            <Card title={tr("Workload distribution")} description={tr("Open cases per assigned officer.")} actions={can(user, "analytics.view") ? <Link href="/analytics" className="text-sm font-semibold text-blue-700 hover:underline">{tr("Full report")}</Link> : undefined}>
              <BarList
                label={tr("Open cases per officer")}
                labelHeader={tr("Officer")}
                valueHeader={tr("Open cases")}
                data={workload.filter((w) => w.openCases > 0).map((w) => ({ label: w.name, value: w.openCases, hint: tr("{n} open tasks", { n: w.openTasks }) }))}
                empty={tr("No open cases are assigned.")}
              />
            </Card>
          )}
          <Card title={tr("Recent activity")} description={tr("Latest recorded actions on cases you can access.")} actions={<LiveRefresh />} className={stationScope ? "" : "xl:col-span-2"}>
            {activity.length === 0 ? (
              <p className="text-sm text-slate-500">{tr("No recent activity.")}</p>
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200">
                {activity.map((a) => (
                  <li key={a.id} className="relative flex gap-3 text-sm">
                    <Avatar name={a.actor ?? "System"} size={32} />
                    <div className="min-w-0 pt-0.5">
                      <p className="text-slate-800">
                        <span className="font-semibold text-navy-900">{a.actor ?? tr("System")}</span> — {localizeAuditSummary(a.summary, tr)}
                      </p>
                      <p className="text-xs text-slate-500">
                        <Link href={`/cases/${a.case_id}`} className="font-medium text-blue-700 hover:underline">{a.reference}</Link> · <time dateTime={a.created_at} title={formatDate(a.created_at, { time: true, lang })}>{formatRelative(a.created_at, lang)}</time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}

async function TaskPanel({ title, href, rows, total, empty, danger }: { title: string; href: string; rows: TaskRow[]; total: number; empty: string; danger?: boolean }) {
  const tr = await getTr();
  const lang = await getLang();
  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          {danger && total > 0 && <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />}
          {title}
          <span className={`rounded-full px-2 text-xs font-semibold tabular-nums leading-5 ${danger && total > 0 ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-slate-100 text-slate-600"}`}>{total}</span>
        </span>
      }
      actions={total > 0 ? <Link href={href} className="text-xs font-medium text-blue-700 hover:underline">{tr("View all")}</Link> : undefined}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100">
          {rows.map((t) => {
            const od = isOverdue(t.due_at, t.completed_at);
            return (
              <li key={t.id} className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center ${od ? "text-[var(--danger)]" : "text-slate-400"}`} aria-hidden>
                  {od ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0">
                <Link href={`/tasks/${t.id}`} className="line-clamp-2 text-sm font-medium text-slate-900 hover:text-blue-800 hover:underline">{t.title}</Link>
                <p className="text-xs text-slate-500">
                  {t.case_reference ? `${t.case_reference} · ` : ""}
                  <span className={od ? "font-medium text-red-700" : undefined}>{t.due_at ? `${od ? tr("Overdue · ") : tr("Due ")}${formatDate(t.due_at, { time: true, lang })}` : tr("No due date")}</span>
                </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

async function TechnicalOverview({ user }: { user: AuthUser }) {
  const tr = await getTr();
  const cfg = publicConfigStatus();
  const users = get<{ active: number; suspended: number }>(
    "SELECT SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status <> 'active' THEN 1 ELSE 0 END) AS suspended FROM users",
  )!;
  const failed24h = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('auth.login_failed','auth.account_locked') AND created_at >= ?", isoDaysAgo(1))!.n;
  const myTasks = can(user, "task.view") ? listTasks(user, { quick: "mine", pageSize: 6 }) : null;

  return (
    <div className="space-y-6">
      <Notice tone="slate" title={tr("Technical administration view")}>
        {tr("Your role manages configuration and accounts. It does not include access to case records or statement content, so case dashboards are not shown.")}
      </Notice>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={tr("Active users")} icon={<UserCheck className="h-5 w-5" />} value={users.active ?? 0} href={can(user, "user.manage") ? "/admin/users" : undefined} />
        <Stat label={tr("Suspended / deactivated")} icon={<UserX className="h-5 w-5" />} value={users.suspended ?? 0} href={can(user, "user.manage") ? "/admin/users" : undefined} />
        <Stat label={tr("Failed sign-ins (24h)")} icon={<KeyRound className="h-5 w-5" />} value={failed24h} tone={failed24h > 0 ? "amber" : undefined} href={can(user, "audit.view") ? "/records?tab=audit" : undefined} />
        <Stat label={tr("AI mode")} icon={<Cpu className="h-5 w-5" />} value={cfg.ai.effectiveMode === "live" ? tr("Live") : tr("Rule-based")} hint={cfg.ai.model} href="/settings?tab=system" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={tr("Configuration status")} description={tr("Secrets are never displayed.")} actions={<Link href="/settings?tab=system" className="text-sm font-medium text-blue-700 hover:underline">{tr("Details")}</Link>}>
          <KeyValue
            items={[
              { label: tr("Environment"), value: cfg.environment },
              { label: tr("Sample data mode"), value: cfg.demoMode ? <Badge tone="amber">{tr("On")}</Badge> : <Badge tone="green">{tr("Off")}</Badge> },
              { label: tr("File encryption"), value: cfg.storageEncryption },
              { label: tr("Identity provider"), value: cfg.identityProvider },
              { label: tr("Email / SMS"), value: `${cfg.email} / ${cfg.sms}` },
              { label: tr("Official filing integration"), value: cfg.officialFilingIntegration },
            ]}
          />
        </Card>
        <Card title={tr("Administration")}>
          <ul className="space-y-2 text-sm">
            {can(user, "user.manage") && <li><Link href="/admin/users" className="inline-flex items-center gap-2 text-blue-700 hover:underline"><Users className="h-4 w-4" aria-hidden /> {tr("Manage users and account lifecycle")}</Link></li>}
            {can(user, "audit.view") && <li><Link href="/records?tab=audit" className="inline-flex items-center gap-2 text-blue-700 hover:underline"><Archive className="h-4 w-4" aria-hidden /> {tr("Review audit and security events")}</Link></li>}
            <li><Link href="/settings?tab=system" className="inline-flex items-center gap-2 text-blue-700 hover:underline"><Settings className="h-4 w-4" aria-hidden /> {tr("System configuration status")}</Link></li>
            <li className="flex items-center gap-2 text-slate-600"><ShieldCheck className="h-4 w-4" aria-hidden /> {tr("Production deployment checklist: see docs/ in the repository.")}</li>
          </ul>
        </Card>
      </div>
      {myTasks && myTasks.total > 0 && <TaskPanel title={tr("My open tasks")} href="/tasks?quick=mine" rows={myTasks.rows} total={myTasks.total} empty="" />}
    </div>
  );
}
