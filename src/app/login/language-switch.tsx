"use client";
import { useRef } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { setUiLanguageAction } from "@/app/language-actions";

/** Sign-in page language selector. Submits on change; a button covers no-JS use. */
export function LanguageSwitch({
  current,
  languages,
  label,
  apply,
  variant = "dark",
}: {
  current: string;
  languages: { code: string; native: string }[];
  label: string;
  apply: string;
  /** "dark" for navy surfaces, "light" for white surfaces. */
  variant?: "dark" | "light";
}) {
  const ref = useRef<HTMLFormElement>(null);
  const light = variant === "light";
  const id = light ? "login-lang-light" : "login-lang";
  return (
    <form ref={ref} action={setUiLanguageAction} className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="relative flex items-center">
        <Globe strokeWidth={2} className={`pointer-events-none absolute left-2.5 h-4 w-4 ${light ? "text-[#5b5e66]" : "text-white"}`} aria-hidden />
        <select
          id={id}
          name="lang"
          defaultValue={current}
          onChange={() => ref.current?.requestSubmit()}
          className={
            light
              ? "h-9 appearance-none rounded-full border border-[#e6e4de] bg-white py-1 pl-8 pr-8 text-sm font-medium text-[#111216] hover:bg-[#f5f3f1] focus:border-[#111216] focus:outline-none focus:ring-[3px] focus:ring-[#9df0c4]/60"
              : "h-9 appearance-none rounded-md border border-white/20 bg-transparent py-1 pl-8 pr-8 text-sm font-medium text-white hover:border-white/40 focus:border-white focus:outline-none [&>option]:text-slate-900"
          }
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.native}
            </option>
          ))}
        </select>
        <ChevronDown strokeWidth={2} className={`pointer-events-none absolute right-2.5 h-4 w-4 ${light ? "text-[#5b5e66]" : "text-white"}`} aria-hidden />
      </div>
      <noscript>
        <button type="submit" className="rounded-full border border-[#d7d2cc] px-2 py-1 text-sm text-[#111216]">{apply}</button>
      </noscript>
    </form>
  );
}
