/**
 * Case domain service. All functions take the acting user and enforce
 * record-level access and permissions themselves.
 */
import { all, get, insert, newId, now, parseJson, run, tx, update } from "@/lib/db";
import {
  assertCan,
  assertCaseAccess,
  assertCaseAction,
  can,
  caseVisibilityFilter,
  type AuthUser,
} from "@/lib/rbac/access";
import { isPermission, type Permission } from "@/lib/rbac/permissions";
import { audit, recordAccess } from "@/lib/audit";
import { notify } from "@/lib/domain/notifications";
import { assertTransition, getWorkflow, stateLabel, stateOf } from "@/lib/domain/workflow";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { PARTY_ROLE_LABELS, PRIORITY_LABELS } from "@/lib/format";

export const PAGE_SIZE = 20;

export interface CaseListFilters {
  q?: string;
  status?: string;
  priority?: string;
  officer?: string; // user id | "unassigned" | "me"
  station?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
}

export interface CaseListRow {
  id: string;
  reference: string;
  title: string;
  incident_type: string;
  incident_location: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  assignee_name: string | null;
  next_action: string | null;
  next_action_due: string | null;
  received_at: string;
  updated_at: string;
  station_code: string;
  official_status: string;
  is_demo: number;
}

const SORTS: Record<string, string> = {
  reference: "c.reference",
  title: "c.title",
  received: "c.received_at",
  status: "c.status",
  priority: "CASE c.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END",
  officer: "assignee_name",
  updated: "c.updated_at",
};

function buildWhere(user: AuthUser, f: CaseListFilters) {
  const vis = caseVisibilityFilter(user);
  const where: string[] = [vis.sql];
  const params: (string | number)[] = [...vis.params];
  if (f.q) {
    where.push("(c.reference LIKE ? OR c.title LIKE ? OR c.incident_location LIKE ? OR c.incident_type LIKE ?)");
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    params.push(like, like, like, like);
  }
  if (f.status === "open") {
    const wf = getWorkflow("case");
    const done = wf.states.filter((s) => s.category === "done").map((s) => s.key);
    if (done.length) {
      where.push(`c.status NOT IN (${done.map(() => "?").join(",")})`);
      params.push(...done);
    }
  } else if (f.status) {
    where.push("c.status = ?");
    params.push(f.status);
  }
  if (f.priority) {
    where.push("c.priority = ?");
    params.push(f.priority);
  }
  if (f.officer === "unassigned") where.push("c.assigned_to IS NULL");
  else if (f.officer === "me") {
    where.push("c.assigned_to = ?");
    params.push(user.id);
  } else if (f.officer) {
    where.push("c.assigned_to = ?");
    params.push(f.officer);
  }
  if (f.station && can(user, "case.view.all")) {
    where.push("c.station_id = ?");
    params.push(f.station);
  }
  if (f.from && !Number.isNaN(Date.parse(f.from))) {
    where.push("c.received_at >= ?");
    params.push(new Date(f.from).toISOString());
  }
  if (f.to && !Number.isNaN(Date.parse(f.to))) {
    where.push("c.received_at < ?");
    params.push(new Date(Date.parse(f.to) + 86400e3).toISOString());
  }
  return { sql: where.join(" AND "), params };
}

export function listCases(user: AuthUser, f: CaseListFilters, opts: { all?: boolean } = {}) {
  const w = buildWhere(user, f);
  const sortCol = SORTS[f.sort ?? ""] ?? SORTS.updated;
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const page = Math.max(1, f.page ?? 1);
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM cases c WHERE ${w.sql}`, ...w.params)!.n;
  const limit = opts.all ? 500 : PAGE_SIZE;
  const offset = opts.all ? 0 : (page - 1) * PAGE_SIZE;
  const rows = all<CaseListRow>(
    `SELECT c.id, c.reference, c.title, c.incident_type, c.incident_location, c.status, c.priority, c.assigned_to,
            u.name AS assignee_name, c.next_action, c.next_action_due, c.received_at, c.updated_at,
            s.code AS station_code, c.official_status, c.is_demo
       FROM cases c LEFT JOIN users u ON u.id = c.assigned_to JOIN stations s ON s.id = c.station_id
      WHERE ${w.sql}
      ORDER BY ${sortCol} ${dir}, c.reference DESC
      LIMIT ? OFFSET ?`,
    ...w.params,
    limit,
    offset,
  );
  return { rows, total, page, pageSize: PAGE_SIZE };
}

export interface CaseDetail {
  id: string;
  reference: string;
  station_id: string;
  station_name: string;
  station_code: string;
  title: string;
  incident_type: string;
  incident_date: string | null;
  incident_location: string | null;
  summary: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  assignee_name: string | null;
  next_action: string | null;
  next_action_due: string | null;
  official_status: string;
  official_reference: string | null;
  official_confirmed_at: string | null;
  official_system: string | null;
  received_at: string;
  closed_at: string | null;
  is_demo: number;
  created_by: string;
  creator_name: string;
  created_at: string;
  updated_at: string;
}

export function getCase(user: AuthUser, id: string): CaseDetail {
  assertCaseAccess(user, id);
  const c = get<CaseDetail>(
    `SELECT c.*, s.name AS station_name, s.code AS station_code, u.name AS assignee_name, cr.name AS creator_name
       FROM cases c JOIN stations s ON s.id = c.station_id
       LEFT JOIN users u ON u.id = c.assigned_to
       JOIN users cr ON cr.id = c.created_by
      WHERE c.id = ?`,
    id,
  );
  if (!c) throw new NotFoundError();
  return c;
}

/** Log a case view, at most once per user per case per 10 minutes. */
export function logCaseView(user: AuthUser, caseId: string, ip: string | null) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const recent = get(
    "SELECT 1 FROM record_access_events WHERE user_id = ? AND entity_type = 'case' AND entity_id = ? AND action = 'view' AND created_at > ?",
    user.id,
    caseId,
    since,
  );
  if (!recent) recordAccess({ userId: user.id, entityType: "case", entityId: caseId, caseId, action: "view", ip });
}

/** Log a PII view of case parties, at most once per user per case per 10 minutes. */
export function logPartyPiiView(user: AuthUser, caseId: string, ip: string | null) {
  if (!can(user, "party.view_pii")) return;
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const recent = get(
    "SELECT 1 FROM record_access_events WHERE user_id = ? AND entity_type = 'case_parties' AND entity_id = ? AND created_at > ?",
    user.id,
    caseId,
    since,
  );
  if (!recent) recordAccess({ userId: user.id, entityType: "case_parties", entityId: caseId, caseId, action: "view", ip });
}

function touch(caseId: string) {
  run("UPDATE cases SET updated_at = ? WHERE id = ?", now(), caseId);
}

/* ---------------- Users eligible for actions ---------------- */

export interface StaffOption {
  id: string;
  name: string;
  role_name: string;
  badge_number: string | null;
}

function usersMatching(stationId: string, predicate: (perms: Permission[]) => boolean): StaffOption[] {
  const rows = all<StaffOption & { permissions: string }>(
    `SELECT u.id, u.name, u.badge_number, r.name AS role_name, r.permissions
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.status = 'active' AND u.station_id = ? ORDER BY u.name`,
    stationId,
  );
  return rows
    .filter((r) => predicate(parseJson<string[]>(r.permissions, []).filter(isPermission)))
    .map(({ id, name, role_name, badge_number }) => ({ id, name, role_name, badge_number }));
}

/** Staff who can work cases: case visibility plus edit or status rights (excludes read-only reviewers). */
export function assignableStaff(stationId: string) {
  return usersMatching(
    stationId,
    (p) =>
      (p.includes("case.view.assigned") || p.includes("case.view.station") || p.includes("case.view.all")) &&
      (p.includes("case.edit") || p.includes("case.status")),
  );
}

export function reviewerStaff(stationId: string) {
  return usersMatching(stationId, (p) => p.includes("draft.review"));
}

/* ---------------- Mutations ---------------- */

export function changeCaseStatus(user: AuthUser, caseId: string, to: string, reason: string | null, ip: string | null) {
  assertCaseAction(user, caseId, "case.status");
  const wf = getWorkflow("case");
  return tx(() => {
    const c = get<{ status: string; reference: string; assigned_to: string | null }>(
      "SELECT status, reference, assigned_to FROM cases WHERE id = ?",
      caseId,
    )!;
    assertTransition(wf, c.status, to);
    const t = now();
    const closing = stateOf(wf, to).category === "done";
    update("cases", caseId, { status: to, updated_at: t, closed_at: closing ? t : null });
    insert("case_status_history", { id: newId(), case_id: caseId, from_status: c.status, to_status: to, reason, changed_by: user.id, created_at: t });
    audit({
      actorId: user.id,
      action: "case.status_changed",
      entityType: "case",
      entityId: caseId,
      caseId,
      summary: `Status changed from "${stateLabel(wf, c.status)}" to "${stateLabel(wf, to)}"${reason ? " (reason given)" : ""}`,
      metadata: { from: c.status, to },
      ip,
    });
    notify({
      userId: c.assigned_to,
      actorId: user.id,
      kind: "status_change",
      title: `${c.reference} moved to ${stateLabel(wf, to)}`,
      link: `/cases/${caseId}`,
      entityType: "case",
      entityId: caseId,
    });
    return { from: c.status, to, reference: c.reference };
  });
}

export function assignCase(user: AuthUser, caseId: string, assigneeId: string | null, ip: string | null) {
  assertCaseAction(user, caseId, "case.assign");
  return tx(() => {
    const c = get<{ reference: string; assigned_to: string | null; station_id: string }>(
      "SELECT reference, assigned_to, station_id FROM cases WHERE id = ?",
      caseId,
    )!;
    if (c.assigned_to === assigneeId) throw new ValidationError("The case is already assigned to this person.");
    let assigneeName = "nobody";
    if (assigneeId) {
      const eligible = assignableStaff(c.station_id).find((s) => s.id === assigneeId);
      if (!eligible) throw new ValidationError("That user cannot be assigned cases in this station.", { assigneeId: "Choose an eligible officer" });
      assigneeName = eligible.name;
    }
    const t = now();
    run("UPDATE case_assignments SET ended_at = ? WHERE case_id = ? AND assignment_role = 'lead' AND ended_at IS NULL", t, caseId);
    if (assigneeId) {
      insert("case_assignments", { id: newId(), case_id: caseId, user_id: assigneeId, assignment_role: "lead", assigned_by: user.id, assigned_at: t });
    }
    update("cases", caseId, { assigned_to: assigneeId, updated_at: t });
    audit({
      actorId: user.id,
      action: "case.assigned",
      entityType: "case",
      entityId: caseId,
      caseId,
      summary: assigneeId ? `Assigned to ${assigneeName}` : "Assignment removed",
      metadata: { from: c.assigned_to, to: assigneeId },
      ip,
    });
    notify({
      userId: assigneeId,
      actorId: user.id,
      kind: "assignment",
      title: `You were assigned case ${c.reference}`,
      link: `/cases/${caseId}`,
      entityType: "case",
      entityId: caseId,
    });
    return { reference: c.reference, assigneeName };
  });
}

export function updateCaseDetails(
  user: AuthUser,
  caseId: string,
  data: {
    title: string;
    incident_type: string;
    incident_date: string | null;
    incident_location: string | null;
    summary: string;
    priority: string;
    next_action: string | null;
    next_action_due: string | null;
  },
  ip: string | null,
) {
  assertCaseAction(user, caseId, "case.edit");
  const before = get<Record<string, unknown>>(
    "SELECT title, incident_type, incident_date, incident_location, summary, priority, next_action, next_action_due FROM cases WHERE id = ?",
    caseId,
  )!;
  const changed = Object.keys(data).filter((k) => (before[k] ?? null) !== (data[k as keyof typeof data] ?? null));
  if (changed.length === 0) return { changed };
  update("cases", caseId, { ...data, updated_at: now() });
  audit({
    actorId: user.id,
    action: "case.updated",
    entityType: "case",
    entityId: caseId,
    caseId,
    summary: `Updated ${changed.map((k) => k.replace(/_/g, " ")).join(", ")}`,
    metadata: {
      fields: changed,
      ...(changed.includes("priority") ? { priorityFrom: before.priority, priorityTo: data.priority } : {}),
    },
    ip,
  });
  return { changed };
}

export function setOfficialStatus(
  user: AuthUser,
  caseId: string,
  data: { status: "local" | "submitted" | "filed"; system: string | null; reference: string | null; confirmation: boolean },
  ip: string | null,
) {
  assertCaseAction(user, caseId, "case.official_status");
  if (data.status !== "local") {
    if (!data.system) throw new ValidationError("Name the external system.", { system: "External system is required" });
    if (!data.confirmation) {
      throw new ValidationError("You must confirm this reflects a verified response from an authorized system.", {
        confirmation: "Confirmation is required",
      });
    }
  }
  if (data.status === "filed" && !data.reference) {
    throw new ValidationError("An official reference is required to record a confirmed filing.", { reference: "Official reference is required" });
  }
  const t = now();
  update("cases", caseId, {
    official_status: data.status,
    official_system: data.status === "local" ? null : data.system,
    official_reference: data.status === "local" ? null : data.reference,
    official_confirmed_at: data.status === "filed" ? t : null,
    updated_at: t,
  });
  audit({
    actorId: user.id,
    action: "case.official_status_recorded",
    entityType: "case",
    entityId: caseId,
    caseId,
    summary:
      data.status === "local"
        ? "Official status reset to local record only"
        : `Official status recorded as "${data.status}" from ${data.system} (manually entered from external confirmation)`,
    metadata: { status: data.status, system: data.system, officialReference: data.reference, method: "manual_entry" },
    ip,
  });
}

export function addCaseNote(user: AuthUser, caseId: string, body: string, ip: string | null) {
  assertCaseAction(user, caseId, "case.edit");
  const id = newId();
  insert("case_notes", { id, case_id: caseId, author_id: user.id, body, created_at: now() });
  touch(caseId);
  audit({ actorId: user.id, action: "case.note_added", entityType: "case_note", entityId: id, caseId, summary: "Internal note added", ip });
}

export interface PartyInput {
  party_role: "complainant" | "witness" | "involved" | "other";
  name: string;
  age: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export function addParty(user: AuthUser, caseId: string, p: PartyInput, ip: string | null) {
  assertCaseAction(user, caseId, "case.edit");
  if ((p.phone || p.address) && !can(user, "party.view_pii")) {
    throw new ValidationError("You do not have permission to record contact details.");
  }
  const id = newId();
  const t = now();
  insert("case_parties", { id, case_id: caseId, ...p, created_by: user.id, created_at: t, updated_at: t });
  touch(caseId);
  audit({ actorId: user.id, action: "case.party_added", entityType: "case_party", entityId: id, caseId, summary: `${PARTY_ROLE_LABELS[p.party_role]} record added`, ip });
}

export function updateParty(user: AuthUser, caseId: string, partyId: string, p: PartyInput, ip: string | null) {
  assertCaseAction(user, caseId, "case.edit");
  const existing = get<{ case_id: string; phone: string | null; address: string | null }>(
    "SELECT case_id, phone, address FROM case_parties WHERE id = ?",
    partyId,
  );
  if (!existing || existing.case_id !== caseId) throw new NotFoundError();
  const values: Record<string, string | null> = { party_role: p.party_role, name: p.name, age: p.age, gender: p.gender, notes: p.notes };
  // Users without PII access cannot see contact details and therefore must not overwrite them.
  if (can(user, "party.view_pii")) {
    values.phone = p.phone;
    values.address = p.address;
  }
  update("case_parties", partyId, { ...values, updated_at: now() });
  touch(caseId);
  audit({ actorId: user.id, action: "case.party_updated", entityType: "case_party", entityId: partyId, caseId, summary: `${PARTY_ROLE_LABELS[p.party_role]} record updated`, ip });
}

export function listParties(user: AuthUser, caseId: string) {
  assertCaseAccess(user, caseId);
  return all<{
    id: string;
    party_role: string;
    name: string;
    age: string | null;
    gender: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    statement_id: string | null;
  }>(
    "SELECT id, party_role, name, age, gender, phone, address, notes, statement_id FROM case_parties WHERE case_id = ? ORDER BY CASE party_role WHEN 'complainant' THEN 0 WHEN 'witness' THEN 1 ELSE 2 END, created_at",
    caseId,
  );
}

export function linkCases(
  user: AuthUser,
  caseId: string,
  target: { linkedCaseId?: string; reference?: string },
  linkType: "related" | "possible_duplicate",
  note: string | null,
  ip: string | null,
) {
  assertCaseAction(user, caseId, "case.link");
  let linkedId = target.linkedCaseId;
  if (!linkedId && target.reference) {
    linkedId = get<{ id: string }>("SELECT id FROM cases WHERE reference = ? COLLATE NOCASE", target.reference.trim())?.id;
  }
  if (!linkedId) throw new ValidationError("No case found with that reference.", { reference: "Case not found" });
  // The user must be able to see the target too (prevents probing by reference).
  try {
    assertCaseAccess(user, linkedId);
  } catch {
    throw new ValidationError("No case found with that reference.", { reference: "Case not found" });
  }
  if (linkedId === caseId) throw new ValidationError("A case cannot be linked to itself.", { reference: "Choose a different case" });
  const exists = get(
    "SELECT 1 FROM case_links WHERE (case_id = ? AND linked_case_id = ?) OR (case_id = ? AND linked_case_id = ?)",
    caseId,
    linkedId,
    linkedId,
    caseId,
  );
  if (exists) throw new ValidationError("These cases are already linked.");
  const id = newId();
  insert("case_links", { id, case_id: caseId, linked_case_id: linkedId, link_type: linkType, note, created_by: user.id, created_at: now() });
  touch(caseId);
  const ref = get<{ reference: string }>("SELECT reference FROM cases WHERE id = ?", linkedId)!.reference;
  audit({
    actorId: user.id,
    action: "case.linked",
    entityType: "case_link",
    entityId: id,
    caseId,
    summary: `Linked to ${ref} as ${linkType === "possible_duplicate" ? "possible duplicate (not merged)" : "related case"}`,
    metadata: { linkedCaseId: linkedId, linkType },
    ip,
  });
}

export function unlinkCase(user: AuthUser, caseId: string, linkId: string, ip: string | null) {
  assertCaseAction(user, caseId, "case.link");
  const l = get<{ case_id: string; linked_case_id: string }>("SELECT case_id, linked_case_id FROM case_links WHERE id = ?", linkId);
  if (!l || (l.case_id !== caseId && l.linked_case_id !== caseId)) throw new NotFoundError();
  run("DELETE FROM case_links WHERE id = ?", linkId);
  audit({ actorId: user.id, action: "case.unlinked", entityType: "case_link", entityId: linkId, caseId, summary: "Case link removed", metadata: { a: l.case_id, b: l.linked_case_id }, ip });
}

export function dismissDuplicate(user: AuthUser, caseId: string, otherCaseId: string, ip: string | null) {
  assertCaseAction(user, caseId, "case.link");
  audit({
    actorId: user.id,
    action: "case.duplicate_dismissed",
    entityType: "case",
    entityId: caseId,
    caseId,
    summary: "Possible-duplicate suggestion dismissed",
    metadata: { otherCaseId },
    ip,
  });
}

export function dismissedDuplicateIds(caseId: string): Set<string> {
  const rows = all<{ metadata: string }>(
    "SELECT metadata FROM audit_events WHERE action = 'case.duplicate_dismissed' AND case_id = ?",
    caseId,
  );
  return new Set(rows.map((r) => parseJson<{ otherCaseId?: string }>(r.metadata, {}).otherCaseId).filter(Boolean) as string[]);
}

export function listLinks(user: AuthUser, caseId: string) {
  const vis = caseVisibilityFilter(user);
  return all<{ id: string; link_type: string; note: string | null; other_id: string; reference: string; title: string; status: string; created_at: string }>(
    `SELECT l.id, l.link_type, l.note, c.id AS other_id, c.reference, c.title, c.status, l.created_at
       FROM case_links l JOIN cases c ON c.id = CASE WHEN l.case_id = ? THEN l.linked_case_id ELSE l.case_id END
      WHERE (l.case_id = ? OR l.linked_case_id = ?) AND ${vis.sql}
      ORDER BY l.created_at DESC`,
    caseId,
    caseId,
    caseId,
    ...vis.params,
  );
}

export function requestReview(user: AuthUser, caseId: string, reviewerId: string, note: string | null, ip: string | null) {
  assertCaseAction(user, caseId, "case.edit");
  const c = get<{ reference: string; station_id: string }>("SELECT reference, station_id FROM cases WHERE id = ?", caseId)!;
  const reviewer = reviewerStaff(c.station_id).find((r) => r.id === reviewerId);
  if (!reviewer) throw new ValidationError("Choose an officer who can review drafts.", { reviewerId: "Choose an eligible reviewer" });
  if (reviewerId === user.id) throw new ValidationError("You cannot request a review from yourself.", { reviewerId: "Choose someone else" });
  // Ensure the reviewer can open the case: add a support assignment if they lack station scope.
  const reviewerUser = get<{ permissions: string }>("SELECT r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?", reviewerId)!;
  const hasScope = /"case\.view\.(station|all)"/.test(reviewerUser.permissions);
  if (!hasScope) {
    const already = get("SELECT 1 FROM case_assignments WHERE case_id = ? AND user_id = ? AND ended_at IS NULL", caseId, reviewerId);
    if (!already) {
      insert("case_assignments", { id: newId(), case_id: caseId, user_id: reviewerId, assignment_role: "support", assigned_by: user.id, assigned_at: now() });
    }
  }
  if (note) insert("case_notes", { id: newId(), case_id: caseId, author_id: user.id, body: `Review requested from ${reviewer.name}: ${note}`, created_at: now() });
  touch(caseId);
  audit({ actorId: user.id, action: "case.review_requested", entityType: "case", entityId: caseId, caseId, summary: `Review requested from ${reviewer.name}`, metadata: { reviewerId }, ip });
  notify({ userId: reviewerId, actorId: user.id, kind: "review_request", title: `Review requested for ${c.reference}`, link: `/cases/${caseId}?tab=statements`, entityType: "case", entityId: caseId });
  return { reviewerName: reviewer.name };
}

/* ---------------- Bulk ---------------- */

export interface BulkResult {
  done: string[];
  skipped: { reference: string; reason: string }[];
}

export function bulkUpdate(
  user: AuthUser,
  caseIds: string[],
  op: { kind: "status"; value: string } | { kind: "assign"; value: string | null } | { kind: "priority"; value: string },
  ip: string | null,
): BulkResult {
  assertCan(user, "case.bulk");
  const result: BulkResult = { done: [], skipped: [] };
  for (const id of [...new Set(caseIds)].slice(0, 200)) {
    const ref = get<{ reference: string }>("SELECT reference FROM cases WHERE id = ?", id)?.reference ?? "Unknown case";
    try {
      if (op.kind === "status") changeCaseStatus(user, id, op.value, "Bulk update", ip);
      else if (op.kind === "assign") assignCase(user, id, op.value, ip);
      else {
        assertCaseAction(user, id, "case.edit");
        const before = get<{ priority: string }>("SELECT priority FROM cases WHERE id = ?", id)!;
        if (before.priority === op.value) throw new ValidationError(`Already ${PRIORITY_LABELS[op.value]}`);
        update("cases", id, { priority: op.value, updated_at: now() });
        audit({ actorId: user.id, action: "case.updated", entityType: "case", entityId: id, caseId: id, summary: `Priority changed to ${PRIORITY_LABELS[op.value]} (bulk)`, metadata: { fields: ["priority"], priorityFrom: before.priority, priorityTo: op.value }, ip });
      }
      result.done.push(ref);
    } catch (e) {
      result.skipped.push({ reference: ref, reason: e instanceof Error ? e.message : "Failed" });
    }
  }
  audit({
    actorId: user.id,
    action: "case.bulk_action",
    entityType: "case",
    summary: `Bulk ${op.kind} applied to ${result.done.length} case(s); ${result.skipped.length} skipped`,
    metadata: { op: op.kind, value: op.value, done: result.done.length, skipped: result.skipped.length },
    ip,
  });
  return result;
}

/* ---------------- Timeline / access ---------------- */

export interface TimelineEntry {
  at: string;
  actor: string | null;
  kind: "audit" | "note";
  action: string;
  summary: string;
  body?: string;
}

export function caseTimeline(user: AuthUser, caseId: string): TimelineEntry[] {
  assertCaseAccess(user, caseId);
  const events = all<{ created_at: string; actor: string | null; action: string; summary: string }>(
    `SELECT a.created_at, u.name AS actor, a.action, a.summary FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.case_id = ? ORDER BY a.seq DESC LIMIT 500`,
    caseId,
  );
  const notes = all<{ created_at: string; actor: string; body: string }>(
    "SELECT n.created_at, u.name AS actor, n.body FROM case_notes n JOIN users u ON u.id = n.author_id WHERE n.case_id = ?",
    caseId,
  );
  const entries: TimelineEntry[] = [
    ...events.filter((e) => e.action !== "case.note_added").map((e) => ({ at: e.created_at, actor: e.actor, kind: "audit" as const, action: e.action, summary: e.summary })),
    ...notes.map((n) => ({ at: n.created_at, actor: n.actor, kind: "note" as const, action: "case.note_added", summary: "Added an internal note", body: n.body })),
  ];
  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function statusHistory(user: AuthUser, caseId: string) {
  assertCaseAccess(user, caseId);
  return all<{ from_status: string | null; to_status: string; reason: string | null; actor: string; created_at: string }>(
    `SELECT h.from_status, h.to_status, h.reason, u.name AS actor, h.created_at FROM case_status_history h
       JOIN users u ON u.id = h.changed_by WHERE h.case_id = ? ORDER BY h.created_at DESC`,
    caseId,
  );
}

export function caseNotes(user: AuthUser, caseId: string) {
  assertCaseAccess(user, caseId);
  return all<{ id: string; body: string; author: string; created_at: string }>(
    "SELECT n.id, n.body, u.name AS author, n.created_at FROM case_notes n JOIN users u ON u.id = n.author_id WHERE n.case_id = ? ORDER BY n.created_at DESC",
    caseId,
  );
}

/** Staff who can currently see the case, and why. */
export function caseAccessList(user: AuthUser, caseId: string) {
  const c = getCase(user, caseId);
  const users = all<{ id: string; name: string; role_name: string; permissions: string; station_id: string | null; status: string }>(
    "SELECT u.id, u.name, r.name AS role_name, r.permissions, u.station_id, u.status FROM users u JOIN roles r ON r.id = u.role_id WHERE u.status = 'active' ORDER BY u.name",
  );
  const assigned = new Map(
    all<{ user_id: string; assignment_role: string }>(
      "SELECT user_id, assignment_role FROM case_assignments WHERE case_id = ? AND ended_at IS NULL",
      caseId,
    ).map((a) => [a.user_id, a.assignment_role]),
  );
  const out: { id: string; name: string; role_name: string; reason: string; canViewStatements: boolean }[] = [];
  for (const u of users) {
    const perms = parseJson<string[]>(u.permissions, []);
    let reason: string | null = null;
    if (perms.includes("case.view.all")) reason = "All-stations access";
    else if (perms.includes("case.view.station") && u.station_id === c.station_id) reason = "Station-wide access";
    else if (perms.includes("case.view.assigned")) {
      if (c.assigned_to === u.id) reason = "Lead assignee";
      else if (assigned.has(u.id)) reason = `${assigned.get(u.id) === "support" ? "Support" : "Lead"} assignment`;
      else if (c.created_by === u.id) reason = "Created the case";
    }
    if (reason) out.push({ id: u.id, name: u.name, role_name: u.role_name, reason, canViewStatements: perms.includes("statement.view") });
  }
  return out;
}

export function recentAccessEvents(user: AuthUser, caseId: string) {
  assertCaseAccess(user, caseId);
  assertCan(user, "audit.view");
  return all<{ id: string; actor: string; entity_type: string; action: string; created_at: string }>(
    `SELECT e.id, u.name AS actor, e.entity_type, e.action, e.created_at FROM record_access_events e
       JOIN users u ON u.id = e.user_id WHERE e.case_id = ? ORDER BY e.created_at DESC LIMIT 100`,
    caseId,
  );
}

export function caseTasks(user: AuthUser, caseId: string) {
  assertCaseAccess(user, caseId);
  return all<{ id: string; title: string; status: string; priority: string; due_at: string | null; completed_at: string | null; assignee_name: string | null }>(
    `SELECT t.id, t.title, t.status, t.priority, t.due_at, t.completed_at, u.name AS assignee_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.case_id = ?
      ORDER BY t.completed_at IS NOT NULL, t.due_at IS NULL, t.due_at`,
    caseId,
  );
}

export function caseStatements(user: AuthUser, caseId: string) {
  assertCaseAccess(user, caseId);
  assertCan(user, "statement.view");
  const statements = all<{
    id: string;
    status: string;
    capture_method: string | null;
    language: string;
    speaker_role: string;
    intake_at: string;
    transcript_confirmed_at: string | null;
    creator: string;
    transcript_versions: number;
    recordings: number;
  }>(
    `SELECT s.id, s.status, s.capture_method, s.language, s.speaker_role, s.intake_at, s.transcript_confirmed_at, u.name AS creator,
            (SELECT COUNT(*) FROM transcript_versions tv WHERE tv.statement_id = s.id) AS transcript_versions,
            (SELECT COUNT(*) FROM recordings r WHERE r.statement_id = s.id AND r.status = 'stored') AS recordings
       FROM statements s JOIN users u ON u.id = s.created_by WHERE s.case_id = ? ORDER BY s.intake_at`,
    caseId,
  );
  const drafts = all<{
    id: string;
    statement_id: string;
    status: string;
    current_version: number;
    reviewed_at: string | null;
    reviewer: string | null;
    template_name: string;
    updated_at: string;
  }>(
    `SELECT d.id, d.statement_id, d.status, d.current_version, d.reviewed_at, u.name AS reviewer, t.name AS template_name, d.updated_at
       FROM drafts d JOIN templates t ON t.id = d.template_id LEFT JOIN users u ON u.id = d.reviewed_by
      WHERE d.case_id = ? OR d.statement_id IN (SELECT id FROM statements WHERE case_id = ?)
      ORDER BY d.created_at`,
    caseId,
    caseId,
  );
  return { statements, drafts };
}

/** Counts used by the case tabs. */
export function caseCounts(caseId: string) {
  return get<{ statements: number; tasks: number; attachments: number; open_tasks: number }>(
    `SELECT (SELECT COUNT(*) FROM statements WHERE case_id = ?) AS statements,
            (SELECT COUNT(*) FROM tasks WHERE case_id = ?) AS tasks,
            (SELECT COUNT(*) FROM tasks WHERE case_id = ? AND completed_at IS NULL) AS open_tasks,
            (SELECT COUNT(*) FROM attachments WHERE case_id = ? AND deleted_at IS NULL) AS attachments`,
    caseId,
    caseId,
    caseId,
    caseId,
  )!;
}

export function officerFilterOptions(user: AuthUser) {
  const vis = caseVisibilityFilter(user);
  return all<{ id: string; name: string }>(
    `SELECT DISTINCT u.id, u.name FROM cases c JOIN users u ON u.id = c.assigned_to WHERE ${vis.sql} ORDER BY u.name`,
    ...vis.params,
  );
}
