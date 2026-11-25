/**
 * Statement intake domain: intake details, capture method, consent events,
 * recordings metadata, and immutable transcript versions.
 * All functions take the acting AuthUser and enforce authorization themselves.
 */
import { all, get, insert, newId, now, parseJson, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, assertStatementAccess, can, type AuthUser } from "@/lib/rbac/access";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getSetting, LANGUAGES } from "@/lib/domain/workflow";
import { parseSegments, type TranscriptSegment } from "@/components/intake/timestamps";

export const STEPS = ["intake", "method", "consent", "capture", "transcript", "draft", "review", "case", "complete"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABELS: Record<Step, string> = {
  intake: "Intake",
  method: "Capture method",
  consent: "Consent",
  capture: "Statement",
  transcript: "Transcript",
  draft: "FIR draft",
  review: "Review",
  case: "Create case",
  complete: "Complete",
};

export type CaptureMethod = "typed" | "audio" | "video" | "assisted" | "accessible";
export type TranscriptSource = "typed_original" | "manual_transcription" | "automatic_transcription" | "assisted_entry" | "correction";

export interface StatementRow {
  id: string;
  station_id: string;
  case_id: string | null;
  created_by: string;
  status: "in_progress" | "completed" | "abandoned";
  current_step: Step;
  intake_at: string;
  incident_type: string | null;
  incident_date: string | null;
  incident_location: string | null;
  language: string;
  capture_method: CaptureMethod | null;
  accessibility_notes: string | null;
  interpreter_name: string | null;
  speaker_name: string | null;
  speaker_contact: string | null;
  speaker_address: string | null;
  speaker_role: string;
  transcript_confirmed_at: string | null;
  transcript_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsentRow {
  id: string;
  statement_id: string;
  scope: "audio" | "video";
  decision: "granted" | "declined" | "withdrawn";
  notice_version: string;
  notice_language: string;
  notice_text: string;
  recorded_by: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface RecordingRow {
  id: string;
  statement_id: string;
  consent_event_id: string;
  kind: "audio" | "video";
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  storage_key: string | null;
  sha256: string;
  status: "stored" | "deleted";
  created_by: string;
  created_by_name?: string;
  created_at: string;
  deleted_at: string | null;
  deletion_reason: string | null;
}

export interface TranscriptRow {
  id: string;
  statement_id: string;
  version: number;
  source: TranscriptSource;
  text: string;
  segments: TranscriptSegment[];
  language: string;
  note: string | null;
  uncertainty_note: string | null;
  recording_id: string | null;
  created_by: string;
  created_by_name?: string;
  created_at: string;
}

export const TRANSCRIPT_SOURCE_LABELS: Record<TranscriptSource, string> = {
  typed_original: "Original typed statement",
  manual_transcription: "Manual transcription of recording",
  automatic_transcription: "Automatic transcription",
  assisted_entry: "Staff-assisted entry",
  correction: "Correction",
};

/* ---------------- Reads ---------------- */

export function getStatementRow(id: string): StatementRow | undefined {
  return get<StatementRow>("SELECT * FROM statements WHERE id = ?", id);
}

/** Load a statement the user may view (throws NotFound otherwise). */
export function loadStatement(user: AuthUser, id: string): StatementRow {
  assertStatementAccess(user, id);
  const s = getStatementRow(id);
  if (!s) throw new NotFoundError();
  return s;
}

export function listConsents(statementId: string): ConsentRow[] {
  return all<ConsentRow>(
    `SELECT c.*, u.name AS recorded_by_name FROM consent_events c JOIN users u ON u.id = c.recorded_by
      WHERE c.statement_id = ? ORDER BY c.created_at, c.rowid`,
    statementId,
  );
}

/** Current consent state for a scope: the latest event decides. */
export function currentConsent(statementId: string, scope: "audio" | "video"): ConsentRow | undefined {
  return get<ConsentRow>(
    "SELECT * FROM consent_events WHERE statement_id = ? AND scope = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    statementId,
    scope,
  );
}

export function listRecordings(statementId: string): RecordingRow[] {
  return all<RecordingRow>(
    `SELECT r.*, u.name AS created_by_name FROM recordings r JOIN users u ON u.id = r.created_by
      WHERE r.statement_id = ? ORDER BY r.created_at`,
    statementId,
  );
}

function mapTranscript(r: Record<string, unknown>): TranscriptRow {
  return { ...(r as unknown as TranscriptRow), segments: parseJson<TranscriptSegment[]>(r.segments, []) };
}

export function listTranscripts(statementId: string): TranscriptRow[] {
  return all<Record<string, unknown>>(
    `SELECT t.*, u.name AS created_by_name FROM transcript_versions t JOIN users u ON u.id = t.created_by
      WHERE t.statement_id = ? ORDER BY t.version`,
    statementId,
  ).map(mapTranscript);
}

export function latestTranscript(statementId: string): TranscriptRow | undefined {
  const r = get<Record<string, unknown>>(
    "SELECT * FROM transcript_versions WHERE statement_id = ? ORDER BY version DESC LIMIT 1",
    statementId,
  );
  return r ? mapTranscript(r) : undefined;
}

/** In-progress intakes visible to the user. */
export function listIntakes(user: AuthUser, opts: { status?: "in_progress" | "completed" | "abandoned"; mineOnly?: boolean } = {}) {
  if (!can(user, "statement.view") && !can(user, "statement.create")) return [];
  const where: string[] = ["s.status = ?"];
  const params: string[] = [opts.status ?? "in_progress"];
  if (opts.mineOnly || !(can(user, "case.view.station") || can(user, "case.view.all")) || !can(user, "statement.view")) {
    where.push("s.created_by = ?");
    params.push(user.id);
  } else if (!can(user, "case.view.all")) {
    where.push("s.station_id = ?");
    params.push(user.stationId ?? "");
  }
  return all<StatementRow & { creator_name: string; station_code: string; case_reference: string | null }>(
    `SELECT s.*, u.name AS creator_name, st.code AS station_code, c.reference AS case_reference
       FROM statements s JOIN users u ON u.id = s.created_by JOIN stations st ON st.id = s.station_id
       LEFT JOIN cases c ON c.id = s.case_id
      WHERE ${where.join(" AND ")} ORDER BY s.updated_at DESC LIMIT 100`,
    ...params,
  );
}

/* ---------------- Guards ---------------- */

function assertEditable(user: AuthUser, s: StatementRow) {
  assertCan(user, "statement.edit");
  if (s.status === "abandoned") throw new ConflictError("This report was abandoned and can no longer be changed.");
}

function assertInProgress(s: StatementRow) {
  if (s.status !== "in_progress") throw new ConflictError("This report has already been completed; intake details are locked.");
}

function touch(id: string, step?: Step) {
  const s = getStatementRow(id);
  const values: Record<string, string> = { updated_at: now() };
  if (step && s && STEPS.indexOf(step) > STEPS.indexOf(s.current_step)) values.current_step = step;
  update("statements", id, values);
}

/* ---------------- Mutations ---------------- */

export interface IntakeInput {
  intakeAt: string;
  incidentType: string | null;
  incidentDate: string | null;
  incidentLocation: string | null;
  language: string;
  speakerName: string | null;
  speakerContact: string | null;
  speakerAddress: string | null;
  speakerRole: string;
}

function validateIntake(input: IntakeInput) {
  if (!(input.language in LANGUAGES)) throw new ValidationError("Choose a supported language.", { language: "Unsupported language" });
  if (getSetting("intake.require_contact") && !input.speakerContact) {
    throw new ValidationError("Contact details are required by station settings.", { speakerContact: "Contact details are required" });
  }
  if (Date.parse(input.intakeAt) > Date.now() + 5 * 60_000) throw new ValidationError("Intake time cannot be in the future.", { intakeAt: "Cannot be in the future" });
}

export function createStatement(user: AuthUser, input: IntakeInput): string {
  assertCan(user, "statement.create");
  if (!user.stationId) throw new ForbiddenError("Your account is not assigned to a station, so you cannot start a report.");
  validateIntake(input);
  const id = newId();
  const t = now();
  insert("statements", {
    id,
    station_id: user.stationId,
    created_by: user.id,
    status: "in_progress",
    current_step: "method",
    intake_at: new Date(input.intakeAt).toISOString(),
    incident_type: input.incidentType,
    incident_date: input.incidentDate,
    incident_location: input.incidentLocation,
    language: input.language,
    speaker_name: input.speakerName,
    speaker_contact: input.speakerContact,
    speaker_address: input.speakerAddress,
    speaker_role: input.speakerRole,
    created_at: t,
    updated_at: t,
  });
  audit({ actorId: user.id, action: "statement.created", entityType: "statement", entityId: id, summary: "Report intake started" });
  return id;
}

export function updateIntake(user: AuthUser, id: string, input: IntakeInput) {
  const s = loadStatement(user, id);
  assertEditable(user, s);
  assertInProgress(s);
  validateIntake(input);
  update("statements", id, {
    intake_at: new Date(input.intakeAt).toISOString(),
    incident_type: input.incidentType,
    incident_date: input.incidentDate,
    incident_location: input.incidentLocation,
    language: input.language,
    speaker_name: input.speakerName,
    speaker_contact: input.speakerContact,
    speaker_address: input.speakerAddress,
    speaker_role: input.speakerRole,
  });
  touch(id, "method");
  audit({ actorId: user.id, action: "statement.intake_updated", entityType: "statement", entityId: id, caseId: s.case_id, summary: "Intake details updated" });
}

export function setCaptureMethod(user: AuthUser, id: string, method: CaptureMethod, notes: { accessibilityNotes: string | null; interpreterName: string | null }) {
  const s = loadStatement(user, id);
  assertEditable(user, s);
  assertInProgress(s);
  if ((method === "audio" || method === "video") && !can(user, "recording.create")) {
    throw new ForbiddenError("Your role cannot make recordings. Choose typed or staff-assisted entry.");
  }
  if (method === "accessible" && !notes.accessibilityNotes) {
    throw new ValidationError("Describe the accessibility support being provided.", { accessibilityNotes: "Describe the support provided (e.g. sign-language interpreter, read-aloud)" });
  }
  update("statements", id, { capture_method: method, accessibility_notes: notes.accessibilityNotes, interpreter_name: notes.interpreterName });
  touch(id, method === "audio" || method === "video" ? "consent" : "capture");
  audit({ actorId: user.id, action: "statement.capture_method_set", entityType: "statement", entityId: id, caseId: s.case_id, summary: `Capture method set: ${method}` });
}

/** Record a consent decision with the exact notice shown. Append-only. */
export function recordConsent(user: AuthUser, id: string, scope: "audio" | "video", decision: "granted" | "declined" | "withdrawn", noticeLanguage: string): ConsentRow {
  const s = loadStatement(user, id);
  assertEditable(user, s);
  if (decision === "granted") assertCan(user, "recording.create");
  const lang = noticeLanguage in LANGUAGES ? noticeLanguage : "en";
  const key = `recording.notice.${lang}` as "recording.notice.en" | "recording.notice.hi";
  const noticeText = getSetting(key) || getSetting("recording.notice.en");
  if (decision === "withdrawn") {
    const cur = currentConsent(id, scope);
    if (!cur || cur.decision !== "granted") throw new ConflictError("There is no active consent to withdraw.");
  }
  const row: ConsentRow = {
    id: newId(),
    statement_id: id,
    scope,
    decision,
    notice_version: getSetting("recording.notice_version"),
    notice_language: lang,
    notice_text: noticeText,
    recorded_by: user.id,
    created_at: now(),
  };
  insert("consent_events", row as unknown as Record<string, string>);
  if (decision === "declined" && s.status === "in_progress") {
    // Recording declined: continue with staff-assisted entry unless already typed.
    update("statements", id, { capture_method: "assisted" });
  }
  touch(id, "capture");
  audit({
    actorId: user.id,
    action: `consent.${decision}`,
    entityType: "statement",
    entityId: id,
    caseId: s.case_id,
    summary: `Recording consent (${scope}) ${decision}; notice ${row.notice_version} shown in ${LANGUAGES[lang]?.label ?? lang}`,
    metadata: { consentEventId: row.id, scope, noticeVersion: row.notice_version, noticeLanguage: lang },
  });
  return row;
}

/** Add an immutable transcript version. */
export function addTranscriptVersion(
  user: AuthUser,
  id: string,
  input: { text: string; source: TranscriptSource; note: string | null; uncertaintyNote: string | null; recordingId: string | null },
): number {
  const s = loadStatement(user, id);
  assertEditable(user, s);
  const text = input.text.replace(/\r\n/g, "\n");
  if (!text.trim()) throw new ValidationError("The statement text is empty.", { text: "Enter the statement text" });
  if (text.length > 100_000) throw new ValidationError("The statement is too long (100,000 characters max).", { text: "Too long" });
  if (input.source === "correction" && !input.note) throw new ValidationError("Explain what was corrected and why.", { note: "Describe the correction (e.g. 'Speaker corrected the time to 9 pm')" });
  if (input.recordingId) {
    const rec = get<{ statement_id: string }>("SELECT statement_id FROM recordings WHERE id = ?", input.recordingId);
    if (!rec || rec.statement_id !== id) throw new ValidationError("Recording not found for this statement.");
  }
  return tx(() => {
    const prev = latestTranscript(id);
    if (prev && prev.text === text && input.source === "correction") throw new ConflictError("No changes were made to the transcript.");
    const version = (prev?.version ?? 0) + 1;
    const segments = parseSegments(text, input.recordingId);
    insert("transcript_versions", {
      id: newId(),
      statement_id: id,
      version,
      source: input.source,
      text,
      segments: JSON.stringify(segments),
      language: s.language,
      note: input.note,
      uncertainty_note: input.uncertaintyNote,
      recording_id: input.recordingId,
      created_by: user.id,
      created_at: now(),
    });
    // A new version invalidates a previous confirmation.
    if (s.transcript_confirmed_at) update("statements", id, { transcript_confirmed_at: null, transcript_confirmed_by: null });
    touch(id, "transcript");
    audit({
      actorId: user.id,
      action: "transcript.version_added",
      entityType: "statement",
      entityId: id,
      caseId: s.case_id,
      summary: `Transcript version ${version} added (${TRANSCRIPT_SOURCE_LABELS[input.source]})`,
      metadata: { version, source: input.source, chars: text.length, segments: segments.length },
    });
    return version;
  });
}

export function confirmTranscript(user: AuthUser, id: string) {
  const s = loadStatement(user, id);
  assertEditable(user, s);
  const tv = latestTranscript(id);
  if (!tv) throw new ConflictError("There is no transcript to confirm yet.");
  update("statements", id, { transcript_confirmed_at: now(), transcript_confirmed_by: user.id });
  touch(id, "draft");
  audit({ actorId: user.id, action: "transcript.confirmed", entityType: "statement", entityId: id, caseId: s.case_id, summary: `Transcript version ${tv.version} confirmed after read-back to the speaker` });
}

export function abandonStatement(user: AuthUser, id: string, reason: string) {
  const s = loadStatement(user, id);
  assertEditable(user, s);
  assertInProgress(s);
  if (s.created_by !== user.id && !can(user, "case.view.station") && !can(user, "case.view.all")) throw new ForbiddenError();
  update("statements", id, { status: "abandoned", updated_at: now() });
  audit({ actorId: user.id, action: "statement.abandoned", entityType: "statement", entityId: id, summary: "Report intake abandoned", metadata: { reason } });
}

export function setStep(user: AuthUser, id: string, step: Step) {
  const s = loadStatement(user, id);
  if (s.status === "in_progress") touch(id, step);
}

/** Steps applicable to this statement (consent only for recorded methods). */
export function applicableSteps(s: Pick<StatementRow, "capture_method">): Step[] {
  return STEPS.filter((st) => st !== "consent" || s.capture_method === "audio" || s.capture_method === "video");
}

/** Which steps are complete, derived from data (not from navigation). */
export function stepCompletion(s: StatementRow): Record<Step, boolean> {
  const tv = get<{ n: number }>("SELECT COUNT(*) AS n FROM transcript_versions WHERE statement_id = ?", s.id)!.n;
  const draft = get<{ status: string }>("SELECT status FROM drafts WHERE statement_id = ? ORDER BY created_at DESC LIMIT 1", s.id);
  const scope = s.capture_method === "video" ? "video" : "audio";
  const consent = s.capture_method === "audio" || s.capture_method === "video" ? currentConsent(s.id, scope) : undefined;
  return {
    intake: true,
    method: !!s.capture_method,
    consent: !!consent,
    capture: tv > 0,
    transcript: !!s.transcript_confirmed_at,
    draft: !!draft,
    review: draft?.status === "reviewed",
    case: !!s.case_id,
    complete: s.status === "completed",
  };
}
