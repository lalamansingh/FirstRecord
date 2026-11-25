/**
 * Legal provision SUGGESTIONS. The system only points out catalogue entries whose
 * trigger phrases appear in what the speaker said, quoting the exact sentence.
 * An authorized officer decides which provisions (if any) apply. Nothing here
 * determines guilt, scores anyone, or files anything.
 */
import { all, get, insert, newId, now, parseJson, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertCan, assertStatementAccess, can, type AuthUser } from "@/lib/rbac/access";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { getStatementRow, latestTranscript } from "./statements";
import { listDraftsForStatement, saveDraftEdits } from "./drafts";

/* ---------------- Types ---------------- */

export interface ProvisionRow {
  id: string;
  code: string;
  act: string;
  section: string;
  title: string;
  summary: string;
  keywords: string[];
  category: string;
  is_active: number;
  source_note: string;
  updated_at: string;
}

export interface SuggestionReason {
  quote: string;
  keyword: string;
}

export interface SuggestionRow {
  id: string;
  statement_id: string;
  case_id: string | null;
  provision_id: string;
  status: "suggested" | "selected" | "rejected";
  origin: "rule" | "ai" | "officer";
  reasons: SuggestionReason[];
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
  code: string;
  act: string;
  title: string;
  summary: string;
  source_note: string;
}

export interface MatchInput {
  id: string;
  keywords: string[];
}

export interface MatchResult {
  provisionId: string;
  reasons: SuggestionReason[];
}

/* ---------------- Pure matcher ---------------- */

const MAX_QUOTES = 3;
const MAX_QUOTE_LEN = 300;
const LATIN = /[a-z]/i;

/** Split text into sentences (English and Hindi danda), keeping the exact wording. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Latin-script phrases must match whole words (so "link" does not match "linked");
 * Devanagari phrases match as substrings so stems like "चुरा" match "चुराया".
 */
function keywordRegex(keyword: string): RegExp {
  const k = escapeRe(keyword.trim().toLowerCase()).replace(/\s+/g, "\\s+");
  return LATIN.test(keyword) ? new RegExp(`(?<![\\p{L}\\p{N}])${k}(?![\\p{L}\\p{N}])`, "iu") : new RegExp(k, "iu");
}

/**
 * Find catalogue entries whose trigger phrases appear in the text. Each result
 * carries the verbatim sentence(s) that matched. No scoring or ranking by
 * likelihood: results follow catalogue order.
 */
export function matchProvisions(text: string, catalog: MatchInput[]): MatchResult[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const out: MatchResult[] = [];
  for (const p of catalog) {
    const reasons: SuggestionReason[] = [];
    const seen = new Set<string>();
    for (const kw of p.keywords) {
      if (!kw || !kw.trim()) continue;
      const re = keywordRegex(kw);
      for (const s of sentences) {
        if (reasons.length >= MAX_QUOTES) break;
        if (seen.has(s) || !re.test(s)) continue;
        seen.add(s);
        reasons.push({ quote: s.length > MAX_QUOTE_LEN ? s.slice(0, MAX_QUOTE_LEN) + "…" : s, keyword: kw });
      }
      if (reasons.length >= MAX_QUOTES) break;
    }
    if (reasons.length) out.push({ provisionId: p.id, reasons });
  }
  return out;
}

/* ---------------- Catalogue ---------------- */

function mapProvision(r: Record<string, unknown>): ProvisionRow {
  return { ...(r as unknown as ProvisionRow), keywords: parseJson<string[]>(r.keywords, []) };
}

export function listProvisions(opts: { activeOnly?: boolean; q?: string } = {}): ProvisionRow[] {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.activeOnly) where.push("is_active = 1");
  if (opts.q?.trim()) {
    where.push("(code LIKE ? OR title LIKE ? OR summary LIKE ?)");
    const like = `%${opts.q.trim()}%`;
    params.push(like, like, like);
  }
  return all<Record<string, unknown>>(
    `SELECT * FROM legal_provisions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY act, CAST(section AS INTEGER), section`,
    ...params,
  ).map(mapProvision);
}

export function getProvision(id: string): ProvisionRow | undefined {
  const r = get<Record<string, unknown>>("SELECT * FROM legal_provisions WHERE id = ?", id);
  return r ? mapProvision(r) : undefined;
}

export interface ProvisionInput {
  code: string;
  act: string;
  section: string;
  title: string;
  summary: string;
  keywords: string[];
  category: string;
  sourceNote: string;
}

function cleanKeywords(k: string[]) {
  return [...new Set(k.map((x) => x.trim()).filter((x) => x.length >= 2))].slice(0, 60);
}

export function createProvision(user: AuthUser, input: ProvisionInput): string {
  assertCan(user, "legal.manage");
  if (get("SELECT 1 FROM legal_provisions WHERE code = ?", input.code)) throw new ValidationError("A provision with this code already exists.", { code: "Already exists" });
  const id = newId();
  const t = now();
  tx(() => {
    insert("legal_provisions", {
      id, code: input.code, act: input.act, section: input.section, title: input.title, summary: input.summary,
      keywords: JSON.stringify(cleanKeywords(input.keywords)), category: input.category || "general",
      is_active: 1, source_note: input.sourceNote, updated_by: user.id, created_at: t, updated_at: t,
    });
    audit({ actorId: user.id, action: "legal.provision_created", entityType: "legal_provision", entityId: id, summary: `Legal provision ${input.code} added to the catalogue`, metadata: { code: input.code } });
  });
  return id;
}

export function updateProvision(user: AuthUser, id: string, input: ProvisionInput) {
  assertCan(user, "legal.manage");
  const p = getProvision(id);
  if (!p) throw new NotFoundError();
  const clash = get<{ id: string }>("SELECT id FROM legal_provisions WHERE code = ? AND id <> ?", input.code, id);
  if (clash) throw new ValidationError("A provision with this code already exists.", { code: "Already exists" });
  tx(() => {
    update("legal_provisions", id, {
      code: input.code, act: input.act, section: input.section, title: input.title, summary: input.summary,
      keywords: JSON.stringify(cleanKeywords(input.keywords)), category: input.category || "general",
      source_note: input.sourceNote, updated_by: user.id, updated_at: now(),
    });
    audit({ actorId: user.id, action: "legal.provision_updated", entityType: "legal_provision", entityId: id, summary: `Legal provision ${input.code} updated`, metadata: { code: input.code } });
  });
}

export function setProvisionActive(user: AuthUser, id: string, active: boolean) {
  assertCan(user, "legal.manage");
  const p = getProvision(id);
  if (!p) throw new NotFoundError();
  tx(() => {
    update("legal_provisions", id, { is_active: active ? 1 : 0, updated_by: user.id, updated_at: now() });
    audit({ actorId: user.id, action: active ? "legal.provision_activated" : "legal.provision_deactivated", entityType: "legal_provision", entityId: id, summary: `Legal provision ${p.code} ${active ? "reactivated" : "deactivated"}`, metadata: { code: p.code } });
  });
}

/* ---------------- Suggestions ---------------- */

function loadForLegal(user: AuthUser, statementId: string) {
  assertStatementAccess(user, statementId);
  const s = getStatementRow(statementId);
  if (!s) throw new NotFoundError();
  return s;
}

export function listSuggestions(user: AuthUser, statementId: string): SuggestionRow[] {
  assertCan(user, "legal.suggest");
  loadForLegal(user, statementId);
  return all<Record<string, unknown>>(
    `SELECT ps.*, p.code, p.act, p.title, p.summary, p.source_note, u.name AS decided_by_name
       FROM provision_suggestions ps
       JOIN legal_provisions p ON p.id = ps.provision_id
       LEFT JOIN users u ON u.id = ps.decided_by
      WHERE ps.statement_id = ?
      ORDER BY CASE ps.status WHEN 'selected' THEN 0 WHEN 'suggested' THEN 1 ELSE 2 END, p.act, CAST(p.section AS INTEGER), p.section`,
    statementId,
  ).map((r) => ({ ...(r as unknown as SuggestionRow), reasons: parseJson<SuggestionReason[]>(r.reasons, []) }));
}

/** Text the matcher reads: latest transcript plus intake / case descriptions. */
function sourceText(statementId: string): string {
  const s = getStatementRow(statementId)!;
  const tv = latestTranscript(statementId);
  const parts = [tv?.text ?? ""];
  if (s.incident_type) parts.push(s.incident_type);
  if (s.case_id) {
    const c = get<{ title: string; summary: string; incident_type: string }>("SELECT title, summary, incident_type FROM cases WHERE id = ?", s.case_id);
    if (c) parts.push(c.title, c.incident_type, c.summary);
  }
  return parts.filter((x) => x && x.trim()).join("\n");
}

/**
 * Run the rule-based matcher and store new suggestions. Existing officer decisions
 * are never changed; reasons on still-undecided rule suggestions are refreshed.
 */
export function generateSuggestions(user: AuthUser, statementId: string): { added: number; total: number } {
  assertCan(user, "legal.suggest");
  const s = loadForLegal(user, statementId);
  const text = sourceText(statementId);
  if (!text.trim()) throw new ConflictError("There is no statement text to read yet.");
  const catalog = listProvisions({ activeOnly: true }).map((p) => ({ id: p.id, keywords: p.keywords }));
  const matches = matchProvisions(text, catalog);
  let added = 0;
  tx(() => {
    for (const m of matches) {
      const existing = get<{ id: string; status: string; origin: string }>(
        "SELECT id, status, origin FROM provision_suggestions WHERE statement_id = ? AND provision_id = ?",
        statementId, m.provisionId,
      );
      if (!existing) {
        insert("provision_suggestions", {
          id: newId(), statement_id: statementId, case_id: s.case_id, provision_id: m.provisionId,
          status: "suggested", origin: "rule", reasons: JSON.stringify(m.reasons), created_at: now(),
        });
        added++;
      } else if (existing.status === "suggested" && existing.origin === "rule") {
        update("provision_suggestions", existing.id, { reasons: JSON.stringify(m.reasons), case_id: s.case_id });
      }
    }
    audit({
      actorId: user.id, action: "legal.suggestions_generated", entityType: "statement", entityId: statementId, caseId: s.case_id,
      summary: `Legal provision suggestions refreshed (${added} new, ${matches.length} matched)`, metadata: { added, matched: matches.length },
    });
  });
  return { added, total: matches.length };
}

function getSuggestion(id: string) {
  return get<{ id: string; statement_id: string; case_id: string | null; provision_id: string; status: string; code: string }>(
    "SELECT ps.id, ps.statement_id, ps.case_id, ps.provision_id, ps.status, p.code FROM provision_suggestions ps JOIN legal_provisions p ON p.id = ps.provision_id WHERE ps.id = ?",
    id,
  );
}

/** Officer decision on one suggestion. "suggested" undoes an earlier decision. */
export function decideSuggestion(user: AuthUser, suggestionId: string, decision: "selected" | "rejected" | "suggested") {
  assertCan(user, "legal.select");
  const sg = getSuggestion(suggestionId);
  if (!sg) throw new NotFoundError();
  const s = loadForLegal(user, sg.statement_id);
  if (sg.status === decision) return;
  tx(() => {
    update("provision_suggestions", sg.id, {
      status: decision,
      decided_by: decision === "suggested" ? null : user.id,
      decided_at: decision === "suggested" ? null : now(),
    });
    const verb = decision === "selected" ? "selected" : decision === "rejected" ? "rejected" : "returned to undecided";
    audit({
      actorId: user.id, action: `legal.provision_${decision === "suggested" ? "undecided" : decision}`, entityType: "statement", entityId: sg.statement_id, caseId: s.case_id,
      summary: `Legal provision ${sg.code} ${verb} by officer`, metadata: { code: sg.code, decision },
    });
  });
}

/** Officer adds a provision from the catalogue that was not suggested. It is selected immediately. */
export function addOfficerProvision(user: AuthUser, statementId: string, provisionId: string) {
  assertCan(user, "legal.select");
  const s = loadForLegal(user, statementId);
  const p = getProvision(provisionId);
  if (!p || !p.is_active) throw new NotFoundError();
  tx(() => {
    const existing = get<{ id: string }>("SELECT id FROM provision_suggestions WHERE statement_id = ? AND provision_id = ?", statementId, provisionId);
    if (existing) {
      update("provision_suggestions", existing.id, { status: "selected", decided_by: user.id, decided_at: now() });
    } else {
      insert("provision_suggestions", {
        id: newId(), statement_id: statementId, case_id: s.case_id, provision_id: provisionId, status: "selected", origin: "officer",
        reasons: "[]", decided_by: user.id, decided_at: now(), created_at: now(),
      });
    }
    audit({
      actorId: user.id, action: "legal.provision_added", entityType: "statement", entityId: statementId, caseId: s.case_id,
      summary: `Legal provision ${p.code} added and selected by officer`, metadata: { code: p.code },
    });
  });
}

/** Lines for officer-selected provisions only, e.g. "BNS 303(2) — Theft (Bharatiya Nyaya Sanhita, 2023)". */
export function selectedProvisionLines(statementId: string): string[] {
  return all<{ code: string; title: string; act: string }>(
    `SELECT p.code, p.title, p.act FROM provision_suggestions ps JOIN legal_provisions p ON p.id = ps.provision_id
      WHERE ps.statement_id = ? AND ps.status = 'selected' ORDER BY p.act, CAST(p.section AS INTEGER), p.section`,
    statementId,
  ).map((r) => `${r.code} — ${r.title} (${r.act})`);
}

/** Selected provisions across every statement in a case (for the case page). */
export function selectedProvisionsForCase(caseId: string): { code: string; title: string; act: string; statement_id: string }[] {
  return all(
    `SELECT DISTINCT p.code, p.title, p.act, ps.statement_id FROM provision_suggestions ps JOIN legal_provisions p ON p.id = ps.provision_id
      WHERE ps.status = 'selected' AND ps.statement_id IN (SELECT id FROM statements WHERE case_id = ?)
      ORDER BY p.act, CAST(p.section AS INTEGER), p.section`,
    caseId,
  );
}

/**
 * Copy the officer-selected provisions into the FIR draft's "Legal provisions"
 * field as a new, human-authored draft version. Explicit officer action only.
 */
export function applySelectedToDraft(user: AuthUser, statementId: string): number | null {
  assertCan(user, "legal.select");
  assertCan(user, "draft.edit");
  loadForLegal(user, statementId);
  const d = listDraftsForStatement(statementId)[0];
  if (!d) throw new ConflictError("Prepare the FIR draft first, then add the selected provisions to it.");
  const lines = selectedProvisionLines(statementId);
  return saveDraftEdits(user, d.id, { legal_provisions: lines.join("\n") }, "Legal provisions set from officer-selected provisions");
}

export function canSeeLegal(user: AuthUser) {
  return can(user, "legal.suggest");
}
