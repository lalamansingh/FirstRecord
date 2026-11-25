import { describe, it, expect, beforeAll } from "vitest";
import { getDb, runMigrations, insert, run, get, newId, now, tx } from "@/lib/db";
import { seeded } from "./helpers";

describe("database migrations", () => {
  it("applies migrations once and is idempotent", () => {
    const db = getDb();
    expect(runMigrations(db)).toEqual([]); // already applied on open
    const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM schema_migrations")!.n;
    expect(n).toBeGreaterThan(0);
    expect(runMigrations(db)).toEqual([]);
  });

  it("enforces foreign keys", () => {
    expect(() =>
      insert("case_notes", { id: newId(), case_id: "missing", author_id: "missing", body: "x", created_at: now() }),
    ).toThrow();
  });

  it("rolls back a failed transaction", () => {
    const before = get<{ n: number }>("SELECT COUNT(*) AS n FROM settings")!.n;
    expect(() =>
      tx(() => {
        run("INSERT INTO settings (key, value, updated_at) VALUES ('t.rollback', '1', ?)", now());
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM settings")!.n).toBe(before);
  });
});

describe("append-only / immutable tables", () => {
  beforeAll(() => seeded());

  it("blocks UPDATE and DELETE on audit_events", () => {
    const row = get<{ id: string }>("SELECT id FROM audit_events LIMIT 1")!;
    expect(row).toBeTruthy();
    expect(() => run("UPDATE audit_events SET summary = 'x' WHERE id = ?", row.id)).toThrow(/append-only/);
    expect(() => run("DELETE FROM audit_events WHERE id = ?", row.id)).toThrow(/append-only/);
  });

  it("blocks UPDATE on consent_events", () => {
    const row = get<{ id: string }>("SELECT id FROM consent_events LIMIT 1")!;
    expect(row).toBeTruthy();
    expect(() => run("UPDATE consent_events SET decision = 'granted' WHERE id = ?", row.id)).toThrow(/append-only/);
  });

  it("blocks UPDATE on transcript_versions and draft_versions", () => {
    const tv = get<{ id: string }>("SELECT id FROM transcript_versions LIMIT 1")!;
    const dv = get<{ id: string }>("SELECT id FROM draft_versions LIMIT 1")!;
    expect(() => run("UPDATE transcript_versions SET text = 'changed' WHERE id = ?", tv.id)).toThrow(/immutable/);
    expect(() => run("UPDATE draft_versions SET fields = '{}' WHERE id = ?", dv.id)).toThrow(/immutable/);
  });
});
