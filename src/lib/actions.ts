/**
 * Server-action helpers. Server actions get Next.js's built-in Origin check
 * (CSRF protection). Every action must still authenticate + authorize itself.
 */
import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { MsgKey } from "@/lib/i18n/messages";

/**
 * Translate a result's user-facing text into the interface language. Messages are
 * written in English; anything without a translation is shown as written. Outside a
 * request (scripts, tests) the result is returned unchanged.
 */
async function localize<T>(r: ActionResult<T>): Promise<ActionResult<T>> {
  let tr: (s: string) => string;
  try {
    const { getTr } = await import("@/lib/i18n/server");
    const t = await getTr();
    tr = (s) => {
      const req = /^(.+) is required$/.exec(s);
      if (req) return t("{label} is required" as MsgKey, { label: t(req[1] as MsgKey) });
      const max = /^Must be (\d+) characters or fewer$/.exec(s);
      if (max) return t("Must be {n} characters or fewer" as MsgKey, { n: max[1] });
      return t(s as MsgKey);
    };
  } catch {
    return r;
  }
  if (r.ok) return r.message ? { ...r, message: tr(r.message) } : r;
  return {
    ...r,
    error: tr(r.error),
    ...(r.fieldErrors ? { fieldErrors: Object.fromEntries(Object.entries(r.fieldErrors).map(([k, v]) => [k, tr(v)])) } : {}),
  };
}

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const initialActionState: ActionResult = { ok: true };

/**
 * Wrap an action body: converts AppError / ZodError into a user-facing result.
 * Unknown errors are logged (without payload) and reported generically.
 */
export async function runAction<T>(fn: () => Promise<ActionResult<T>> | ActionResult<T>): Promise<ActionResult<T>> {
  return localize(await runActionRaw(fn));
}

async function runActionRaw<T>(fn: () => Promise<ActionResult<T>> | ActionResult<T>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    // Let Next.js redirect()/notFound() propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string") {
      const d = (e as { digest: string }).digest;
      if (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR")) throw e;
    }
    if (e instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = issue.path.join(".") || "_";
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
    }
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    console.error("[action] unexpected error:", (e as Error)?.name, (e as Error)?.message);
    return { ok: false, error: "Something went wrong. The change was not saved. Please try again." };
  }
}

/** Convert FormData to a plain object (multi-value keys become arrays when named `foo[]`). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      ((out[key] as unknown[]) ||= []).push(v);
    } else {
      out[k] = typeof v === "string" ? v : v;
    }
  }
  return out;
}

/** Common zod helpers for form input. */
export const zs = {
  text: (max = 500) => z.string().trim().max(max, `Must be ${max} characters or fewer`),
  required: (label: string, max = 500) =>
    z.string().trim().min(1, `${label} is required`).max(max, `Must be ${max} characters or fewer`),
  optional: (max = 500) =>
    z
      .string()
      .trim()
      .max(max, `Must be ${max} characters or fewer`)
      .optional()
      .transform((v) => (v ? v : null)),
  id: () => z.string().uuid("Invalid identifier"),
  optionalId: () =>
    z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.string().uuid().nullable()),
  priority: () => z.enum(["low", "medium", "high", "urgent"]),
  optionalDate: () =>
    z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Invalid date"),
};
