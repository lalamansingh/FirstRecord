"use client";
/** Client-side access to the interface language chosen in the header selector. */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translator, type Lang, type Tr } from "./messages";

const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): Tr {
  const lang = useContext(LangContext);
  return useMemo(() => translator(lang), [lang]);
}
