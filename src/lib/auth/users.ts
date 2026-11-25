/** Loading AuthUser objects from the database (no request context needed). */
import { get, parseJson } from "@/lib/db";
import type { AuthUser } from "@/lib/rbac/access";
import { isPermission, type Permission } from "@/lib/rbac/permissions";

interface UserRow {
  id: string;
  email: string;
  name: string;
  badge_number: string | null;
  role_id: string;
  role_key: string;
  role_name: string;
  permissions: string;
  station_id: string | null;
  station_name: string | null;
  station_code: string | null;
  preferred_language: string;
  is_demo: number;
  status: string;
}

export function loadAuthUser(userId: string): AuthUser | null {
  const row = get<UserRow>(
    `SELECT u.id, u.email, u.name, u.badge_number, u.role_id, r.key AS role_key, r.name AS role_name,
            r.permissions, u.station_id, s.name AS station_name, s.code AS station_code,
            u.preferred_language, u.is_demo, u.status
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN stations s ON s.id = u.station_id
      WHERE u.id = ?`,
    userId,
  );
  if (!row || row.status !== "active") return null;
  const perms = parseJson<string[]>(row.permissions, []).filter(isPermission) as Permission[];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    badgeNumber: row.badge_number,
    roleId: row.role_id,
    roleKey: row.role_key,
    roleName: row.role_name,
    stationId: row.station_id,
    stationName: row.station_name,
    stationCode: row.station_code,
    permissions: new Set(perms),
    preferredLanguage: row.preferred_language,
    isDemo: !!row.is_demo,
  };
}
