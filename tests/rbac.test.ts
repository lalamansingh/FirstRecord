import { describe, it, expect, beforeAll } from "vitest";
import { all, get, insert, newId, now } from "@/lib/db";
import { DEFAULT_ROLES, ALL_PERMISSIONS, isPermission } from "@/lib/rbac/permissions";
import {
  can, assertCan, caseVisibilityFilter, canViewCase, assertCaseAccess, canViewStatement,
  taskVisibilityFilter, canViewTask, maskPii,
} from "@/lib/rbac/access";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { seeded, userByEmail } from "./helpers";

const MUTATING = ALL_PERMISSIONS.filter((p) => !/\.view|view_pii|^analytics\.view$/.test(p));

describe("default role grants", () => {
  it("only references known permissions", () => {
    for (const r of Object.values(DEFAULT_ROLES)) for (const p of r.permissions) expect(isPermission(p)).toBe(true);
  });
  it("System Administrator has no statement content or case access by default", () => {
    const p = DEFAULT_ROLES.system_admin.permissions;
    for (const x of ["statement.view", "recording.view", "case.view.assigned", "case.view.station", "case.view.all", "party.view_pii"]) {
      expect(p).not.toContain(x);
    }
  });
  it("Read-only Reviewer has no mutating permissions", () => {
    const p = DEFAULT_ROLES.reviewer.permissions;
    for (const m of MUTATING) expect(p).not.toContain(m);
  });
  it("Records Clerk cannot complete reviews", () => {
    expect(DEFAULT_ROLES.records_clerk.permissions).not.toContain("draft.review");
  });
  it("Officer may review drafts but cannot manage users", () => {
    expect(DEFAULT_ROLES.officer.permissions).toContain("draft.review");
    expect(DEFAULT_ROLES.officer.permissions).not.toContain("user.manage");
  });
  it("no default role can view all stations' cases", () => {
    for (const r of Object.values(DEFAULT_ROLES)) expect(r.permissions).not.toContain("case.view.all");
  });
});

describe("record-level access", () => {
  beforeAll(() => seeded());

  it("officer sees only assigned/created cases", () => {
    const rao = userByEmail("officer.rao@central.example");
    const f = caseVisibilityFilter(rao);
    const visible = all<{ id: string; assigned_to: string; created_by: string }>(
      `SELECT c.id, c.assigned_to, c.created_by FROM cases c WHERE ${f.sql}`, ...f.params,
    );
    expect(visible.length).toBeGreaterThan(0);
    for (const c of visible) expect([c.assigned_to, c.created_by]).toContain(rao.id);
    const other = get<{ id: string }>("SELECT id FROM cases WHERE assigned_to != ? AND created_by != ? LIMIT 1", rao.id, rao.id)!;
    expect(canViewCase(rao, other.id)).toBe(false);
    expect(() => assertCaseAccess(rao, other.id)).toThrow(NotFoundError);
  });

  it("an active support assignment grants visibility", () => {
    const rao = userByEmail("officer.rao@central.example");
    const other = get<{ id: string }>(
      "SELECT c.id FROM cases c WHERE c.assigned_to != ? AND c.created_by != ? AND c.station_id = ? LIMIT 1",
      rao.id, rao.id, rao.stationId!,
    )!;
    insert("case_assignments", { id: newId(), case_id: other.id, user_id: rao.id, assignment_role: "support", assigned_by: rao.id, assigned_at: now(), ended_at: null });
    expect(canViewCase(rao, other.id)).toBe(true);
  });

  it("station-scoped roles see their station only (cross-station denial)", () => {
    const clerk = userByEmail("clerk@central.example");
    const f = caseVisibilityFilter(clerk);
    const stations = all<{ station_id: string }>(`SELECT DISTINCT c.station_id FROM cases c WHERE ${f.sql}`, ...f.params);
    expect(stations.map((s) => s.station_id)).toEqual([clerk.stationId]);
    const foreign = get<{ id: string }>("SELECT id FROM cases WHERE station_id != ? LIMIT 1", clerk.stationId!)!;
    expect(canViewCase(clerk, foreign.id)).toBe(false);
    const das = userByEmail("officer.das@riverside.example");
    const central = get<{ id: string }>("SELECT id FROM cases WHERE station_id = ? LIMIT 1", clerk.stationId!)!;
    expect(canViewCase(das, central.id)).toBe(false);
  });

  it("system administrator sees no cases", () => {
    const sys = userByEmail("sysadmin@firstrecord.example");
    expect(caseVisibilityFilter(sys).sql).toBe("0=1");
    const any = get<{ id: string }>("SELECT id FROM cases LIMIT 1")!;
    expect(canViewCase(sys, any.id)).toBe(false);
  });

  it("assertCan throws ForbiddenError for missing permissions", () => {
    const reviewer = userByEmail("reviewer@central.example");
    expect(can(reviewer, "audit.view")).toBe(true);
    expect(() => assertCan(reviewer, "case.edit")).toThrow(ForbiddenError);
  });

  it("intake statements without a case: creator and station staff only", () => {
    const intake = get<{ id: string; created_by: string; station_id: string }>(
      "SELECT id, created_by, station_id FROM statements WHERE case_id IS NULL AND created_by = ?",
      userByEmail("officer.rao@central.example").id,
    )!;
    expect(canViewStatement(userByEmail("officer.rao@central.example"), intake.id)).toBe(true);
    // Other officer in same station: only assigned-scope, not creator → denied
    expect(canViewStatement(userByEmail("officer.khan@central.example"), intake.id)).toBe(false);
    // Station-scoped clerk with statement.view → allowed
    expect(canViewStatement(userByEmail("clerk@central.example"), intake.id)).toBe(true);
    // Other station → denied; sysadmin (no statement.view) → denied
    expect(canViewStatement(userByEmail("officer.das@riverside.example"), intake.id)).toBe(false);
    expect(canViewStatement(userByEmail("sysadmin@firstrecord.example"), intake.id)).toBe(false);
  });

  it("statements linked to a case follow case access", () => {
    const rao = userByEmail("officer.rao@central.example");
    const mine = get<{ id: string }>("SELECT s.id FROM statements s JOIN cases c ON c.id = s.case_id WHERE c.assigned_to = ? LIMIT 1", rao.id)!;
    const notMine = get<{ id: string }>(
      "SELECT s.id FROM statements s JOIN cases c ON c.id = s.case_id WHERE c.assigned_to != ? AND c.created_by != ? AND NOT EXISTS (SELECT 1 FROM case_assignments a WHERE a.case_id = c.id AND a.user_id = ? AND a.ended_at IS NULL) LIMIT 1",
      rao.id, rao.id, rao.id,
    )!;
    expect(canViewStatement(rao, mine.id)).toBe(true);
    expect(canViewStatement(rao, notMine.id)).toBe(false);
  });

  it("task visibility: own tasks, station scope, accessible cases", () => {
    const rao = userByEmail("officer.rao@central.example");
    const f = taskVisibilityFilter(rao);
    const tasks = all<{ id: string }>(`SELECT t.id FROM tasks t WHERE ${f.sql}`, ...f.params);
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) expect(canViewTask(rao, t.id)).toBe(true);
    const foreign = get<{ id: string }>("SELECT id FROM tasks WHERE station_id != ? LIMIT 1", rao.stationId!)!;
    expect(canViewTask(rao, foreign.id)).toBe(false);
    const sys = userByEmail("sysadmin@firstrecord.example");
    expect(taskVisibilityFilter(sys).sql).toBe("0=1");
  });

  it("masks PII for users without party.view_pii", () => {
    expect(maskPii(userByEmail("reviewer@central.example"), "00000-01234")).toMatch(/restricted/);
    expect(maskPii(userByEmail("officer.rao@central.example"), "00000-01234")).toBe("00000-01234");
  });
});
