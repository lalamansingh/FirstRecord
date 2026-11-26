import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import { can } from "@/lib/rbac/access";
import { listStations, getWorkflow } from "@/lib/domain/workflow";
import {
  sanitizeFilters,
  casesByStage,
  intakeByWeek,
  casesByIncidentType,
  casesByPriority,
  workloadByOfficer,
  resolutionStats,
  overdueTaskCount,
  totals,
  officerOptions,
  hasAnyCaseScope,
  hasStationScope,
  EXPORT_DATASETS,
  EXPORT_PURPOSES,
} from "@/lib/domain/analytics";
import { PageHeader, Card, Stat, Notice, Table, Th, Td, EmptyState, buttonClass, inputClass } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts/charts";
import { ExportDialog } from "./export-dialog";
import { getTr, getLang } from "@/lib/i18n/server";
import type { MsgKey, Tr } from "@/lib/i18n/messages";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Reports & Analytics") };
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const fmtDays = (n: number | null, tr: Tr) => (n === null ? "—" : tr("{n} d", { n: n.toFixed(1) }));

function dateDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePermission("analytics.view");
  const tr = await getTr();
  const sp = await searchParams;
  const defaultFrom = dateDaysAgo(90);
  const raw = {
    from: one(sp.from) ?? defaultFrom,
    to: one(sp.to),
    status: one(sp.status),
    stationId: one(sp.stationId),
    officerId: one(sp.officerId),
  };
  const f = sanitizeFilters(user, raw);
  const wf = localizeWorkflow(getWorkflow("case"), tr);
  const scoped = hasAnyCaseScope(user);
  const stationScope = hasStationScope(user);
  const stations = can(user, "case.view.all") ? listStations() : [];
  const officers = officerOptions(user);

  const exportFilters: Record<string, string> = {
    from: f.from ?? "",
    to: f.to ?? "",
    status: f.status ?? "",
    stationId: f.stationId ?? "",
    officerId: f.officerId ?? "",
  };

  return (
    <>
      <PageHeader
        title={tr("Reports & Analytics")}
        description={tr("Aggregate operational reporting for the cases you are permitted to see. Reports show counts and durations only — never statement content or party details.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Reports & Analytics") }]}
        actions={can(user, "analytics.export") && scoped ? <ExportDialog datasets={EXPORT_DATASETS} purposes={EXPORT_PURPOSES} filters={exportFilters} /> : undefined}
      />

      {!scoped ? (
        <EmptyState
          title={tr("No case data in your scope")}
          description={tr("Your role does not include access to case records, so case reports are not available. Technical and security activity is available in the Records audit log.")}
          action={can(user, "audit.view") ? <Link href="/records?tab=audit" className={buttonClass("primary")}>{tr("Open audit log")}</Link> : undefined}
        />
      ) : (
        <>
          <form method="get" action="/analytics" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <div>
              <label htmlFor="a-from" className="mb-1 block text-xs font-medium text-slate-600">{tr("Received from")}</label>
              <input id="a-from" name="from" type="date" defaultValue={f.from ?? ""} className={`${inputClass} !py-1.5`} />
            </div>
            <div>
              <label htmlFor="a-to" className="mb-1 block text-xs font-medium text-slate-600">{tr("Received to")}</label>
              <input id="a-to" name="to" type="date" defaultValue={f.to ?? ""} className={`${inputClass} !py-1.5`} />
            </div>
            <div>
              <label htmlFor="a-status" className="mb-1 block text-xs font-medium text-slate-600">{tr("Status")}</label>
              <select id="a-status" name="status" defaultValue={f.status ?? ""} className={`${inputClass} !py-1.5`}>
                <option value="">{tr("All statuses")}</option>
                {wf.states.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {officers.length > 0 && (
              <div>
                <label htmlFor="a-officer" className="mb-1 block text-xs font-medium text-slate-600">{tr("Assigned officer")}</label>
                <select id="a-officer" name="officerId" defaultValue={f.officerId ?? ""} className={`${inputClass} !py-1.5`}>
                  <option value="">{tr("All officers")}</option>
                  {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            {stations.length > 0 && (
              <div>
                <label htmlFor="a-station" className="mb-1 block text-xs font-medium text-slate-600">{tr("Station")}</label>
                <select id="a-station" name="stationId" defaultValue={f.stationId ?? ""} className={`${inputClass} !py-1.5`}>
                  <option value="">{tr("All stations")}</option>
                  {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <button type="submit" className={buttonClass("secondary")}>{tr("Apply")}</button>
            <Link href="/analytics" className="pb-2 text-xs text-[#111216] hover:underline">{tr("Reset")}</Link>
          </form>

          <AnalyticsBody user={user} f={f} stationScope={stationScope} tr={tr} lang={await getLang()} />
        </>
      )}
    </>
  );
}

function AnalyticsBody({ user, f, stationScope, tr, lang }: { user: Parameters<typeof totals>[0]; f: ReturnType<typeof sanitizeFilters>; stationScope: boolean; tr: Tr; lang?: string }) {
  const t = totals(user, f);
  const stage = casesByStage(user, f);
  const weekly = intakeByWeek(user, f, lang);
  const types = casesByIncidentType(user, f);
  const priority = casesByPriority(user, f);
  const workload = workloadByOfficer(user, f);
  const res = resolutionStats(user, f);
  const overdue = overdueTaskCount(user, { stationId: f.stationId });

  return (
    <div className="space-y-6">
      {!stationScope && (
        <Notice tone="slate">{tr("Figures cover only the cases assigned to or created by you. Station-wide reporting requires station-level access.")}</Notice>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label={tr("Cases received")} value={t.total} hint={tr("In selected period")} />
        <Stat label={tr("Open")} value={t.open} />
        <Stat label={tr("Closed")} value={t.closed} />
        <Stat label={tr("Median resolution")} value={fmtDays(res.median, tr)} hint={res.count ? tr("{n} closed cases", { n: res.count }) : tr("No closed cases")} />
        <Stat label={tr("Overdue tasks")} value={overdue} tone={overdue > 0 ? "red" : undefined} href="/tasks?quick=overdue" hint={tr("Current, all dates")} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title={tr("Cases by stage")} description={tr("Cases received in the period, by current workflow stage.")}>
          <BarList label={tr("Cases by stage")} labelHeader={tr("Stage")} data={stage.map((s) => ({ label: trDyn(tr, s.label), value: s.value, href: `/cases?status=${s.key}` }))} />
        </Card>
        <Card title={tr("Intake volume")} description={tr("Cases received per week (week starting Monday).")}>
          <ColumnChart label={tr("Cases received per week")} labelHeader={tr("Week starting")} valueHeader={tr("Cases")} data={weekly.map((w) => ({ label: w.label, value: w.value }))} />
        </Card>
        <Card title={tr("Cases by incident type")} description={tr("As recorded at intake — a descriptive category, not a legal classification.")}>
          <BarList label={tr("Cases by incident type")} labelHeader={tr("Incident type")} data={types.map((d) => ({ ...d, label: trDyn(tr, d.label) }))} />
        </Card>
        <Card title={tr("Cases by priority")}>
          <BarList label={tr("Cases by priority")} labelHeader={tr("Priority")} data={priority.map((p) => ({ label: tr(p.label as MsgKey), value: p.value }))} />
        </Card>
      </div>

      <Card title={tr("Resolution time")} description={tr("Days from report received to case closed, for cases received in the period and since closed.")}>
        {res.count === 0 ? (
          <p className="text-sm text-slate-500">{tr("No closed cases in the selected period.")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [tr("Closed cases"), String(res.count)],
              [tr("Mean"), fmtDays(res.mean, tr)],
              [tr("Median"), fmtDays(res.median, tr)],
              [tr("90th percentile"), fmtDays(res.p90, tr)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium text-slate-500">{k}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {stationScope && (
        <Card title={tr("Workload by officer")} description={tr("Currently open cases and tasks (not limited by the date range).")} padded={false}>
          {workload.length === 0 ? (
            <div className="p-4"><p className="text-sm text-slate-500">{tr("No open cases or tasks.")}</p></div>
          ) : (
            <Table caption={tr("Workload by officer")}>
              <thead>
                <tr>
                  <Th>{tr("Officer")}</Th>
                  <Th className="text-right">{tr("Open cases")}</Th>
                  <Th className="text-right">{tr("Open tasks")}</Th>
                  <Th className="text-right">{tr("Overdue tasks")}</Th>
                </tr>
              </thead>
              <tbody>
                {workload.map((w) => (
                  <tr key={w.id ?? "unassigned"}>
                    <Td>{w.id ? w.name : <span className="text-slate-500">{tr("Unassigned")}</span>}</Td>
                    <Td className="text-right tabular-nums">{w.openCases}</Td>
                    <Td className="text-right tabular-nums">{w.openTasks}</Td>
                    <Td className={`text-right tabular-nums ${w.overdueTasks > 0 ? "font-medium text-red-700" : ""}`}>{w.overdueTasks}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <p className="text-xs text-slate-500">
        {tr("Workload figures describe allocation of work, not individual performance. Small counts may still identify individual cases; share exports only with authorized recipients.")}
      </p>
    </div>
  );
}
