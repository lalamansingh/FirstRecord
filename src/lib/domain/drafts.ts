/**
 * FIR draft domain. Drafts are versioned; every version is immutable.
 * A "reviewed" draft is NOT an official filing — FirstRecord never files.
 */
import { all, get, insert, newId, now, parseJson, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, assertStatementAccess, can, canViewStatement, type AuthUser } from "@/lib/rbac/access";
import { loadAuthUser } from "@/lib/auth/users";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { notify } from "@/lib/domain/notifications";
import type { TemplateField } from "@/lib/seed/base";
import { generateDraftLogged, type DraftField, type DraftFields, type DraftQuestion } from "@/lib/ai";
import { getStatementRow, latestTranscript, loadStatement } from "./statements";

export interface TemplateRow {
  id: string;
  name: string;
  jurisdiction: string;
  version: number;
  description: string;
  fields: TemplateField[];
}

export interface DraftRow {
  id: string;
  statement_id: string;
  case_id: string | null;
  template_id: string;
  status: "draft" | "clarification_requested" | "reviewed";
  current_version: number;
  reviewed_by: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  reviewed_version: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DraftVersionRow {
  id: string;
  draft_id: string;
  version: number;
  fields: DraftFields;
  questions: DraftQuestion[];
  origin: "ai" | "demo" | "human";
  provider: string | null;
  model: string | null;
  based_on_transcript_version: number | null;
  change_summary: string | null;
  created_by: string;
  created_by_name?: string;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  draft_id: string;
  draft_version: number;
  reviewer_id: string;
  reviewer_name: string;
  decision: "clarification_requested" | "reviewed";
  comment: string | null;
  created_at: string;
}

export interface ReviewCommentRow {
  id: string;
  draft_id: string;
  draft_version: number;
  field_key: string | null;
  author_id: string;
  author_name: string;
  body: string;
  resolved_at: string | null;
  created_at: string;
}

/* ---------------- Reads ---------------- */

export function getActiveTemplate(): TemplateRow {
  const r = get<Record<string, unknown>>("SELECT * FROM templates WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1");
  if (!r) throw new ConflictError("No active FIR draft template is configured. Ask an administrator to configure one in Settings.");
  return { ...(r as unknown as TemplateRow), fields: parseJson<TemplateField[]>(r.fields, []) };
}

export function getTemplate(id: string): TemplateRow {
  const r = get<Record<string, unknown>>("SELECT * FROM templates WHERE id = ?", id);
  if (!r) throw new NotFoundError("Template not found.");
  return { ...(r as unknown as TemplateRow), fields: parseJson<TemplateField[]>(r.fields, []) };
}

export function getDraftRow(id: string): DraftRow | undefined {
  return get<DraftRow>(
    "SELECT d.*, u.name AS reviewed_by_name FROM drafts d LEFT JOIN users u ON u.id = d.reviewed_by WHERE d.id = ?",
    id,
  );
}

/** Load a draft the user may view (via its statement). */
export function loadDraft(user: AuthUser, id: string): DraftRow {
  const d = getDraftRow(id);
  if (!d) throw new NotFoundError();
  assertStatementAccess(user, d.statement_id);
  return d;
}

export function listDraftsForStatement(statementId: string): DraftRow[] {
  return all<DraftRow>(
    "SELECT d.*, u.name AS reviewed_by_name FROM drafts d LEFT JOIN users u ON u.id = d.reviewed_by WHERE d.statement_id = ? ORDER BY d.created_at DESC",
    statementId,
  );
}

function mapVersion(r: Record<string, unknown>): DraftVersionRow {
  return {
    ...(r as unknown as DraftVersionRow),
    fields: parseJson<DraftFields>(r.fields, {}),
    questions: parseJson<DraftQuestion[]>(r.questions, []),
  };
}

export function listVersions(draftId: string): DraftVersionRow[] {
  return all<Record<string, unknown>>(
    `SELECT v.*, u.name AS created_by_name FROM draft_versions v JOIN users u ON u.id = v.created_by
      WHERE v.draft_id = ? ORDER BY v.version`,
    draftId,
  ).map(mapVersion);
}

export function getVersion(draftId: string, version: number): DraftVersionRow | undefined {
  const r = get<Record<string, unknown>>(
    `SELECT v.*, u.name AS created_by_name FROM draft_versions v JOIN users u ON u.id = v.created_by
      WHERE v.draft_id = ? AND v.version = ?`,
    draftId,
    version,
  );
  return r ? mapVersion(r) : undefined;
}

export function listReviews(draftId: string): ReviewRow[] {
  return all<ReviewRow>(
    `SELECT r.*, u.name AS reviewer_name FROM reviews r JOIN users u ON u.id = r.reviewer_id WHERE r.draft_id = ? ORDER BY r.created_at DESC`,
    draftId,
  );
}

export function listComments(draftId: string): ReviewCommentRow[] {
  return all<ReviewCommentRow>(
    `SELECT c.*, u.name AS author_name FROM review_comments c JOIN users u ON u.id = c.author_id WHERE c.draft_id = ? ORDER BY c.created_at`,
    draftId,
  );
}

/* ---------------- Helpers ---------------- */

function appendVersion(
  user: AuthUser,
  d: DraftRow,
  fields: DraftFields,
  questions: DraftQuestion[],
  meta: { origin: "ai" | "demo" | "human"; provider?: string | null; model?: string | null; basedOn?: number | null; changeSummary: string },
): number {
  const version = d.current_version + 1;
  insert("draft_versions", {
    id: newId(),
    draft_id: d.id,
    version,
    fields: JSON.stringify(fields),
    questions: JSON.stringify(questions),
    origin: meta.origin,
    provider: meta.provider ?? null,
    model: meta.model ?? null,
    based_on_transcript_version: meta.basedOn ?? null,
    change_summary: meta.changeSummary.slice(0, 500),
    created_by: user.id,
    created_at: now(),
  });
  // Any new version after review returns the draft to "draft" — the review covered an older version.
  const values: Record<string, string | number | null> = { current_version: version, updated_at: now() };
  if (d.status === "reviewed") values.status = "draft";
  update("drafts", d.id, values);
  return version;
}

function current(d: DraftRow): DraftVersionRow {
  const v = getVersion(d.id, d.current_version);
  if (!v) throw new ConflictError("Draft version data is missing.");
  return v;
}

function assertDraftEditable(user: AuthUser, d: DraftRow) {
  assertCan(user, "draft.edit");
  const s = getStatementRow(d.statement_id);
  if (s?.status === "abandoned") throw new ConflictError("This report was abandoned.");
}

function isEmpty(v: string | string[]) {
  return Array.isArray(v) ? v.filter((x) => x.trim()).length === 0 : !v.trim();
}

/* ---------------- Mutations ---------------- */

/** Generate (or regenerate) a draft from the latest confirmed transcript. */
export async function generateDraft(user: AuthUser, statementId: string): Promise<{ draftId: string; version: number }> {
  const s = loadStatement(user, statementId);
  assertCan(user, "draft.generate");
  if (s.status === "abandoned") throw new ConflictError("This report was abandoned.");
  const tv = latestTranscript(statementId);
  if (!tv) throw new ConflictError("Record or enter the statement before preparing a draft.");
  if (!s.transcript_confirmed_at) throw new ConflictError("Confirm the transcript with the speaker before preparing a draft.");
  const template = getActiveTemplate();
  const existing = listDraftsForStatement(statementId)[0];

  // External call happens outside the DB transaction.
  const { output, provider } = await generateDraftLogged(
    {
      transcript: tv.text,
      transcriptVersion: tv.version,
      language: s.language,
      template: template.fields,
      intake: { speakerName: s.speaker_name, incidentType: s.incident_type, incidentDate: s.incident_date, incidentLocation: s.incident_location },
    },
    { userId: user.id, statementId, draftId: existing?.id ?? null },
  );

  return tx(() => {
    let d = existing;
    if (!d) {
      const id = newId();
      const t = now();
      insert("drafts", {
        id,
        statement_id: statementId,
        case_id: s.case_id,
        template_id: template.id,
        status: "draft",
        current_version: 0,
        created_by: user.id,
        created_at: t,
        updated_at: t,
      });
      d = getDraftRow(id)!;
    }
    const origin = provider.mode === "live" ? "ai" : "demo";
    // Legal provisions are never suggested by the draft assistant: only provisions an
    // officer explicitly selected (see domain/legal.ts) are carried into the draft.
    const selected = all<{ code: string; title: string; act: string }>(
      `SELECT p.code, p.title, p.act FROM provision_suggestions ps JOIN legal_provisions p ON p.id = ps.provision_id
        WHERE ps.statement_id = ? AND ps.status = 'selected' ORDER BY p.act, CAST(p.section AS INTEGER), p.section`,
      statementId,
    );
    if (selected.length) {
      output.fields.legal_provisions = {
        value: selected.map((r) => `${r.code} — ${r.title} (${r.act})`).join("\n"),
        status: "provided",
        sources: [],
        origin: "human",
        decision: null,
        rationale: "Provisions selected by an officer.",
      };
    }
    const version = appendVersion(user, d, output.fields, output.questions, {
      origin,
      provider: provider.name,
      model: provider.model,
      basedOn: tv.version,
      changeSummary: output.abstained
        ? `Assistant abstained: ${output.abstainReason ?? "insufficient information"}`
        : `${origin === "ai" ? "AI-generated" : "Demo-generated"} draft from transcript v${tv.version}`,
    });
    if (d.status === "clarification_requested") update("drafts", d.id, { status: "draft" });
    if (s.status === "in_progress") update("statements", statementId, { current_step: "review", updated_at: now() });
    audit({
      actorId: user.id,
      action: "draft.generated",
      entityType: "draft",
      entityId: d.id,
      caseId: s.case_id,
      summary: `Draft version ${version} generated by ${provider.label}${output.abstained ? " (abstained)" : ""}`,
      metadata: { version, provider: provider.name, model: provider.model, mode: provider.mode, transcriptVersion: tv.version },
    });
    return { draftId: d.id, version };
  });
}

/** Save human edits as a new version. `patch` maps field key → new value. */
export function saveDraftEdits(user: AuthUser, draftId: string, patch: Record<string, string | string[]>, changeSummary: string | null): number | null {
  const d = loadDraft(user, draftId);
  assertDraftEditable(user, d);
  const template = getTemplate(d.template_id);
  const cur = current(d);
  const fields: DraftFields = structuredClone(cur.fields);
  const changed: string[] = [];
  for (const tf of template.fields) {
    if (!(tf.key in patch)) continue;
    const raw = patch[tf.key];
    const value = tf.kind === "list" ? (Array.isArray(raw) ? raw : raw.split("\n")).map((x) => x.trim()).filter(Boolean) : (Array.isArray(raw) ? raw.join("\n") : raw).trim();
    const before = fields[tf.key];
    const beforeText = before ? (Array.isArray(before.value) ? before.value.join("\n") : before.value) : "";
    const afterText = Array.isArray(value) ? value.join("\n") : value;
    if (beforeText === afterText) continue;
    if (afterText.length > 20_000) throw new ValidationError(`${tf.label} is too long.`, { [tf.key]: "Too long" });
    changed.push(tf.label);
    const empty = isEmpty(value);
    fields[tf.key] = {
      value: empty ? "" : value,
      status: empty ? "not_provided" : "provided",
      // Keep source links; reviewers can see the original suggestion in version history.
      sources: before?.sources ?? [],
      origin: "human",
      decision: before && before.origin !== "human" ? "edited" : before?.decision ?? null,
      rationale: "Edited by staff.",
    };
  }
  if (changed.length === 0) return null;
  return tx(() => {
    const version = appendVersion(user, d, fields, cur.questions, {
      origin: "human",
      basedOn: cur.based_on_transcript_version,
      changeSummary: changeSummary?.trim() || `Edited: ${changed.join(", ")}`,
    });
    audit({ actorId: user.id, action: "draft.edited", entityType: "draft", entityId: d.id, caseId: d.case_id, summary: `Draft version ${version} saved (${changed.length} field(s) edited)`, metadata: { version, fields: changed.join(", ") } });
    return version;
  });
}

/** Accept or reject an AI/demo suggestion for one field (or all pending). */
export function decideFields(user: AuthUser, draftId: string, keys: string[] | "all_pending", decision: "accepted" | "rejected"): number | null {
  const d = loadDraft(user, draftId);
  assertDraftEditable(user, d);
  const cur = current(d);
  const fields: DraftFields = structuredClone(cur.fields);
  const targets = keys === "all_pending" ? Object.keys(fields).filter((k) => fields[k].origin !== "human" && !fields[k].decision) : keys;
  const changed: string[] = [];
  for (const k of targets) {
    const f = fields[k];
    if (!f || f.origin === "human") continue;
    if (decision === "accepted") {
      f.decision = "accepted";
    } else {
      fields[k] = { value: "", status: "needs_confirmation", sources: [], origin: "human", decision: "rejected", rationale: "Suggestion rejected by reviewer; value must be entered or confirmed by staff." };
    }
    changed.push(k);
  }
  if (changed.length === 0) return null;
  return tx(() => {
    const version = appendVersion(user, d, fields, cur.questions, {
      origin: "human",
      basedOn: cur.based_on_transcript_version,
      changeSummary: `${decision === "accepted" ? "Accepted" : "Rejected"} suggestion(s): ${changed.length}`,
    });
    audit({ actorId: user.id, action: `draft.suggestion_${decision}`, entityType: "draft", entityId: d.id, caseId: d.case_id, summary: `${changed.length} suggestion(s) ${decision} in version ${version}`, metadata: { version, keys: changed.join(",") } });
    return version;
  });
}

export function addReviewComment(user: AuthUser, draftId: string, fieldKey: string | null, body: string) {
  const d = loadDraft(user, draftId);
  if (!can(user, "draft.edit") && !can(user, "draft.review")) assertCan(user, "draft.review");
  const text = body.trim();
  if (!text) throw new ValidationError("Comment is empty.", { body: "Enter a comment" });
  if (text.length > 4000) throw new ValidationError("Comment is too long.", { body: "Too long" });
  insert("review_comments", { id: newId(), draft_id: d.id, draft_version: d.current_version, field_key: fieldKey, author_id: user.id, body: text, created_at: now() });
  audit({ actorId: user.id, action: "draft.comment_added", entityType: "draft", entityId: d.id, caseId: d.case_id, summary: `Review comment added${fieldKey ? ` on field ${fieldKey}` : ""}` });
  if (d.created_by !== user.id) notify({ userId: d.created_by, kind: "comment", title: "New review comment on a draft", link: `/statements/${d.statement_id}/review?draft=${d.id}`, entityType: "draft", entityId: d.id, actorId: user.id });
}

export function resolveComment(user: AuthUser, commentId: string) {
  const c = get<{ draft_id: string; resolved_at: string | null }>("SELECT draft_id, resolved_at FROM review_comments WHERE id = ?", commentId);
  if (!c) throw new NotFoundError();
  const d = loadDraft(user, c.draft_id);
  if (!can(user, "draft.edit") && !can(user, "draft.review")) assertCan(user, "draft.review");
  if (c.resolved_at) return;
  update("review_comments", commentId, { resolved_at: now(), resolved_by: user.id });
  audit({ actorId: user.id, action: "draft.comment_resolved", entityType: "draft", entityId: d.id, caseId: d.case_id, summary: "Review comment resolved" });
}

/** Notify reviewers that a draft is ready for review. */
export function requestReview(user: AuthUser, draftId: string) {
  const d = loadDraft(user, draftId);
  assertCan(user, "draft.edit");
  const s = getStatementRow(d.statement_id)!;
  let recipients: string[] = [];
  if (d.case_id) {
    const c = get<{ assigned_to: string | null }>("SELECT assigned_to FROM cases WHERE id = ?", d.case_id);
    if (c?.assigned_to) recipients = [c.assigned_to];
  }
  if (recipients.length === 0) {
    recipients = all<{ id: string; permissions: string }>(
      `SELECT u.id, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.station_id = ? AND u.status = 'active'`,
      s.station_id,
    )
      .filter((u) => parseJson<string[]>(u.permissions, []).includes("draft.review") && parseJson<string[]>(u.permissions, []).includes("statement.view"))
      .map((u) => u.id);
  }
  // Only notify people who can actually open the draft (record-level access).
  recipients = recipients.filter((rid) => {
    const ru = loadAuthUser(rid);
    return !!ru && canViewStatement(ru, d.statement_id);
  });
  for (const r of recipients) {
    notify({ userId: r, kind: "review_request", title: "A draft is ready for officer review", link: `/statements/${d.statement_id}/review?draft=${d.id}`, entityType: "draft", entityId: d.id, actorId: user.id });
  }
  audit({ actorId: user.id, action: "draft.review_requested", entityType: "draft", entityId: d.id, caseId: d.case_id, summary: `Review requested (${recipients.length} reviewer(s) notified)` });
  return recipients.length;
}

export function requestClarification(user: AuthUser, draftId: string, comment: string) {
  const d = loadDraft(user, draftId);
  assertCan(user, "draft.review");
  const text = comment.trim();
  if (!text) throw new ValidationError("Explain what needs clarification.", { comment: "Describe what needs clarification" });
  tx(() => {
    insert("reviews", { id: newId(), draft_id: d.id, draft_version: d.current_version, reviewer_id: user.id, decision: "clarification_requested", comment: text.slice(0, 4000), created_at: now() });
    update("drafts", d.id, { status: "clarification_requested", updated_at: now() });
  });
  audit({ actorId: user.id, action: "draft.clarification_requested", entityType: "draft", entityId: d.id, caseId: d.case_id, summary: `Clarification requested on version ${d.current_version}` });
  notify({ userId: d.created_by, kind: "clarification_requested", title: "Clarification requested on a draft", link: `/statements/${d.statement_id}/review?draft=${d.id}`, entityType: "draft", entityId: d.id, actorId: user.id });
}

export interface ReviewReadiness {
  ready: boolean;
  missingRequired: string[];
  needsConfirmation: string[];
  pendingSuggestions: string[];
  openComments: number;
  /** Transcript has a newer version than the one the draft was generated from. */
  transcriptChanged: { from: number; to: number } | null;
}

export function reviewReadiness(d: DraftRow): ReviewReadiness {
  const template = getTemplate(d.template_id);
  const cur = current(d);
  const missingRequired: string[] = [];
  const needsConfirmation: string[] = [];
  const pendingSuggestions: string[] = [];
  for (const tf of template.fields) {
    const f: DraftField | undefined = cur.fields[tf.key];
    if (!f) {
      if (tf.required) missingRequired.push(tf.label);
      continue;
    }
    if (f.origin !== "human" && !f.decision) pendingSuggestions.push(tf.label);
    if (f.status === "needs_confirmation") needsConfirmation.push(tf.label);
    else if (tf.required && (f.status === "not_provided" || isEmpty(f.value))) missingRequired.push(tf.label);
  }
  const openComments = get<{ n: number }>("SELECT COUNT(*) AS n FROM review_comments WHERE draft_id = ? AND resolved_at IS NULL", d.id)!.n;
  const tv = latestTranscript(d.statement_id);
  const transcriptChanged = tv && cur.based_on_transcript_version && tv.version !== cur.based_on_transcript_version ? { from: cur.based_on_transcript_version, to: tv.version } : null;
  return { ready: missingRequired.length === 0 && pendingSuggestions.length === 0, missingRequired, needsConfirmation, pendingSuggestions, openComments, transcriptChanged };
}

/**
 * Mark the current version reviewed. Requires all required fields, a decision
 * on every AI/demo suggestion, and explicit confirmation of any field still
 * marked "Needs confirmation". This is an internal review — NOT a filing.
 */
export function markReviewed(user: AuthUser, draftId: string, opts: { confirmNeedsConfirmation: boolean; comment: string | null; expectedVersion: number }) {
  const d = loadDraft(user, draftId);
  assertCan(user, "draft.review");
  if (d.status === "reviewed" && d.reviewed_version === d.current_version) throw new ConflictError("This version has already been marked reviewed.");
  if (opts.expectedVersion !== d.current_version) throw new ConflictError("The draft changed while you were reviewing it. Reload and review the latest version.");
  const s = getStatementRow(d.statement_id)!;
  if (s.status === "abandoned") throw new ConflictError("This report was abandoned.");
  const r = reviewReadiness(d);
  if (r.missingRequired.length) throw new ValidationError(`Required fields are missing: ${r.missingRequired.join(", ")}.`);
  if (r.pendingSuggestions.length) throw new ValidationError(`Accept, edit or reject every assistant suggestion first: ${r.pendingSuggestions.join(", ")}.`);
  if (r.needsConfirmation.length && !opts.confirmNeedsConfirmation) {
    throw new ValidationError(`These fields are still marked "Needs confirmation": ${r.needsConfirmation.join(", ")}. Resolve them, or explicitly confirm that the draft may be marked reviewed with them outstanding.`, { confirmNeedsConfirmation: "Confirmation required" });
  }
  tx(() => {
    insert("reviews", { id: newId(), draft_id: d.id, draft_version: d.current_version, reviewer_id: user.id, decision: "reviewed", comment: opts.comment?.slice(0, 4000) ?? null, created_at: now() });
    update("drafts", d.id, { status: "reviewed", reviewed_by: user.id, reviewed_at: now(), reviewed_version: d.current_version, updated_at: now() });
  });
  audit({
    actorId: user.id,
    action: "draft.reviewed",
    entityType: "draft",
    entityId: d.id,
    caseId: d.case_id,
    summary: `Draft version ${d.current_version} marked reviewed by officer (not an official filing)${r.needsConfirmation.length ? `; ${r.needsConfirmation.length} field(s) confirmed with details outstanding` : ""}`,
    metadata: { version: d.current_version, outstandingConfirmed: r.needsConfirmation.length },
  });
  notify({ userId: d.created_by, kind: "draft_reviewed", title: "A draft you prepared was marked reviewed", link: `/statements/${d.statement_id}/review?draft=${d.id}`, entityType: "draft", entityId: d.id, actorId: user.id });
}
