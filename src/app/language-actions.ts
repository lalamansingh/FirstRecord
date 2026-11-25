"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { run, now } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isUiLang, UI_LANG_COOKIE } from "@/lib/i18n/ui-lang";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";

/** Set the interface language. Works on the sign-in page (cookie only) and when signed in (cookie + saved preference). */
export async function setUiLanguageAction(fd: FormData) {
  const lang = fd.get("lang");
  if (!isUiLang(lang)) return;
  (await cookies()).set(UI_LANG_COOKIE, lang, {
    path: "/",
    maxAge: 365 * 24 * 3600,
    sameSite: "lax",
    httpOnly: true,
    secure: config.isProduction && !config.appOrigin.startsWith("http://"),
  });
  const user = await getCurrentUser();
  if (user) {
    run("UPDATE users SET preferred_language = ?, updated_at = ? WHERE id = ?", lang, now(), user.id);
    audit({ actorId: user.id, action: "user.language_changed", entityType: "user", entityId: user.id, summary: `Interface language set to ${lang}` });
  }
  revalidatePath("/", "layout");
}
