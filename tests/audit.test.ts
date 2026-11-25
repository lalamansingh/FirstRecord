import { describe, it, expect, beforeAll } from "vitest";
import { get } from "@/lib/db";
import { audit, redactMetadata, recordAccess } from "@/lib/audit";
import { seeded } from "./helpers";

describe("audit logging", () => {
  beforeAll(() => seeded());
  it("redacts content-like keys and truncates long strings", () => {
    const r = redactMetadata({ transcriptText: "secret account", password: "x", caseRef: "A/1", long: "y".repeat(500) });
    expect(r.transcriptText).toBe("[redacted]");
    expect(r.password).toBe("[redacted]");
    expect(r.caseRef).toBe("A/1");
    expect((r.long as string).length).toBeLessThanOrEqual(201);
  });
  it("writes an audit event with redacted metadata", () => {
    audit({ actorId: null, action: "test.event", entityType: "test", entityId: "e1", summary: "Test event", metadata: { body: "content", status: "ok" } });
    const row = get<{ metadata: string; summary: string }>("SELECT metadata, summary FROM audit_events WHERE action = 'test.event'")!;
    expect(JSON.parse(row.metadata)).toEqual({ body: "[redacted]", status: "ok" });
  });
  it("records access events", () => {
    const u = get<{ id: string }>("SELECT id FROM users LIMIT 1")!;
    recordAccess({ userId: u.id, entityType: "statement", entityId: "s1", action: "view" });
    expect(get("SELECT 1 FROM record_access_events WHERE entity_id = 's1'")).toBeTruthy();
  });
});
