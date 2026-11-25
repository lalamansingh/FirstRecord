import { describe, it, expect, beforeAll } from "vitest";
import { all, get } from "@/lib/db";
import { DEFAULT_CASE_WORKFLOW, DEFAULT_TASK_WORKFLOW } from "@/lib/domain/workflow";
import { DEFAULT_TEMPLATE_FIELDS } from "@/lib/seed/base";
import { seeded } from "./helpers";

describe("demo seed", () => {
  beforeAll(() => seeded());

  it("creates fictional, demo-flagged cases across stages and both stations", () => {
    const cases = all<{ status: string; is_demo: number; station_id: string; official_status: string; reference: string }>(
      "SELECT status, is_demo, station_id, official_status, reference FROM cases",
    );
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.every((c) => c.is_demo === 1)).toBe(true);
    expect(cases.every((c) => c.official_status === "local")).toBe(true); // never claims official filing
    expect(new Set(cases.map((c) => c.station_id)).size).toBe(2);
    for (const s of DEFAULT_CASE_WORKFLOW.states) expect(cases.some((c) => c.status === s.key)).toBe(true);
    expect(new Set(cases.map((c) => c.reference)).size).toBe(cases.length);
  });

  it("uses placeholder contact details only", () => {
    const phones = all<{ phone: string | null }>("SELECT phone FROM case_parties WHERE phone IS NOT NULL");
    expect(phones.length).toBeGreaterThan(0);
    for (const p of phones) expect(p.phone).toMatch(/^00000-0\d{4}$/);
    const users = all<{ email: string; is_demo: number }>("SELECT email, is_demo FROM users");
    for (const u of users) {
      expect(u.is_demo).toBe(1);
      expect(u.email).toMatch(/\.example$/); // reserved, non-routable TLD (RFC 2606)
    }
  });

  it("status history follows the workflow", () => {
    const hist = all<{ case_id: string; from_status: string | null; to_status: string }>(
      "SELECT case_id, from_status, to_status FROM case_status_history WHERE from_status IS NOT NULL",
    );
    for (const h of hist) expect(DEFAULT_CASE_WORKFLOW.transitions[h.from_status!]).toContain(h.to_status);
  });

  it("drafts cover every template field, are demo-labelled and quote the transcript verbatim", () => {
    const rows = all<{ fields: string; origin: string; version: number; text: string }>(
      `SELECT dv.fields, dv.origin, dv.version, tv.text FROM draft_versions dv
         JOIN drafts d ON d.id = dv.draft_id
         JOIN transcript_versions tv ON tv.statement_id = d.statement_id AND tv.version = 1`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const fields = JSON.parse(r.fields) as Record<string, { value: unknown; status: string; sources: { quote: string }[] }>;
      for (const tf of DEFAULT_TEMPLATE_FIELDS) expect(fields[tf.key]).toBeTruthy();
      if (r.version === 1) expect(r.origin).toBe("demo");
      for (const f of Object.values(fields)) for (const s of f.sources) expect(r.text).toContain(s.quote);
      expect(fields.legal_provisions.status).toBe("not_provided");
    }
    expect(get("SELECT 1 FROM drafts WHERE status = 'clarification_requested'")).toBeTruthy();
    expect(get("SELECT 1 FROM drafts WHERE status = 'reviewed'")).toBeTruthy();
  });

  it("has tasks in every state including overdue and due-soon", () => {
    const tasks = all<{ status: string; due_at: string; completed_at: string | null }>("SELECT status, due_at, completed_at FROM tasks");
    expect(tasks.length).toBeGreaterThanOrEqual(35);
    for (const s of DEFAULT_TASK_WORKFLOW.states) expect(tasks.some((t) => t.status === s.key)).toBe(true);
    const nowMs = Date.now();
    expect(tasks.some((t) => !t.completed_at && Date.parse(t.due_at) < nowMs)).toBe(true);
    expect(tasks.some((t) => !t.completed_at && Date.parse(t.due_at) > nowMs && Date.parse(t.due_at) < nowMs + 86400000)).toBe(true);
  });

  it("includes in-progress intakes, a Hindi statement, a declined consent and no recordings", () => {
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM statements WHERE case_id IS NULL AND status = 'in_progress'")!.n).toBeGreaterThanOrEqual(2);
    expect(get("SELECT 1 FROM statements WHERE language = 'hi'")).toBeTruthy();
    expect(get("SELECT 1 FROM consent_events WHERE decision = 'declined'")).toBeTruthy();
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM recordings")!.n).toBe(0);
  });

  it("audit summaries never contain statement text", () => {
    const summaries = all<{ summary: string }>("SELECT summary FROM audit_events").map((r) => r.summary);
    const texts = all<{ text: string }>("SELECT text FROM transcript_versions").map((r) => r.text.slice(20, 60));
    for (const t of texts) expect(summaries.some((s) => s.includes(t))).toBe(false);
  });
});
