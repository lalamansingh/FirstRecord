/**
 * Server-side sessions: random token in an httpOnly cookie, SHA-256 hash stored
 * in the `sessions` table. Idle timeout 8h, absolute lifetime 12h.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { get, insert, run, now } from "@/lib/db";
import { config } from "@/lib/config";
import { loadAuthUser } from "./users";
import { can, type AuthUser } from "@/lib/rbac/access";
import type { Permission } from "@/lib/rbac/permissions";
import { UnauthenticatedError, ForbiddenError } from "@/lib/errors";

export const SESSION_COOKIE = "fr_session";
const IDLE_MS = 8 * 60 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token + config.sessionSecret).digest("hex");
}

export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, method: "password" | "demo") {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const created = new Date();
  insert("sessions", {
    id: hashToken(token),
    user_id: userId,
    created_at: created.toISOString(),
    last_seen_at: created.toISOString(),
    expires_at: new Date(created.getTime() + ABSOLUTE_MS).toISOString(),
    ip: await requestIp(),
    user_agent: (h.get("user-agent") || "").slice(0, 300),
    auth_method: method,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction && !config.appOrigin.startsWith("http://"),
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run("UPDATE sessions SET revoked_at = ? WHERE id = ?", now(), hashToken(token));
  jar.delete(SESSION_COOKIE);
}

export function revokeUserSessions(userId: string) {
  run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", now(), userId);
}

/** Current user for this request, or null. Memoized per request. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const s = get<{ user_id: string; last_seen_at: string; expires_at: string; revoked_at: string | null }>(
    "SELECT user_id, last_seen_at, expires_at, revoked_at FROM sessions WHERE id = ?",
    id,
  );
  if (!s || s.revoked_at) return null;
  const t = Date.now();
  if (Date.parse(s.expires_at) < t || Date.parse(s.last_seen_at) + IDLE_MS < t) return null;
  // Throttle last_seen writes to once a minute.
  if (t - Date.parse(s.last_seen_at) > 60_000) {
    run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", new Date(t).toISOString(), id);
  }
  const user = loadAuthUser(s.user_id);
  if (!user) return null;
  user.sessionId = id;
  return user;
});

/** For pages/layouts: redirect to sign-in if there is no session. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirect to the access-denied page if the permission is missing. */
export async function requirePagePermission(...anyOf: Permission[]): Promise<AuthUser> {
  const user = await requireUser();
  if (anyOf.length && !anyOf.some((p) => can(user, p))) redirect("/access-denied");
  return user;
}

/** For server actions and API routes: throw instead of redirecting. */
export async function requireActor(...anyOf: Permission[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (anyOf.length && !anyOf.some((p) => can(user, p))) throw new ForbiddenError();
  return user;
}
