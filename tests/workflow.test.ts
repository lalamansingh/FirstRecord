import { describe, it, expect, beforeAll } from "vitest";
import { get, insert, newId, now } from "@/lib/db";
import {
  DEFAULT_CASE_WORKFLOW, DEFAULT_TASK_WORKFLOW, canTransition, assertTransition, formatCaseReference,
  nextCaseReference, validateCaseNumberFormat, getWorkflow, saveWorkflow, getSetting, setSetting, DEFAULT_SETTINGS,
} from "@/lib/domain/workflow";
import { ValidationError } from "@/lib/errors";
import { seeded } from "./helpers";

const wf = { id: "t", ...DEFAULT_CASE_WORKFLOW };

describe("workflow transitions", () => {
  it("allows configured transitions only", () => {
    expect(canTransition(wf, "received", "statement_review")).toBe(true);
    expect(canTransition(wf, "received", "officer_review")).toBe(false);
    expect(canTransition(wf, "received", "received")).toBe(false);
    expect(() => assertTransition(wf, "received", "investigation")).toThrow(ValidationError);
    expect(() => assertTransition(wf, "received", "nonexistent")).toThrow(/Unknown status/);
    expect(() => assertTransition(wf, "officer_review", "investigation")).not.toThrow();
  });
  it("every transition target is a defined state", () => {
    for (const w of [DEFAULT_CASE_WORKFLOW, DEFAULT_TASK_WORKFLOW]) {
      const keys = new Set(w.states.map((s) => s.key));
      for (const [from, tos] of Object.entries(w.transitions)) {
        expect(keys.has(from)).toBe(true);
        for (const t of tos) expect(keys.has(t)).toBe(true);
      }
    }
  });
});

describe("case numbering", () => {
  beforeAll(() => seeded());

  it("formats tokens", () => {
    const d = new Date(2026, 2, 5);
    expect(formatCaseReference("{STATION}/{YYYY}/{SEQ:5}", "ABC", d, 42)).toBe("ABC/2026/00042");
    expect(formatCaseReference("{STATION}-{YY}{MM}-{SEQ}", "X", d, 7)).toBe("X-2603-7");
  });

  it("validates formats", () => {
    expect(validateCaseNumberFormat("{STATION}/{YYYY}/{SEQ:5}")).toBeNull();
    expect(validateCaseNumberFormat("{STATION}/{YYYY}")).toMatch(/SEQ/);
    expect(validateCaseNumberFormat("{SEQ}<script>")).toMatch(/Only/);
    expect(validateCaseNumberFormat("A".repeat(70) + "{SEQ}")).toMatch(/too long/);
  });

  it("increments atomically per station and resets yearly", () => {
    const station = get<{ id: string; code: string }>("SELECT id, code FROM stations LIMIT 1")!;
    const y2030 = new Date(2030, 0, 10);
    const a = nextCaseReference(station.id, y2030);
    const b = nextCaseReference(station.id, y2030);
    expect(a).toBe(`${station.code}/2030/00001`);
    expect(b).toBe(`${station.code}/2030/00002`);
    expect(nextCaseReference(station.id, new Date(2031, 0, 1))).toBe(`${station.code}/2031/00001`);
  });

  it("does not reset when sequence_reset = never", () => {
    const id = newId();
    insert("stations", { id, code: "NEV", name: "Never Reset Demo", case_number_format: "{STATION}-{SEQ:3}", sequence_reset: "never", created_at: now(), updated_at: now() });
    expect(nextCaseReference(id, new Date(2030, 5, 1))).toBe("NEV-001");
    expect(nextCaseReference(id, new Date(2031, 5, 1))).toBe("NEV-002");
  });

  it("produces unique references across many calls", () => {
    const station = get<{ id: string }>("SELECT id FROM stations LIMIT 1")!;
    const refs = new Set(Array.from({ length: 50 }, () => nextCaseReference(station.id, new Date(2032, 1, 1))));
    expect(refs.size).toBe(50);
  });
});

describe("workflow + settings storage", () => {
  beforeAll(() => seeded());
  it("saves a new active workflow", () => {
    const u = get<{ id: string }>("SELECT id FROM users LIMIT 1")!;
    const states = DEFAULT_TASK_WORKFLOW.states.map((s) => (s.key === "blocked" ? { ...s, label: "Waiting" } : s));
    saveWorkflow("task", { name: "Edited", states, transitions: DEFAULT_TASK_WORKFLOW.transitions }, u.id);
    const w = getWorkflow("task");
    expect(w.name).toBe("Edited");
    expect(w.states.find((s) => s.key === "blocked")!.label).toBe("Waiting");
  });
  it("returns defaults for unset settings and persists updates", () => {
    expect(getSetting("languages.enabled")).toEqual(DEFAULT_SETTINGS["languages.enabled"]);
    setSetting("intake.require_contact", true, null);
    expect(getSetting("intake.require_contact")).toBe(true);
  });
});
