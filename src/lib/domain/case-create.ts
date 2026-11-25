/**
 * Step H: create a case from a completed intake. The case is a LOCAL record only;
 * official_status is always 'local' here — FirstRecord never files with an
 * official system on its own.
 */
import { all, get, insert, newId, now, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, canViewCase, type AuthUser } from "@/lib/rbac/access";
import { ConflictError, ValidationError } from "@/lib/errors";
import { getWorkflow, nextCaseReference } from "@/lib/domain/workflow";
import { notify } from "@/lib/domain/notifications";
import { loadStatement } from "./statements";

export interface CreateCaseInput {
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  assignedTo: string | null;
  incidentType: string;
  summary?: string;
  linkDuplicateIds?: string[];
}

/** Pick the starting workflow stage that matches how far the intake progressed. */
export function initialCaseStatus(statementId: string): string {
  const wf = getWorkflow("case");
  const keys = new Set(wf.states.map((s) => s.key));
  const draft = get<{ status: string }>("SELECT status FROM drafts WHERE statement_id = ? ORDER BY created_at DESC LIMIT 1", statementId);
  const preferred = draft?.status === "reviewed" ? "officer_review" : draft ? "draft_prepared" : "statement_review";
  return keys.has(preferred) ? preferred : wf.states[0].key;
}

/** Users in the station who can be assigned a case (officers / admins with case access). */
export function assignableUsers(stationId: string) {
  return all<{ id: string; name: string; role_name: string }>(
    `SELECT u.id, u.name, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.station_id = ? AND u.status = 'active'
        AND (r.permissions LIKE '%"case.view.assigned"%' OR r.permissions LIKE '%"case.view.station"%')
        AND r.permissions LIKE '%"case.edit"%'
      ORDER BY u.name`,
    stationId,
  );
}

export function createCaseFromStatement(user: AuthUser, statementId: string, input: CreateCaseInput): { caseId: string; reference: string } {
  assertCan(user, "case.create");
  const s = loadStatement(user, statementId);
  if (s.status !== "in_progress") throw new ConflictError(s.case_id ? "A case has already been created from this report." : "This report is not in progress.");
  if (s.case_id) throw new ConflictError("A case has already been created from this report.");
  const hasTranscript = get("SELECT 1 FROM transcript_versions WHERE statement_id = ? LIMIT 1", statementId);
  if (!hasTranscript) throw new ConflictError("Record or enter the statement before creating a case.");

  const title = input.title.trim();
  if (title.length < 3) throw new ValidationError("Enter a case title.", { title: "Enter a short, neutral title (at least 3 characters)" });
  if (input.assignedTo) {
    if (!assignableUsers(s.station_id).some((u) => u.id === input.assignedTo)) {
      throw new ValidationError("The selected officer cannot be assigned cases in this station.", { assignedTo: "Choose an officer from this station" });
    }
    if (input.assignedTo !== user.id) assertCan(user, "case.assign", "Your role cannot assign cases to other staff. Leave unassigned or assign to yourself.");
  }
  const dupIds = (input.linkDuplicateIds ?? []).filter((id) => canViewCase(user, id));

  const result = tx(() => {
    const reference = nextCaseReference(s.station_id);
    const caseId = newId();
    const t = now();
    const status = initialCaseStatus(statementId);
    const wf = getWorkflow("case");
    if (!wf.states.some((st) => st.key === status)) throw new ConflictError("Case workflow is misconfigured.");
    insert("cases", {
      id: caseId,
      reference,
      station_id: s.station_id,
      title,
      incident_type: input.incidentType,
      incident_date: s.incident_date,
      incident_location: s.incident_location,
      summary: (input.summary ?? "").trim().slice(0, 4000),
      status,
      priority: input.priority,
      assigned_to: input.assignedTo,
      next_action: status === "officer_review" ? "Begin follow-up" : status === "draft_prepared" ? "Officer review of FIR draft" : "Prepare FIR draft",
      official_status: "local",
      received_at: s.intake_at,
      created_by: user.id,
      created_at: t,
      updated_at: t,
    });
    insert("case_status_history", { id: newId(), case_id: caseId, from_status: null, to_status: status, reason: "Case created from report intake", changed_by: user.id, created_at: t });
    if (input.assignedTo) {
      insert("case_assignments", { id: newId(), case_id: caseId, user_id: input.assignedTo, assignment_role: "lead", assigned_by: user.id, assigned_at: t });
    }
    if (s.speaker_name) {
      insert("case_parties", {
        id: newId(),
        case_id: caseId,
        party_role: ["complainant", "witness", "involved", "other"].includes(s.speaker_role) ? s.speaker_role : "complainant",
        name: s.speaker_name,
        phone: s.speaker_contact,
        address: s.speaker_address,
        statement_id: statementId,
        created_by: user.id,
        created_at: t,
        updated_at: t,
      });
    }
    update("statements", statementId, { case_id: caseId, status: "completed", current_step: "complete", updated_at: t });
    const drafts = all<{ id: string }>("SELECT id FROM drafts WHERE statement_id = ?", statementId);
    for (const d of drafts) update("drafts", d.id, { case_id: caseId });
    const atts = all<{ id: string }>("SELECT id FROM attachments WHERE statement_id = ? AND case_id IS NULL", statementId);
    for (const a of atts) update("attachments", a.id, { case_id: caseId });
    for (const dup of dupIds) {
      insert("case_links", { id: newId(), case_id: caseId, linked_case_id: dup, link_type: "possible_duplicate", note: "Flagged at case creation for human review (not merged)", created_by: user.id, created_at: t });
    }
    audit({
      actorId: user.id,
      action: "case.created",
      entityType: "case",
      entityId: caseId,
      caseId,
      summary: `Case ${reference} created from report intake (local record only)`,
      metadata: { reference, status, statementId, drafts: drafts.length, duplicateLinks: dupIds.length },
    });
    audit({ actorId: user.id, action: "statement.completed", entityType: "statement", entityId: statementId, caseId, summary: `Report intake completed and linked to ${reference}` });
    return { caseId, reference };
  });

  if (input.assignedTo) {
    notify({ userId: input.assignedTo, kind: "assignment", title: `You were assigned case ${result.reference}`, link: `/cases/${result.caseId}`, entityType: "case", entityId: result.caseId, actorId: user.id });
  }
  return result;
}
