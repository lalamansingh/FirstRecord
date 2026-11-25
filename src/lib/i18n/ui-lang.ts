/**
 * Interface language for the whole app (sign-in page and signed-in pages).
 * Source of truth: the `fr_lang` cookie (works before sign-in); falls back to the
 * signed-in user's saved preference, then English.
 */
import "server-only";
import { cookies } from "next/headers";

import { LANG_LIST, type LangCode } from "./lang-list";

/** Languages shown in the selector (see lang-list.ts). */
export const UI_LANGS = LANG_LIST.filter((l) => l.enabled);
export type UiLang = LangCode;
export const UI_LANG_COOKIE = "fr_lang";

export function isUiLang(v: unknown): v is UiLang {
  return UI_LANGS.some((l) => l.code === v);
}

export async function getUiLang(userPreference?: string | null): Promise<UiLang> {
  const c = (await cookies()).get(UI_LANG_COOKIE)?.value;
  if (isUiLang(c)) return c;
  if (isUiLang(userPreference)) return userPreference;
  return "en";
}
