/**
 * User and role administration.
 *
 * Rules enforced here (server-side):
 *  - user.manage is required for user operations; role.manage for role edits.
 *  - Actors bound to a station may only manage users in that station.
 *  - No privilege escalation: an actor may only grant roles / permissions whose
 *    permissions are a subset of their own. (Exception: a System Administrator
 *    may assign the system_admin role.)
 *  - Nobody may change their own role or deactivate/suspend themselves.
 *  - The last active Station Administrator of a station cannot be removed.
 */
import { all, get, insert, newId, now, parseJson, run, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can, type AuthUser } from "@/lib/rbac/access";
import { hashPassword, passwordPolicyError } from "@/lib/auth/password";
import { ALL_PERMISSIONS, isPermission, type Permission } from "@/lib/rbac/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

/** Revoke all active sessions (kept here, not imported from auth/session, so this module works outside Next). */
function revokeUserSessions(userId: string) {
  run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", now(), userId);
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  is_system: number;
  user_count: number;
}

export interface UserListRow {
  id: string;
  email: string;
  name: string;
  badge_number: string | null;
  role_id: string;
  role_key: string;
  role_name: string;
  station_id: string | null;
  station_code: string | null;
  station_name: string | null;
  status: "active" | "suspended" | "deactivated";
  locked_until: string | null;
  last_login_at: string | null;
  must_change_password: number;
  is_demo: number;
  created_at: string;
}

export function listRoles(): RoleRow[] {
  return all<Omit<RoleRow, "permissions"> & { permissions: string }>(
    `SELECT r.id, r.key, r.name, r.description, r.permissions, r.is_system,
            (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.status != 'deactivated') AS user_count
       FROM roles r ORDER BY r.is_system DESC, r.name`,
  ).map((r) => ({ ...r, permissions: parseJson<string[]>(r.permissions, []).filter(isPermission) }));
}

export function getRole(id: string): RoleRow | undefined {
  return listRoles().find((r) => r.id === id);
}

/** Roles the actor is allowed to assign to a user. */
export function assignableRoles(actor: AuthUser): RoleRow[] {
  return listRoles().filter((r) => canGrantRole(actor, r));
}

export function canGrantRole(actor: AuthUser, role: Pick<RoleRow, "key" | "permissions">): boolean {
  if (role.key === "system_admin") return actor.roleKey === "system_admin";
  return role.permissions.every((p) => actor.permissions.has(p));
}

/** Whether the actor's scope covers this user. */
export function canManageUser(actor: AuthUser, target: { station_id: string | null; role_key: string }): boolean {
  if (!can(actor, "user.manage")) return false;
  if (!actor.stationId) return true; // not bound to a station (e.g. System Administrator)
  if (target.role_key === "system_admin") return false;
  return target.station_id === actor.stationId;
}

export function listUsers(
  actor: AuthUser,
  f: { q?: string; role?: string; status?: string; station?: string; page: number; pageSize: number },
) {
  const where: string[] = [];
  const params: string[] = [];
  if (actor.stationId) {
    where.push("u.station_id = ?");
    params.push(actor.stationId);
  } else if (f.station) {
    where.push("u.station_id = ?");
    params.push(f.station);
  }
  if (f.q) {
    where.push("(u.name LIKE ? OR u.email LIKE ? OR u.badge_number LIKE ?)");
    const like = `%${f.q}%`;
    params.push(like, like, like);
  }
  if (f.role) {
    where.push("r.key = ?");
    params.push(f.role);
  }
  if (f.status) {
    where.push("u.status = ?");
    params.push(f.status);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const base = `FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN stations s ON s.id = u.station_id ${w}`;
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n ${base}`, ...params)!.n;
  const rows = all<UserListRow>(
    `SELECT u.id, u.email, u.name, u.badge_number, u.role_id, r.key AS role_key, r.name AS role_name,
            u.station_id, s.code AS station_code, s.name AS station_name, u.status, u.locked_until,
            u.last_login_at, u.must_change_password, u.is_demo, u.created_at
       ${base} ORDER BY u.status = 'active' DESC, u.name LIMIT ? OFFSET ?`,
    ...params,
    f.pageSize,
    (f.page - 1) * f.pageSize,
  );
  return { rows, total };
}

function loadTarget(userId: string) {
  const t = get<UserListRow>(
    `SELECT u.id, u.email, u.name, u.badge_number, u.role_id, r.key AS role_key, r.name AS role_name,
            u.station_id, s.code AS station_code, s.name AS station_name, u.status, u.locked_until,
            u.last_login_at, u.must_change_password, u.is_demo, u.created_at
       FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN stations s ON s.id = u.station_id WHERE u.id = ?`,
    userId,
  );
  if (!t) throw new NotFoundError("User not found.");
  return t;
}

export function getManagedUser(actor: AuthUser, userId: string) {
  const t = loadTarget(userId);
  if (!canManageUser(actor, t)) throw new NotFoundError("User not found.");
  return t;
}

function activeStationAdmins(stationId: string | null, excludeUserId: string): number {
  if (!stationId) return 1;
  return get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.key = 'station_admin' AND u.status = 'active' AND u.station_id = ? AND u.id != ?`,
    stationId,
    excludeUserId,
  )!.n;
}

function assertNotLastStationAdmin(target: UserListRow) {
  if (target.role_key === "station_admin" && target.status === "active" && activeStationAdmins(target.station_id, target.id) === 0) {
    throw new ConflictError("This is the last active Station Administrator for the station. Assign another administrator first.");
  }
}

function resolveRole(actor: AuthUser, roleId: string, currentRoleId?: string) {
  const role = getRole(roleId);
  if (!role) throw new ValidationError("Select a valid role.", { roleId: "Select a valid role." });
  if (role.id !== currentRoleId && !canGrantRole(actor, role)) {
    throw new ForbiddenError("You cannot assign a role that has permissions you do not hold yourself.");
  }
  return role;
}

function resolveStation(actor: AuthUser, stationId: string | null, roleKey: string): string | null {
  if (actor.stationId) {
    if (stationId && stationId !== actor.stationId) throw new ForbiddenError("You can only manage users in your own station.");
    return actor.stationId;
  }
  if (stationId && !get("SELECT 1 FROM stations WHERE id = ?", stationId)) {
    throw new ValidationError("Select a valid station.", { stationId: "Select a valid station." });
  }
  if (!stationId && roleKey !== "system_admin") {
    throw new ValidationError("Station-based roles need a station.", { stationId: "Select a station for this role." });
  }
  return stationId;
}

export function createUser(
  actor: AuthUser,
  input: { name: string; email: string; roleId: string; stationId: string | null; badgeNumber: string | null; password: string },
  ip: string | null,
) {
  if (!can(actor, "user.manage")) throw new ForbiddenError();
  const pwErr = passwordPolicyError(input.password);
  if (pwErr) throw new ValidationError(pwErr, { password: pwErr });
  const role = resolveRole(actor, input.roleId);
  const stationId = resolveStation(actor, input.stationId, role.key);
  if (get("SELECT 1 FROM users WHERE email = ?", input.email)) {
    throw new ValidationError("An account with this email already exists.", { email: "Email already in use." });
  }
  const id = newId();
  const t = now();
  tx(() => {
    insert("users", {
      id,
      email: input.email,
      name: input.name,
      badge_number: input.badgeNumber,
      password_hash: hashPassword(input.password),
      role_id: role.id,
      station_id: stationId,
      status: "active",
      must_change_password: 1,
      created_at: t,
      updated_at: t,
    });
    audit({ actorId: actor.id, action: "user.created", entityType: "user", entityId: id, summary: `Created user account with role ${role.name}`, metadata: { role: role.key, stationId }, ip });
  });
  return id;
}

export function updateUserRoleStation(
  actor: AuthUser,
  userId: string,
  input: { roleId: string; stationId: string | null; name: string; badgeNumber: string | null },
  ip: string | null,
) {
  const target = getManagedUser(actor, userId);
  const role = resolveRole(actor, input.roleId, target.role_id);
  const stationId = resolveStation(actor, input.stationId, role.key);
  const roleChanged = role.id !== target.role_id;
  const stationChanged = stationId !== target.station_id;
  if (userId === actor.id && (roleChanged || stationChanged)) {
    throw new ForbiddenError("You cannot change your own role or station.");
  }
  if ((roleChanged && target.role_key === "station_admin") || stationChanged) assertNotLastStationAdmin(target);
  tx(() => {
    update("users", userId, { role_id: role.id, station_id: stationId, name: input.name, badge_number: input.badgeNumber, updated_at: now() });
    if (roleChanged || stationChanged) revokeUserSessions(userId);
    audit({
      actorId: actor.id,
      action: roleChanged ? "user.role_changed" : "user.updated",
      entityType: "user",
      entityId: userId,
      summary: roleChanged ? `Role changed from ${target.role_name} to ${role.name}` : "User details updated",
      metadata: { fromRole: target.role_key, toRole: role.key, stationChanged },
      ip,
    });
  });
}

export function setUserStatus(actor: AuthUser, userId: string, status: "active" | "suspended" | "deactivated", reason: string, ip: string | null) {
  const target = getManagedUser(actor, userId);
  if (userId === actor.id) throw new ForbiddenError("You cannot change the status of your own account.");
  if (target.status === status) return;
  if (status !== "active") assertNotLastStationAdmin(target);
  tx(() => {
    update("users", userId, { status, updated_at: now(), ...(status === "active" ? { failed_login_count: 0, locked_until: null } : {}) });
    if (status !== "active") revokeUserSessions(userId);
    audit({ actorId: actor.id, action: `user.${status === "active" ? "reactivated" : status}`, entityType: "user", entityId: userId, summary: `Account ${status === "active" ? "reactivated" : status}${reason ? ` — reason: ${reason}` : ""}`, ip });
  });
}

export function resetUserPassword(actor: AuthUser, userId: string, password: string, ip: string | null) {
  const target = getManagedUser(actor, userId);
  const pwErr = passwordPolicyError(password);
  if (pwErr) throw new ValidationError(pwErr, { password: pwErr });
  tx(() => {
    update("users", target.id, { password_hash: hashPassword(password), must_change_password: 1, failed_login_count: 0, locked_until: null, updated_at: now() });
    revokeUserSessions(target.id);
    audit({ actorId: actor.id, action: "user.password_reset", entityType: "user", entityId: target.id, summary: "Password reset by administrator; user must change it at next sign-in", ip });
  });
}

export function unlockUser(actor: AuthUser, userId: string, ip: string | null) {
  const target = getManagedUser(actor, userId);
  update("users", target.id, { failed_login_count: 0, locked_until: null, updated_at: now() });
  audit({ actorId: actor.id, action: "user.unlocked", entityType: "user", entityId: target.id, summary: "Account lockout cleared", ip });
}

export function revokeSessions(actor: AuthUser, userId: string, ip: string | null) {
  const target = getManagedUser(actor, userId);
  revokeUserSessions(target.id);
  audit({ actorId: actor.id, action: "user.sessions_revoked", entityType: "user", entityId: target.id, summary: "All active sessions revoked by administrator", ip });
}

export function activeSessionCount(userId: string): number {
  return get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?",
    userId,
    now(),
  )!.n;
}

/* ---------------- Roles ---------------- */

function assertNoEscalation(actor: AuthUser, perms: Permission[]) {
  const missing = perms.filter((p) => !actor.permissions.has(p));
  if (missing.length) {
    throw new ForbiddenError(`You cannot grant permissions you do not hold yourself: ${missing.join(", ")}.`);
  }
}

export function diffPermissions(before: Permission[], after: Permission[]) {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: after.filter((p) => !b.has(p)),
    removed: before.filter((p) => !a.has(p)),
  };
}

export function updateRolePermissions(actor: AuthUser, roleId: string, permissions: string[], ip: string | null) {
  if (!can(actor, "role.manage")) throw new ForbiddenError();
  const role = getRole(roleId);
  if (!role) throw new NotFoundError("Role not found.");
  const next = [...new Set(permissions.filter(isPermission))].sort(
    (x, y) => ALL_PERMISSIONS.indexOf(x) - ALL_PERMISSIONS.indexOf(y),
  );
  const { added, removed } = diffPermissions(role.permissions, next);
  if (!added.length && !removed.length) return { added, removed };
  assertNoEscalation(actor, added);
  // Removing permissions you don't hold is fine; but don't lock yourself out of role administration.
  if (role.id === actor.roleId && removed.includes("role.manage")) {
    throw new ForbiddenError("You cannot remove role.manage from your own role.");
  }
  if (role.id === actor.roleId && removed.includes("user.manage")) {
    throw new ForbiddenError("You cannot remove user.manage from your own role.");
  }
  tx(() => {
    update("roles", role.id, { permissions: JSON.stringify(next), updated_at: now() });
    audit({
      actorId: actor.id,
      action: "role.permissions_changed",
      entityType: "role",
      entityId: role.id,
      summary: `Permissions changed for role ${role.name}: +${added.length} / -${removed.length}`,
      metadata: { role: role.key, added: added.join(","), removed: removed.join(",") },
      ip,
    });
  });
  return { added, removed };
}

export function createRole(actor: AuthUser, input: { name: string; description: string; permissions: string[] }, ip: string | null) {
  if (!can(actor, "role.manage")) throw new ForbiddenError();
  const perms = [...new Set(input.permissions.filter(isPermission))];
  assertNoEscalation(actor, perms);
  const key = "custom_" + input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  if (key === "custom_") throw new ValidationError("Role name must contain letters or digits.", { name: "Enter a valid name." });
  if (get("SELECT 1 FROM roles WHERE key = ? OR name = ?", key, input.name)) {
    throw new ValidationError("A role with this name already exists.", { name: "Name already in use." });
  }
  const id = newId();
  const t = now();
  tx(() => {
    insert("roles", { id, key, name: input.name, description: input.description, permissions: JSON.stringify(perms), is_system: 0, created_at: t, updated_at: t });
    audit({ actorId: actor.id, action: "role.created", entityType: "role", entityId: id, summary: `Created custom role ${input.name} with ${perms.length} permissions`, metadata: { permissions: perms.join(",") }, ip });
  });
  return id;
}

export function renameRole(actor: AuthUser, roleId: string, input: { name: string; description: string }, ip: string | null) {
  if (!can(actor, "role.manage")) throw new ForbiddenError();
  const role = getRole(roleId);
  if (!role) throw new NotFoundError("Role not found.");
  if (role.is_system) throw new ForbiddenError("Built-in role names cannot be changed. You can still edit their permissions.");
  if (get("SELECT 1 FROM roles WHERE name = ? AND id != ?", input.name, roleId)) {
    throw new ValidationError("A role with this name already exists.", { name: "Name already in use." });
  }
  update("roles", roleId, { name: input.name, description: input.description, updated_at: now() });
  audit({ actorId: actor.id, action: "role.renamed", entityType: "role", entityId: roleId, summary: `Role renamed from ${role.name} to ${input.name}`, ip });
}

export function deleteRole(actor: AuthUser, roleId: string, ip: string | null) {
  if (!can(actor, "role.manage")) throw new ForbiddenError();
  const role = getRole(roleId);
  if (!role) throw new NotFoundError("Role not found.");
  if (role.is_system) throw new ForbiddenError("Built-in roles cannot be deleted.");
  if (get("SELECT 1 FROM users WHERE role_id = ?", roleId)) {
    throw new ConflictError("This role is still assigned to users (including deactivated accounts). Reassign them first.");
  }
  run("DELETE FROM roles WHERE id = ?", roleId);
  audit({ actorId: actor.id, action: "role.deleted", entityType: "role", entityId: roleId, summary: `Deleted custom role ${role.name}`, ip });
}
