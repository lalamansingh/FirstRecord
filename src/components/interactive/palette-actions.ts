"use server";
/**
 * Server actions for the command palette. Case search reuses the /search query
 * shape and the same RBAC visibility filter, so the palette can never surface a
 * case the signed-in user could not open from the Search page.
 */
import { getCurrentUser } from "@/lib/auth/session";
import { all } from "@/lib/db";
import { can, caseVisibilityFilter } from "@/lib/rbac/access";

export interface PaletteCase {
  id: string;
  reference: string;
  title: string;
}

export interface PaletteScope {
  cases: boolean;
  newReport: boolean;
  tasks: boolean;
  newTask: boolean;
  records: boolean;
  analytics: boolean;
  online: boolean;
  legal: boolean;
  admin: boolean;
  sosRaise: boolean;
}

/** Which destinations/actions the current user may see in the palette. */
export async function paletteScope(): Promise<PaletteScope | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    cases: can(user, "case.view.assigned") || can(user, "case.view.station") || can(user, "case.view.all"),
    newReport: can(user, "statement.create"),
    tasks: can(user, "task.view"),
    newTask: can(user, "task.manage"),
    records: can(user, "record.view") || can(user, "audit.view"),
    analytics: can(user, "analytics.view"),
    online: can(user, "online.view"),
    legal: can(user, "legal.manage"),
    admin: can(user, "user.manage") || can(user, "role.manage"),
    sosRaise: can(user, "sos.raise"),
  };
}

/** Top 8 cases by reference/title the user can access (min 2 characters). */
export async function paletteSearchCases(query: string): Promise<PaletteCase[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const q = String(query ?? "").trim().slice(0, 100).replace(/[%_]/g, "");
  if (q.length < 2) return [];
  if (!(can(user, "case.view.assigned") || can(user, "case.view.station") || can(user, "case.view.all"))) return [];
  const f = caseVisibilityFilter(user);
  return all<PaletteCase>(
    `SELECT c.id, c.reference, c.title FROM cases c
      WHERE ${f.sql} AND (c.reference LIKE ? OR c.title LIKE ?)
      ORDER BY CASE WHEN c.reference LIKE ? THEN 0 ELSE 1 END, c.updated_at DESC LIMIT 8`,
    ...f.params,
    `%${q}%`,
    `%${q}%`,
    `${q}%`,
  );
}
