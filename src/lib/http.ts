/** Helpers for API route handlers: origin (CSRF) checks, rate limiting, error mapping. */
import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";

/**
 * Reject state-changing API requests whose Origin does not match this app.
 * Session cookies are SameSite=Lax; this is defence in depth.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin) throw new AppError("Missing Origin header.", 403);
  const allowed = new Set<string>();
  if (config.appOrigin) allowed.add(config.appOrigin.replace(/\/$/, ""));
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (!allowed.has(origin)) throw new AppError("Cross-origin request rejected.", 403);
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Simple in-memory fixed-window rate limiter (per process). */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < t) {
    buckets.set(key, { count: 1, resetAt: t + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: e.status });
  }
  console.error("[api] unexpected error:", (e as Error)?.name, (e as Error)?.message);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
