"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { get, run, now } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getCurrentUser, requestIp } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/http";
import type { ActionResult } from "@/lib/actions";
import { getUiLang } from "@/lib/i18n/ui-lang";

const ERR = {
  en: {
    rate: "Too many sign-in attempts. Please wait a few minutes and try again.",
    missing: "Enter your email and password.",
    email: "Enter a valid email address",
    password: "Password is required",
    generic: "Email or password is incorrect.",
    locked: "This account is temporarily locked after repeated failed attempts. Try again later or contact your administrator.",
    inactive: "This account is not active. Contact your station administrator.",
  },
  hi: {
    rate: "साइन इन के बहुत अधिक प्रयास हुए हैं। कृपया कुछ मिनट बाद फिर से प्रयास करें।",
    missing: "अपना ईमेल और पासवर्ड दर्ज करें।",
    email: "मान्य ईमेल पता दर्ज करें",
    password: "पासवर्ड आवश्यक है",
    generic: "ईमेल या पासवर्ड गलत है।",
    locked: "बार-बार गलत प्रयासों के कारण यह खाता अस्थायी रूप से लॉक है। बाद में प्रयास करें या अपने व्यवस्थापक से संपर्क करें।",
    inactive: "यह खाता सक्रिय नहीं है। अपने थाना व्यवस्थापक से संपर्क करें।",
  },
} as const;

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z.string().min(1, "Password is required").max(200),
});

interface LoginUserRow {
  id: string;
  password_hash: string | null;
  status: string;
  failed_login_count: number;
  locked_until: string | null;
}

export async function loginAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const ip = (await requestIp()) ?? "unknown";
  const e = ERR[(await getUiLang()) as keyof typeof ERR] ?? ERR.en;
  if (!rateLimit(`login:${ip}`, 20, 15 * 60 * 1000)) {
    return { ok: false, error: e.rate };
  }
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) {
    return { ok: false, error: e.missing, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), String(i.path[0]) === "email" ? e.email : e.password])) };
  }
  const { email, password } = parsed.data;
  const user = get<LoginUserRow>(
    "SELECT id, password_hash, status, failed_login_count, locked_until FROM users WHERE email = ?",
    email,
  );
  const generic = e.generic;
  if (!user) {
    verifyPassword(password, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86)); // equalize timing
    audit({ actorId: null, action: "auth.login_failed", entityType: "auth", summary: "Failed sign-in for unknown account", ip });
    return { ok: false, error: generic };
  }
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    audit({ actorId: user.id, action: "auth.login_locked", entityType: "user", entityId: user.id, summary: "Sign-in attempted on locked account", ip });
    return { ok: false, error: e.locked };
  }
  if (!verifyPassword(password, user.password_hash)) {
    const count = user.failed_login_count + 1;
    const lock = count >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    run("UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?", lock ? 0 : count, lock, user.id);
    audit({
      actorId: user.id,
      action: lock ? "auth.account_locked" : "auth.login_failed",
      entityType: "user",
      entityId: user.id,
      summary: lock ? `Account locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED} failed attempts` : "Failed sign-in (wrong password)",
      ip,
    });
    return { ok: false, error: generic };
  }
  if (user.status !== "active") {
    audit({ actorId: user.id, action: "auth.login_denied", entityType: "user", entityId: user.id, summary: `Sign-in denied: account ${user.status}`, ip });
    return { ok: false, error: e.inactive };
  }
  run("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?", now(), user.id);
  await createSession(user.id, "password");
  audit({ actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, summary: "Signed in with password", ip });
  redirect("/");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) audit({ actorId: user.id, action: "auth.logout", entityType: "user", entityId: user.id, summary: "Signed out" });
  await destroySession();
  redirect("/login");
}
