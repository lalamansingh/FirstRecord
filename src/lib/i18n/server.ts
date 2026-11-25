/** Server-side translator for the current request (cookie → user preference → English). */
import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getUiLang } from "./ui-lang";
import { translator } from "./messages";

export const getTr = cache(async () => {
  const user = await getCurrentUser();
  return translator(await getUiLang(user?.preferredLanguage));
});

export const getLang = cache(async () => {
  const user = await getCurrentUser();
  return getUiLang(user?.preferredLanguage);
});
