/** Public layout for online complaint pages (no sign-in). */
import Link from "next/link";
import { getLang, getTr } from "@/lib/i18n/server";
import { UI_LANGS } from "@/lib/i18n/ui-lang";
import { LangProvider } from "@/lib/i18n/client";
import { OrgLogo } from "@/components/brand/org-logo";
import { LanguageSwitch } from "@/app/login/language-switch";

export const dynamic = "force-dynamic";

export default async function ComplaintLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const tr = await getTr();
  return (
    <LangProvider lang={lang}>
      <div lang={lang} className="flex min-h-screen flex-col bg-[#fafaf7]">
        <header className="border-b border-[#e6e4de] bg-white">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
            <Link href="/complaint" className="flex min-w-0 items-center gap-3">
              <OrgLogo size={36} />
              <div className="min-w-0 leading-tight">
                <p className="text-lg font-semibold tracking-[-0.02em] text-[#111216]">
                  FirstRecord
                </p>
                <p className="truncate text-[13px] text-[#5b5e66]">{tr("Online complaint service")}</p>
              </div>
            </Link>
            <LanguageSwitch
              current={lang}
              languages={UI_LANGS.map((l) => ({ code: l.code, native: l.native }))}
              label={tr("Language")}
              apply={tr("Apply")}
              variant="light"
            />
          </div>
          <nav aria-label={tr("Online complaint service")} className="border-t border-[#ebe9e3]">
            <div className="mx-auto flex max-w-5xl gap-1.5 px-5 py-2 sm:px-8">
              <Link href="/complaint" className="rounded-full px-3.5 py-1.5 text-sm font-medium text-[#3a3d44] transition-colors hover:bg-[#e7f6e9] hover:text-[#111216]">
                {tr("File a complaint")}
              </Link>
              <Link href="/complaint/track" className="rounded-full px-3.5 py-1.5 text-sm font-medium text-[#3a3d44] transition-colors hover:bg-[#e7f6e9] hover:text-[#111216]">
                {tr("Track a complaint")}
              </Link>
            </div>
          </nav>
        </header>
        <main id="main" className="flex-1">
          <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">{children}</div>
        </main>
        <footer className="border-t border-[#e6e4de] bg-white">
          <div className="mx-auto max-w-5xl px-5 py-5 text-xs leading-5 text-[#5b5e66] sm:px-8">
            <p>{tr("In an emergency, call 112 immediately. This form is not monitored around the clock.")}</p>
            <p className="mt-1">{tr("Submitting this form does not register an FIR. Police staff verify each complaint and decide the next step.")}</p>
          </div>
        </footer>
      </div>
    </LangProvider>
  );
}
