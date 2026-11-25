import { getDb, get } from "@/lib/db";
import { seedBase, type BaseSeedResult } from "@/lib/seed/base";
import { seedDemoContent } from "@/lib/seed/demo-content";
import { loadAuthUser } from "@/lib/auth/users";
import type { AuthUser } from "@/lib/rbac/access";

let cached: BaseSeedResult | null = null;

/** Seed base + fictional demo content once per test file. */
export function seeded(): BaseSeedResult {
  if (cached) return cached;
  getDb();
  cached = seedBase({ demoUsers: true });
  seedDemoContent(cached);
  return cached;
}

export function userByEmail(email: string): AuthUser {
  const base = seeded();
  const u = loadAuthUser(base.users[email]);
  if (!u) throw new Error(`no user ${email}`);
  return u;
}

export function anyCase(where: string, ...params: string[]) {
  return get<{ id: string; station_id: string; assigned_to: string | null }>(
    `SELECT id, station_id, assigned_to FROM cases c WHERE ${where} LIMIT 1`,
    ...params,
  );
}
