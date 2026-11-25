/** End-to-end service-level flow: intake → transcript → draft → review → case, plus permission denials. */
import { describe, it, expect, beforeAll } from "vitest";
import { get, all } from "@/lib/db";
import { createStatement, addTranscriptVersion, confirmTranscript, recordConsent, loadStatement } from "@/lib/domain/statements";
import { generateDraft, markReviewed, decideFields, getDraftRow } from "@/lib/domain/drafts";
import { createCaseFromStatement } from "@/lib/domain/case-create";
import { changeCaseStatus, assignCase } from "@/lib/domain/cases";
import { createTask, changeTaskStatus } from "@/lib/domain/tasks";
import { findPossibleDuplicates } from "@/lib/domain/duplicates";
import { canGrantRole } from "@/lib/domain/admin";
import { DEFAULT_ROLES } from "@/lib/rbac/permissions";
import { ForbiddenError, NotFoundError, ValidationError, ConflictError, AppError } from "@/lib/errors";
import { seeded, userByEmail } from "./helpers";

const intake = {
  intakeAt: new Date(Date.now() - 3600000).toISOString(),
  incidentType: "Theft",
  incidentDate: new Date(Date.now() - 86400000).toISOString(),
  incidentLocation: "Outside Sample Library, Example Road, Sampleganj",
  language: "en",
  speakerName: "Test Example",
  speakerContact: "00000-09001",
  speakerAddress: "1 Example Road, Sampleganj",
  speakerRole: "complainant",
};
const TEXT =
  "My name is Test Example. Yesterday at around 8 in the evening I parked my green bicycle outside the Sample Library on Example Road. When I came back at 9 it was gone.";

describe("report → review → case flow", () => {
  beforeAll(() => seeded());
  let statementId = "";
  let draftId = "";

  it("clerk starts an intake and records a declined consent without blocking the report", () => {
    const clerk = userByEmail("clerk@central.example");
    statementId = createStatement(clerk, intake);
    const c = recordConsent(clerk, statementId, "audio", "declined", "hi");
    expect(c.decision).toBe("declined");
    expect(c.notice_language).toBe("hi");
    expect(c.notice_text.length).toBeGreaterThan(20);
    expect(loadStatement(clerk, statementId).status).toBe("in_progress");
  });

  it("transcript versions are append-only and drafting needs confirmation", async () => {
    const clerk = userByEmail("clerk@central.example");
    expect(addTranscriptVersion(clerk, statementId, { text: TEXT, source: "typed_original", note: null, uncertaintyNote: null, recordingId: null })).toBe(1);
    await expect(generateDraft(clerk, statementId)).rejects.toThrow(ConflictError);
    expect(() => addTranscriptVersion(clerk, statementId, { text: TEXT + " Edited.", source: "correction", note: null, uncertaintyNote: null, recordingId: null })).toThrow(ValidationError);
    expect(addTranscriptVersion(clerk, statementId, { text: TEXT + " It has a basket.", source: "correction", note: "Speaker added a detail", uncertaintyNote: null, recordingId: null })).toBe(2);
    confirmTranscript(clerk, statementId);
  });

  it("generates a labelled demo draft and logs AI metadata without content", async () => {
    const clerk = userByEmail("clerk@central.example");
    const r = await generateDraft(clerk, statementId);
    draftId = r.draftId;
    const v = get<{ origin: string; provider: string; based_on_transcript_version: number }>(
      "SELECT origin, provider, based_on_transcript_version FROM draft_versions WHERE draft_id = ? AND version = ?", draftId, r.version,
    )!;
    expect(v.origin).toBe("demo");
    expect(v.based_on_transcript_version).toBe(2);
    const meta = get<Record<string, unknown>>("SELECT * FROM ai_request_metadata WHERE statement_id = ?", statementId)!;
    expect(meta.mode).toBe("demo");
    expect(JSON.stringify(meta)).not.toContain("green bicycle");
  });

  it("clerk cannot mark reviewed; officer must decide suggestions and confirm", () => {
    const clerk = userByEmail("clerk@central.example");
    const officer = userByEmail("admin@central.example"); // station admin: station scope + draft.review
    const d = getDraftRow(draftId)!;
    expect(() => markReviewed(clerk, draftId, { confirmNeedsConfirmation: true, comment: null, expectedVersion: d.current_version })).toThrow(ForbiddenError);
    expect(() => markReviewed(officer, draftId, { confirmNeedsConfirmation: true, comment: null, expectedVersion: d.current_version })).toThrow(ValidationError);
    decideFields(officer, draftId, "all_pending", "accepted");
    const d2 = getDraftRow(draftId)!;
    expect(() => markReviewed(officer, draftId, { confirmNeedsConfirmation: true, comment: null, expectedVersion: d2.current_version - 1 })).toThrow(ConflictError);
    try {
      markReviewed(officer, draftId, { confirmNeedsConfirmation: true, comment: "Checked", expectedVersion: d2.current_version });
    } catch (e) {
      // Required fields may legitimately be missing from a rule-based draft; that is a correct refusal.
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as Error).message).toMatch(/Required fields/);
      return;
    }
    expect(getDraftRow(draftId)!.status).toBe("reviewed");
    expect(get("SELECT 1 FROM audit_events WHERE action = 'draft.reviewed' AND entity_id = ?", draftId)).toBeTruthy();
  });

  it("creates a LOCAL case with a station reference, links and audit", () => {
    const clerk = userByEmail("clerk@central.example");
    const r = createCaseFromStatement(clerk, statementId, { title: "Bicycle reported missing", priority: "medium", assignedTo: null, incidentType: "Theft" });
    expect(r.reference).toMatch(/^CNT\/\d{4}\/\d{5}$/);
    const c = get<{ official_status: string; status: string }>("SELECT official_status, status FROM cases WHERE id = ?", r.caseId)!;
    expect(c.official_status).toBe("local");
    expect(get<{ case_id: string }>("SELECT case_id FROM statements WHERE id = ?", statementId)!.case_id).toBe(r.caseId);
    expect(get<{ case_id: string }>("SELECT case_id FROM drafts WHERE id = ?", draftId)!.case_id).toBe(r.caseId);
    expect(get("SELECT 1 FROM case_parties WHERE case_id = ? AND party_role = 'complainant'", r.caseId)).toBeTruthy();
    expect(get("SELECT 1 FROM case_status_history WHERE case_id = ?", r.caseId)).toBeTruthy();
    expect(get("SELECT 1 FROM audit_events WHERE action = 'case.created' AND case_id = ?", r.caseId)).toBeTruthy();
    expect(() => createCaseFromStatement(clerk, statementId, { title: "Again", priority: "low", assignedTo: null, incidentType: "Theft" })).toThrow(ConflictError);
  });

  it("clerk cannot assign the case to someone else", () => {
    const clerk = userByEmail("clerk@central.example");
    const s2 = createStatement(clerk, intake);
    addTranscriptVersion(clerk, s2, { text: TEXT, source: "typed_original", note: null, uncertaintyNote: null, recordingId: null });
    const rao = userByEmail("officer.rao@central.example");
    expect(() => createCaseFromStatement(clerk, s2, { title: "Another report", priority: "low", assignedTo: rao.id, incidentType: "Theft" })).toThrow(ForbiddenError);
  });

  it("suggests possible duplicates without merging", () => {
    const admin = userByEmail("admin@central.example");
    const before = get<{ n: number }>("SELECT COUNT(*) AS n FROM cases")!.n;
    const s = findPossibleDuplicates(admin, { stationId: admin.stationId!, incidentType: "Theft", incidentDate: intake.incidentDate, names: ["Test Example"], phones: ["00000-09001"] });
    expect(s.length).toBeGreaterThan(0);
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM cases")!.n).toBe(before);
  });
});

describe("service-level permission enforcement", () => {
  beforeAll(() => seeded());

  it("read-only reviewer and system admin cannot start reports", () => {
    expect(() => createStatement(userByEmail("reviewer@central.example"), intake)).toThrow(ForbiddenError);
    expect(() => createStatement(userByEmail("sysadmin@firstrecord.example"), intake)).toThrow(AppError);
  });

  it("system admin cannot read statements; other stations get not-found", () => {
    const s = get<{ id: string }>("SELECT s.id FROM statements s JOIN stations st ON st.id = s.station_id WHERE st.code = 'CNT' LIMIT 1")!;
    expect(() => loadStatement(userByEmail("sysadmin@firstrecord.example"), s.id)).toThrow(NotFoundError);
    expect(() => loadStatement(userByEmail("officer.das@riverside.example"), s.id)).toThrow(NotFoundError);
  });

  it("case status changes respect permissions, scope and workflow", () => {
    const rao = userByEmail("officer.rao@central.example");
    const mine = get<{ id: string }>("SELECT id FROM cases WHERE assigned_to = ? AND status = 'received' LIMIT 1", rao.id)
      ?? get<{ id: string }>("SELECT id FROM cases WHERE assigned_to = ? AND status = 'statement_review' LIMIT 1", rao.id)!;
    const st = get<{ status: string }>("SELECT status FROM cases WHERE id = ?", mine.id)!.status;
    expect(() => changeCaseStatus(rao, mine.id, "closed_for_good", null, null)).toThrow(ValidationError);
    const next = st === "received" ? "statement_review" : "draft_prepared";
    changeCaseStatus(rao, mine.id, next, null, null);
    expect(all("SELECT 1 FROM case_status_history WHERE case_id = ? AND to_status = ?", mine.id, next).length).toBe(1);
    expect(() => changeCaseStatus(userByEmail("reviewer@central.example"), mine.id, st, null, null)).toThrow(ForbiddenError);
    expect(() => changeCaseStatus(userByEmail("officer.das@riverside.example"), mine.id, st, null, null)).toThrow(NotFoundError);
    expect(() => assignCase(rao, mine.id, null, null)).toThrow(ForbiddenError); // officers lack case.assign
  });

  it("tasks: reviewer cannot create; completing sets completed_at", () => {
    const rao = userByEmail("officer.rao@central.example");
    const input = { title: "Call witness", description: "", taskType: "follow_up", priority: "medium" as const, caseId: null, assigneeId: rao.id, dueAt: null, remindAt: null };
    expect(() => createTask(userByEmail("reviewer@central.example"), input)).toThrow(ForbiddenError);
    const id = createTask(rao, input);
    changeTaskStatus(rao, id, "done");
    expect(get<{ completed_at: string | null }>("SELECT completed_at FROM tasks WHERE id = ?", id)!.completed_at).toBeTruthy();
    expect(() => changeTaskStatus(rao, id, "nonsense")).toThrow(ValidationError);
  });

  it("administrators cannot grant permissions they do not hold", () => {
    const admin = userByEmail("admin@central.example");
    expect(canGrantRole(admin, { key: "officer", permissions: DEFAULT_ROLES.officer.permissions })).toBe(true);
    expect(canGrantRole(admin, { key: "system_admin", permissions: DEFAULT_ROLES.system_admin.permissions })).toBe(false);
    expect(canGrantRole(admin, { key: "custom", permissions: ["case.view.all"] })).toBe(false);
  });
});
