/**
 * Records browsing queries. Metadata only — never statement text, transcript
 * text, draft field values, note bodies or review comment bodies.
 * Every query is restricted by record-level visibility for the current user.
 */
import { all, get, type Param } from "@/lib/db";
import { can, caseVisibilityFilter, type AuthUser } from "@/lib/rbac/access";

export type RecordsTab = "statements" | "transcripts" | "drafts" | "reviews" | "notes" | "attachments" | "audit" | "access";

export interface RecordsFilters {
  q?: string; // case reference contains
  from?: string; // yyyy-mm-dd
  to?: string;
  actor?: string; // user id
  status?: string;
  action?: string; // audit action prefix
  page: number;
  pageSize: number;
}

export function tabAllowed(user: AuthUser, tab: RecordsTab): boolean {
  switch (tab) {
    case "statements":
    case "transcripts":
    case "drafts":
    case "reviews":
      return can(user, "record.view") && can(user, "statement.view");
    case "notes":
    case "attachments":
      return can(user, "record.view");
    case "audit":
    case "access":
      return can(user, "audit.view");
  }
}

/** Visibility predicate for statements aliased `s` (mirrors canViewStatement). */
export function statementVisibility(user: AuthUser): { sql: string; params: string[] } {
  if (!can(user, "statement.view")) return { sql: "0=1", params: [] };
  const cf = caseVisibilityFilter(user);
  const intake: string[] = ["s.created_by = ?"];
  const intakeParams: string[] = [user.id];
  if (can(user, "case.view.all")) intake.push("1=1");
  else if (can(user, "case.view.station") && user.stationId) {
    intake.push("s.station_id = ?");
    intakeParams.push(user.stationId);
  }
  return {
    sql: `((s.case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.id = s.case_id AND ${cf.sql})) OR (s.case_id IS NULL AND (${intake.join(" OR ")})))`,
    params: [...cf.params, ...intakeParams],
  };
}

function caseVis(user: AuthUser, col: string) {
  const cf = caseVisibilityFilter(user);
  return { sql: `EXISTS (SELECT 1 FROM cases c WHERE c.id = ${col} AND ${cf.sql})`, params: cf.params };
}

function dateRange(col: string, f: RecordsFilters, where: string[], params: Param[]) {
  if (f.from && !Number.isNaN(Date.parse(f.from))) {
    where.push(`${col} >= ?`);
    params.push(new Date(f.from + "T00:00:00").toISOString());
  }
  if (f.to && !Number.isNaN(Date.parse(f.to))) {
    where.push(`${col} < ?`);
    params.push(new Date(new Date(f.to + "T00:00:00").getTime() + 86400000).toISOString());
  }
}

function paged<T>(select: string, from: string, where: string[], params: Param[], order: string, f: RecordsFilters) {
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n ${from} ${w}`, ...params)!.n;
  const rows = all<T>(`SELECT ${select} ${from} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, f.pageSize, (f.page - 1) * f.pageSize);
  return { rows, total };
}

export interface StatementRecord {
  id: string; case_id: string | null; reference: string | null; station_code: string; status: string; capture_method: string | null;
  language: string; intake_at: string; created_by_name: string; transcript_versions: number; recordings: number; consent: string | null;
}
export function listStatements(user: AuthUser, f: RecordsFilters) {
  const v = statementVisibility(user);
  const where = [v.sql];
  const params: Param[] = [...v.params];
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("s.created_by = ?"); params.push(f.actor); }
  if (f.status) { where.push("s.status = ?"); params.push(f.status); }
  dateRange("s.intake_at", f, where, params);
  return paged<StatementRecord>(
    `s.id, s.case_id, cs.reference, st.code AS station_code, s.status, s.capture_method, s.language, s.intake_at, u.name AS created_by_name,
     (SELECT COUNT(*) FROM transcript_versions tv WHERE tv.statement_id = s.id) AS transcript_versions,
     (SELECT COUNT(*) FROM recordings r WHERE r.statement_id = s.id AND r.status = 'stored') AS recordings,
     (SELECT ce.decision FROM consent_events ce WHERE ce.statement_id = s.id ORDER BY ce.created_at DESC LIMIT 1) AS consent`,
    "FROM statements s LEFT JOIN cases cs ON cs.id = s.case_id JOIN stations st ON st.id = s.station_id JOIN users u ON u.id = s.created_by",
    where, params, "s.intake_at DESC", f,
  );
}

export interface TranscriptRecord {
  id: string; statement_id: string; version: number; source: string; language: string; chars: number; created_at: string;
  created_by_name: string; reference: string | null; case_id: string | null; has_uncertainty: number; recording_id: string | null;
}
export function listTranscripts(user: AuthUser, f: RecordsFilters) {
  const v = statementVisibility(user);
  const where = [v.sql];
  const params: Param[] = [...v.params];
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("tv.created_by = ?"); params.push(f.actor); }
  if (f.status) { where.push("tv.source = ?"); params.push(f.status); }
  dateRange("tv.created_at", f, where, params);
  return paged<TranscriptRecord>(
    `tv.id, tv.statement_id, tv.version, tv.source, tv.language, LENGTH(tv.text) AS chars, tv.created_at, u.name AS created_by_name,
     cs.reference, s.case_id, (tv.uncertainty_note IS NOT NULL AND tv.uncertainty_note != '') AS has_uncertainty, tv.recording_id`,
    "FROM transcript_versions tv JOIN statements s ON s.id = tv.statement_id LEFT JOIN cases cs ON cs.id = s.case_id JOIN users u ON u.id = tv.created_by",
    where, params, "tv.created_at DESC", f,
  );
}

export interface DraftRecord {
  id: string; statement_id: string; case_id: string | null; reference: string | null; status: string; current_version: number;
  template_name: string; template_version: number; origin: string | null; reviewed_by_name: string | null; reviewed_at: string | null;
  updated_at: string; created_by_name: string;
}
export function listDrafts(user: AuthUser, f: RecordsFilters) {
  const v = statementVisibility(user);
  const where = [v.sql];
  const params: Param[] = [...v.params];
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("d.created_by = ?"); params.push(f.actor); }
  if (f.status) { where.push("d.status = ?"); params.push(f.status); }
  dateRange("d.updated_at", f, where, params);
  return paged<DraftRecord>(
    `d.id, d.statement_id, COALESCE(d.case_id, s.case_id) AS case_id, cs.reference, d.status, d.current_version, t.name AS template_name, t.version AS template_version,
     (SELECT dv.origin FROM draft_versions dv WHERE dv.draft_id = d.id AND dv.version = d.current_version) AS origin,
     ru.name AS reviewed_by_name, d.reviewed_at, d.updated_at, u.name AS created_by_name`,
    `FROM drafts d JOIN statements s ON s.id = d.statement_id LEFT JOIN cases cs ON cs.id = COALESCE(d.case_id, s.case_id)
     JOIN templates t ON t.id = d.template_id LEFT JOIN users ru ON ru.id = d.reviewed_by JOIN users u ON u.id = d.created_by`,
    where, params, "d.updated_at DESC", f,
  );
}

export interface ReviewRecord {
  id: string; draft_id: string; statement_id: string; case_id: string | null; reference: string | null; draft_version: number;
  decision: string; has_comment: number; reviewer_name: string; created_at: string; open_comments: number;
}
export function listReviews(user: AuthUser, f: RecordsFilters) {
  const v = statementVisibility(user);
  const where = [v.sql];
  const params: Param[] = [...v.params];
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("r.reviewer_id = ?"); params.push(f.actor); }
  if (f.status) { where.push("r.decision = ?"); params.push(f.status); }
  dateRange("r.created_at", f, where, params);
  return paged<ReviewRecord>(
    `r.id, r.draft_id, d.statement_id, COALESCE(d.case_id, s.case_id) AS case_id, cs.reference, r.draft_version, r.decision,
     (r.comment IS NOT NULL AND r.comment != '') AS has_comment, u.name AS reviewer_name, r.created_at,
     (SELECT COUNT(*) FROM review_comments rc WHERE rc.draft_id = d.id AND rc.resolved_at IS NULL) AS open_comments`,
    `FROM reviews r JOIN drafts d ON d.id = r.draft_id JOIN statements s ON s.id = d.statement_id
     LEFT JOIN cases cs ON cs.id = COALESCE(d.case_id, s.case_id) JOIN users u ON u.id = r.reviewer_id`,
    where, params, "r.created_at DESC", f,
  );
}

export interface NoteRecord { id: string; case_id: string; reference: string; author_name: string; chars: number; created_at: string }
export function listNotes(user: AuthUser, f: RecordsFilters) {
  const v = caseVis(user, "n.case_id");
  const where = [v.sql];
  const params: Param[] = [...v.params];
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("n.author_id = ?"); params.push(f.actor); }
  dateRange("n.created_at", f, where, params);
  return paged<NoteRecord>(
    "n.id, n.case_id, cs.reference, u.name AS author_name, LENGTH(n.body) AS chars, n.created_at",
    "FROM case_notes n JOIN cases cs ON cs.id = n.case_id JOIN users u ON u.id = n.author_id",
    where, params, "n.created_at DESC", f,
  );
}

export interface AttachmentRecord {
  id: string; case_id: string | null; statement_id: string | null; reference: string | null; filename: string; mime_type: string;
  size_bytes: number; scan_status: string; uploaded_by_name: string; created_at: string; deleted_at: string | null;
}
export function listAttachments(user: AuthUser, f: RecordsFilters) {
  const cv = caseVis(user, "a.case_id");
  const sv = statementVisibility(user);
  const where = [`((a.case_id IS NOT NULL AND ${cv.sql}) OR (a.case_id IS NULL AND a.statement_id IS NOT NULL AND EXISTS (SELECT 1 FROM statements s WHERE s.id = a.statement_id AND ${sv.sql})))`];
  const params: Param[] = [...cv.params, ...sv.params];
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("a.uploaded_by = ?"); params.push(f.actor); }
  if (f.status === "deleted") where.push("a.deleted_at IS NOT NULL");
  else if (f.status === "active") where.push("a.deleted_at IS NULL");
  dateRange("a.created_at", f, where, params);
  return paged<AttachmentRecord>(
    "a.id, a.case_id, a.statement_id, cs.reference, a.filename, a.mime_type, a.size_bytes, a.scan_status, u.name AS uploaded_by_name, a.created_at, a.deleted_at",
    "FROM attachments a LEFT JOIN cases cs ON cs.id = a.case_id JOIN users u ON u.id = a.uploaded_by",
    where, params, "a.created_at DESC", f,
  );
}

const SECURITY_PREFIXES = ["auth.", "user.", "role.", "settings.", "demo.", "retention.", "system."];

/** Audit visibility for alias `a`. */
function auditVisibility(user: AuthUser): { sql: string; params: string[] } {
  if (can(user, "case.view.all")) return { sql: "1=1", params: [] };
  const security = `(${SECURITY_PREFIXES.map(() => "a.action LIKE ?").join(" OR ")})`;
  const secParams = SECURITY_PREFIXES.map((p) => `${p}%`);
  const hasCaseScope = can(user, "case.view.station") || can(user, "case.view.assigned");
  if (!hasCaseScope) {
    // e.g. System Administrator: security/administrative events only.
    return { sql: security, params: secParams };
  }
  const cf = caseVisibilityFilter(user);
  const parts = [`(a.case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.id = a.case_id AND ${cf.sql}))`];
  const params: string[] = [...cf.params];
  if (user.stationId) {
    parts.push("(a.case_id IS NULL AND a.actor_id IN (SELECT id FROM users WHERE station_id = ?))");
    params.push(user.stationId);
    parts.push("(a.entity_type = 'user' AND a.entity_id IN (SELECT id FROM users WHERE station_id = ?))");
    params.push(user.stationId);
  }
  parts.push("(a.case_id IS NULL AND a.actor_id = ?)");
  params.push(user.id);
  return { sql: `(${parts.join(" OR ")})`, params };
}

export interface AuditRecord {
  seq: number; id: string; actor_name: string | null; action: string; entity_type: string; entity_id: string | null;
  case_id: string | null; reference: string | null; summary: string; ip: string | null; created_at: string;
}
export function listAudit(user: AuthUser, f: RecordsFilters) {
  const v = auditVisibility(user);
  const where = [v.sql];
  const params: Param[] = [...v.params];
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("a.actor_id = ?"); params.push(f.actor); }
  if (f.action) { where.push("a.action LIKE ?"); params.push(`${f.action.replace(/[%_]/g, "")}%`); }
  dateRange("a.created_at", f, where, params);
  return paged<AuditRecord>(
    "a.seq, a.id, u.name AS actor_name, a.action, a.entity_type, a.entity_id, a.case_id, cs.reference, a.summary, a.ip, a.created_at",
    "FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN cases cs ON cs.id = a.case_id",
    where, params, "a.seq DESC", f,
  );
}

export function auditActionPrefixes(): string[] {
  return all<{ p: string }>("SELECT DISTINCT substr(action, 1, instr(action, '.') - 1) AS p FROM audit_events WHERE instr(action, '.') > 0 ORDER BY p").map((r) => r.p);
}

export interface AccessRecord {
  id: string; user_name: string; entity_type: string; entity_id: string; case_id: string | null; reference: string | null;
  action: string; ip: string | null; created_at: string;
}
export function listAccess(user: AuthUser, f: RecordsFilters) {
  const where: string[] = [];
  const params: Param[] = [];
  if (!can(user, "case.view.all")) {
    const hasCaseScope = can(user, "case.view.station") || can(user, "case.view.assigned");
    const parts: string[] = [];
    if (hasCaseScope) {
      const cf = caseVisibilityFilter(user);
      parts.push(`(e.case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.id = e.case_id AND ${cf.sql}))`);
      params.push(...cf.params);
    }
    if (user.stationId) {
      parts.push("e.user_id IN (SELECT id FROM users WHERE station_id = ?)");
      params.push(user.stationId);
    } else {
      parts.push("1=1"); // not station-bound (System Administrator): access metadata across stations, no content
    }
    where.push(`(${parts.join(" OR ")})`);
  }
  if (f.q) { where.push("cs.reference LIKE ?"); params.push(`%${f.q}%`); }
  if (f.actor) { where.push("e.user_id = ?"); params.push(f.actor); }
  if (f.status) { where.push("e.action = ?"); params.push(f.status); }
  dateRange("e.created_at", f, where, params);
  return paged<AccessRecord>(
    "e.id, u.name AS user_name, e.entity_type, e.entity_id, e.case_id, cs.reference, e.action, e.ip, e.created_at",
    "FROM record_access_events e JOIN users u ON u.id = e.user_id LEFT JOIN cases cs ON cs.id = e.case_id",
    where, params, "e.created_at DESC", f,
  );
}

/** Users that may appear in the actor filter (scoped). */
export function actorOptions(user: AuthUser) {
  if (user.stationId && !can(user, "case.view.all")) {
    return all<{ id: string; name: string }>("SELECT id, name FROM users WHERE station_id = ? ORDER BY name", user.stationId);
  }
  return all<{ id: string; name: string }>("SELECT id, name FROM users ORDER BY name");
}
