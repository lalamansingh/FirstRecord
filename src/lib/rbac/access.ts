/**
 * Record-level authorization. Pure functions over an AuthUser plus DB lookups.
 * Every server operation must call these — hiding UI controls is not enough.
 */
import { get } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { Permission, RoleKey } from "./permissions";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  badgeNumber: string | null;
  roleId: string;
  roleKey: RoleKey | string;
  roleName: string;
  stationId: string | null;
  stationName: string | null;
  stationCode: string | null;
  permissions: Set<Permission>;
  preferredLanguage: string;
  isDemo: boolean;
  sessionId?: string;
}

export function can(user: AuthUser, permission: Permission): boolean {
  return user.permissions.has(permission);
}

export function canAny(user: AuthUser, ...permissions: Permission[]): boolean {
  return permissions.some((p) => user.permissions.has(p));
}

export function assertCan(user: AuthUser, permission: Permission, message?: string) {
  if (!can(user, permission)) throw new ForbiddenError(message);
}

/**
 * SQL predicate restricting cases (aliased `c`) to those the user may view.
 * Returns a fragment and its bound parameters.
 */
export function caseVisibilityFilter(user: AuthUser): { sql: string; params: string[] } {
  if (can(user, "case.view.all")) return { sql: "1=1", params: [] };
  const parts: string[] = [];
  const params: string[] = [];
  if (can(user, "case.view.station") && user.stationId) {
    parts.push("c.station_id = ?");
    params.push(user.stationId);
  }
  if (can(user, "case.view.assigned")) {
    parts.push(
      "(c.assigned_to = ? OR c.created_by = ? OR EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.user_id = ? AND ca.ended_at IS NULL))",
    );
    params.push(user.id, user.id, user.id);
  }
  if (parts.length === 0) return { sql: "0=1", params: [] };
  return { sql: `(${parts.join(" OR ")})`, params };
}

export function canViewCase(user: AuthUser, caseId: string): boolean {
  const f = caseVisibilityFilter(user);
  const row = get(`SELECT 1 AS ok FROM cases c WHERE c.id = ? AND ${f.sql}`, caseId, ...f.params);
  return !!row;
}

/** Throws NotFound (not Forbidden) so that inaccessible case ids are not disclosed. */
export function assertCaseAccess(user: AuthUser, caseId: string) {
  if (!canViewCase(user, caseId)) throw new NotFoundError();
}

/** Case access plus a specific permission (e.g. case.edit). */
export function assertCaseAction(user: AuthUser, caseId: string, permission: Permission) {
  assertCaseAccess(user, caseId);
  assertCan(user, permission);
}

/**
 * Statement visibility:
 *  - linked to a case → case access AND statement.view
 *  - not yet linked (intake in progress) → creator, or statement.view holder in the same station
 *    who also has station/all case scope.
 */
export function canViewStatement(user: AuthUser, statementId: string): boolean {
  const s = get<{ case_id: string | null; created_by: string; station_id: string }>(
    "SELECT case_id, created_by, station_id FROM statements WHERE id = ?",
    statementId,
  );
  if (!s) return false;
  if (!can(user, "statement.view")) return false;
  if (s.case_id) return canViewCase(user, s.case_id);
  if (s.created_by === user.id) return true;
  if (can(user, "case.view.all")) return true;
  return can(user, "case.view.station") && s.station_id === user.stationId;
}

export function assertStatementAccess(user: AuthUser, statementId: string) {
  if (!canViewStatement(user, statementId)) throw new NotFoundError();
}

export function canViewTask(user: AuthUser, taskId: string): boolean {
  if (!can(user, "task.view")) return false;
  const t = get<{ case_id: string | null; assignee_id: string | null; created_by: string; station_id: string }>(
    "SELECT case_id, assignee_id, created_by, station_id FROM tasks WHERE id = ?",
    taskId,
  );
  if (!t) return false;
  if (t.assignee_id === user.id || t.created_by === user.id) return true;
  if (can(user, "task.view.station") && t.station_id === user.stationId) return true;
  if (t.case_id) return canViewCase(user, t.case_id);
  return false;
}

export function assertTaskAccess(user: AuthUser, taskId: string) {
  if (!canViewTask(user, taskId)) throw new NotFoundError();
}

/** SQL predicate for tasks (aliased `t`) visible to the user. */
export function taskVisibilityFilter(user: AuthUser): { sql: string; params: string[] } {
  if (!can(user, "task.view")) return { sql: "0=1", params: [] };
  const cf = caseVisibilityFilter(user);
  const parts = ["t.assignee_id = ?", "t.created_by = ?"];
  const params: string[] = [user.id, user.id];
  if (can(user, "task.view.station") && user.stationId) {
    parts.push("t.station_id = ?");
    params.push(user.stationId);
  }
  parts.push(`(t.case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.id = t.case_id AND ${cf.sql}))`);
  params.push(...cf.params);
  return { sql: `(${parts.join(" OR ")})`, params };
}

/** Mask PII for users without party.view_pii. */
export function maskPii<T extends string | null | undefined>(user: AuthUser, value: T): string | T {
  if (value == null || value === "") return value;
  return can(user, "party.view_pii") ? value : "•••• (restricted)";
}
