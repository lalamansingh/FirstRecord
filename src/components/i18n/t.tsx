"use client";
/** Inline translated text for server-safe components (reads the language from LangProvider). */
import { useT } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/messages";

export function T({ k, vars }: { k: MsgKey; vars?: Record<string, string | number> }) {
  return <>{useT()(k, vars)}</>;
}
