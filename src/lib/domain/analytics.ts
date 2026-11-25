/**
 * Aggregate, permission-filtered reporting queries. These return COUNTS and
 * DURATIONS only — never narrative text, statement content or party details.
 * Staff names appear only for workload (operational data about staff, not parties).
 */
import { all, get } from "@/lib/db";
import { localeFor } from "@/lib/format";
import { can, caseVisibilityFilter, taskVisibilityFilter, type AuthUser } from "@/lib/rbac/access";
import { getWorkflow, doneStates } from "@/lib/domain/workflow";

export interface AnalyticsFilters {
  from?: string | null; // YYYY-MM-DD, on received_at
  to?: string | null; // YYYY-MM-DD inclusive
  status?: string | null;
  stationId?: string | null; // honoured only with case.view.all
  officerId?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + normalize raw filter input; drops anything unsafe or not permitted. */
export function sanitizeFilters(user: AuthUser, raw: Record<string, string | null | undefined>): AnalyticsFilters {
  const wf = getWorkflow("case");
  const f: AnalyticsFilters = {};
  if (raw.from && DATE_RE.test(raw.from)) f.from = raw.from;
  if (raw.to && DATE_RE.test(raw.to)) f.to = raw.to;
  if (raw.status && wf.states.some((s) => s.key === raw.status)) f.status = raw.status;
  if (raw.stationId && can(user, "case.view.all") && /^[0-9a-f-]{36}$/.test(raw.stationId)) f.stationId = raw.stationId;
  if (raw.officerId && /^[0-9a-f-]{36}$/.test(raw.officerId)) f.officerId = raw.officerId;
  return f;
}

export function hasStationScope(user: AuthUser) {
  return can(user, "case.view.station") || can(user, "case.view.all");
}

export function hasAnyCaseScope(user: AuthUser) {
  return can(user, "case.view.assigned") || hasStationScope(user);
}

/** WHERE clause for cases aliased `c` with visibility + filters. */
export function caseWhere(user: AuthUser, f: AnalyticsFilters, opts: { ignoreStatus?: boolean; ignoreDates?: boolean } = {}) {
  const vis = caseVisibilityFilter(user);
  const parts = [vis.sql];
  const params: string[] = [...vis.params];
  if (!opts.ignoreDates && f.from) {
    parts.push("c.received_at >= ?");
    params.push(new Date(`${f.from}T00:00:00`).toISOString());
  }
  if (!opts.ignoreDates && f.to) {
    parts.push("c.received_at < ?");
    params.push(new Date(new Date(`${f.to}T00:00:00`).getTime() + 86400e3).toISOString());
  }
  if (!opts.ignoreStatus && f.status) {
    parts.push("c.status = ?");
    params.push(f.status);
  }
  if (f.stationId) {
    parts.push("c.station_id = ?");
    params.push(f.stationId);
  }
  if (f.officerId) {
    parts.push("c.assigned_to = ?");
    params.push(f.officerId);
  }
  return { sql: parts.join(" AND "), params };
}

export function casesByStage(user: AuthUser, f: AnalyticsFilters) {
  const wf = getWorkflow("case");
  const w = caseWhere(user, f, { ignoreStatus: true });
  const rows = all<{ status: string; n: number }>(`SELECT c.status, COUNT(*) AS n FROM cases c WHERE ${w.sql} GROUP BY c.status`, ...w.params);
  const map = new Map(rows.map((r) => [r.status, r.n]));
  const out = wf.states.map((s) => ({ key: s.key, label: s.label, value: map.get(s.key) ?? 0 }));
  // Statuses no longer in the workflow (after reconfiguration) still count.
  for (const r of rows) if (!wf.states.some((s) => s.key === r.status)) out.push({ key: r.status, label: r.status, value: r.n });
  return out;
}

/** Monday-start ISO date for a date. */
function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

/** Cases received per week, zero-filled. Defaults to the last 12 weeks when no dates are given. */
export function intakeByWeek(user: AuthUser, f: AnalyticsFilters, lang?: string) {
  const to = f.to ? new Date(`${f.to}T00:00:00Z`) : new Date();
  let from = f.from ? new Date(`${f.from}T00:00:00Z`) : new Date(to.getTime() - 11 * 7 * 86400e3);
  if (to.getTime() - from.getTime() > 104 * 7 * 86400e3) from = new Date(to.getTime() - 104 * 7 * 86400e3); // cap 2 years
  const w = caseWhere(user, { ...f, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
  const rows = all<{ wk: string; n: number }>(
    `SELECT date(c.received_at, '-6 days', 'weekday 1') AS wk, COUNT(*) AS n FROM cases c WHERE ${w.sql} GROUP BY wk`,
    ...w.params,
  );
  const map = new Map(rows.map((r) => [r.wk, r.n]));
  const out: { week: string; label: string; value: number }[] = [];
  for (let d = new Date(`${weekStart(from)}T00:00:00Z`); d <= to; d = new Date(d.getTime() + 7 * 86400e3)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ week: key, label: d.toLocaleDateString(localeFor(lang), { day: "2-digit", month: "short", timeZone: "UTC" }), value: map.get(key) ?? 0 });
  }
  return out;
}

export function casesByIncidentType(user: AuthUser, f: AnalyticsFilters) {
  const w = caseWhere(user, f);
  return all<{ label: string; value: number }>(
    `SELECT c.incident_type AS label, COUNT(*) AS value FROM cases c WHERE ${w.sql} GROUP BY c.incident_type ORDER BY value DESC, label`,
    ...w.params,
  );
}

export function casesByPriority(user: AuthUser, f: AnalyticsFilters) {
  const w = caseWhere(user, f);
  const rows = all<{ priority: string; n: number }>(`SELECT c.priority, COUNT(*) AS n FROM cases c WHERE ${w.sql} GROUP BY c.priority`, ...w.params);
  const m = new Map(rows.map((r) => [r.priority, r.n]));
  return ["urgent", "high", "medium", "low"].map((p) => ({ key: p, label: p[0].toUpperCase() + p.slice(1), value: m.get(p) ?? 0 }));
}

/** Open cases and open/overdue tasks per officer. Only for station-scope users. */
export function workloadByOfficer(user: AuthUser, f: AnalyticsFilters) {
  if (!hasStationScope(user)) return [];
  const wf = getWorkflow("case");
  const done = doneStates(wf);
  const w = caseWhere(user, f, { ignoreDates: true });
  const doneSql = done.length ? `AND c.status NOT IN (${done.map(() => "?").join(",")})` : "";
  const caseRows = all<{ id: string | null; name: string | null; n: number }>(
    `SELECT c.assigned_to AS id, u.name, COUNT(*) AS n FROM cases c LEFT JOIN users u ON u.id = c.assigned_to
      WHERE ${w.sql} ${doneSql} GROUP BY c.assigned_to`,
    ...w.params,
    ...done,
  );
  const tv = taskVisibilityFilter(user);
  const nowIso = new Date().toISOString();
  const taskRows = all<{ id: string | null; name: string | null; open: number; overdue: number }>(
    `SELECT t.assignee_id AS id, u.name, COUNT(*) AS open,
            SUM(CASE WHEN t.due_at IS NOT NULL AND t.due_at < ? THEN 1 ELSE 0 END) AS overdue
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE ${tv.sql} AND t.completed_at IS NULL ${f.stationId ? "AND t.station_id = ?" : ""}
      GROUP BY t.assignee_id`,
    nowIso,
    ...tv.params,
    ...(f.stationId ? [f.stationId] : []),
  );
  const map = new Map<string, { id: string | null; name: string; openCases: number; openTasks: number; overdueTasks: number }>();
  const key = (id: string | null) => id ?? "__unassigned";
  for (const r of caseRows) map.set(key(r.id), { id: r.id, name: r.name ?? "Unassigned", openCases: r.n, openTasks: 0, overdueTasks: 0 });
  for (const r of taskRows) {
    const e = map.get(key(r.id)) ?? { id: r.id, name: r.name ?? "Unassigned", openCases: 0, openTasks: 0, overdueTasks: 0 };
    e.openTasks = r.open;
    e.overdueTasks = r.overdue;
    map.set(key(r.id), e);
  }
  return [...map.values()].sort((a, b) => b.openCases + b.openTasks - (a.openCases + a.openTasks));
}

/** Resolution time (received → closed) in days for closed cases in range. */
export function resolutionStats(user: AuthUser, f: AnalyticsFilters) {
  const w = caseWhere(user, f, { ignoreStatus: true });
  const rows = all<{ days: number }>(
    `SELECT julianday(c.closed_at) - julianday(c.received_at) AS days FROM cases c WHERE ${w.sql} AND c.closed_at IS NOT NULL ORDER BY days`,
    ...w.params,
  );
  const vals = rows.map((r) => Math.max(0, r.days));
  if (vals.length === 0) return { count: 0, mean: null as number | null, median: null as number | null, p90: null as number | null };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const q = (p: number) => {
    const idx = (vals.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
  };
  return { count: vals.length, mean, median: q(0.5), p90: q(0.9) };
}

export function overdueTaskCount(user: AuthUser, f: Pick<AnalyticsFilters, "stationId"> = {}) {
  const tv = taskVisibilityFilter(user);
  return get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks t WHERE ${tv.sql} AND t.completed_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < ? ${f.stationId ? "AND t.station_id = ?" : ""}`,
    ...tv.params,
    new Date().toISOString(),
    ...(f.stationId ? [f.stationId] : []),
  )!.n;
}

export function totals(user: AuthUser, f: AnalyticsFilters) {
  const wf = getWorkflow("case");
  const done = doneStates(wf);
  const w = caseWhere(user, f);
  const row = get<{ total: number; closed: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN c.status IN (${done.map(() => "?").join(",") || "''"}) THEN 1 ELSE 0 END) AS closed FROM cases c WHERE ${w.sql}`,
    ...done,
    ...w.params,
  )!;
  return { total: row.total, closed: row.closed ?? 0, open: row.total - (row.closed ?? 0) };
}

/** Officers selectable in filters (staff in visible stations). */
export function officerOptions(user: AuthUser) {
  if (!hasStationScope(user)) return [];
  if (can(user, "case.view.all")) {
    return all<{ id: string; name: string }>("SELECT u.id, u.name FROM users u WHERE u.status = 'active' AND u.station_id IS NOT NULL ORDER BY u.name");
  }
  return all<{ id: string; name: string }>("SELECT id, name FROM users WHERE station_id = ? AND status = 'active' ORDER BY name", user.stationId);
}

export const EXPORT_PURPOSES = {
  operational_review: "Operational review",
  monthly_reporting: "Monthly reporting",
  audit_request: "Audit / oversight request",
  other: "Other (specify)",
} as const;
export type ExportPurpose = keyof typeof EXPORT_PURPOSES;

export const EXPORT_DATASETS = {
  stage: "Cases by stage",
  intake: "Weekly intake volume",
  incident_type: "Cases by incident type",
  workload: "Workload by officer",
  resolution: "Resolution time summary",
} as const;
export type ExportDataset = keyof typeof EXPORT_DATASETS;

/** Build aggregate CSV rows for a dataset. No PII, no narrative. */
export function exportRows(user: AuthUser, dataset: ExportDataset, f: AnalyticsFilters): (string | number)[][] {
  switch (dataset) {
    case "stage":
      return [["stage", "case_count"], ...casesByStage(user, f).map((r) => [r.label, r.value])];
    case "intake":
      return [["week_starting", "cases_received"], ...intakeByWeek(user, f).map((r) => [r.week, r.value])];
    case "incident_type":
      return [["incident_type", "case_count"], ...casesByIncidentType(user, f).map((r) => [r.label, r.value])];
    case "workload":
      return [["officer", "open_cases", "open_tasks", "overdue_tasks"], ...workloadByOfficer(user, f).map((r) => [r.name, r.openCases, r.openTasks, r.overdueTasks])];
    case "resolution": {
      const s = resolutionStats(user, f);
      const r = (n: number | null) => (n === null ? "" : n.toFixed(1));
      return [["closed_cases", "mean_days", "median_days", "p90_days"], [s.count, r(s.mean), r(s.median), r(s.p90)]];
    }
  }
}

/** CSV encode with formula-injection protection. */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let s = String(cell ?? "");
          if (typeof cell === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}
