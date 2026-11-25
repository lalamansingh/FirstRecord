import { redirect } from "next/navigation";
import { CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getUiLang, UI_LANGS } from "@/lib/i18n/ui-lang";
import { loginStrings } from "@/lib/i18n/login";
import { EXTRA_LOGIN_STRINGS } from "@/lib/i18n/langs";
import { OrgLogo } from "@/components/brand/org-logo";
import { LoginForm } from "./login-form";
import { LanguageSwitch } from "./language-switch";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (EXTRA_LOGIN_STRINGS[await getUiLang()] ?? loginStrings[await getUiLang() as keyof typeof loginStrings] ?? loginStrings.en).signInTitle };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const lang = await getUiLang();
  const t = EXTRA_LOGIN_STRINGS[lang] ?? loginStrings[lang] ?? loginStrings.en;

  const languages = UI_LANGS.map((l) => ({ code: l.code, native: l.native }));

  return (
    <div lang={lang} className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <aside className="on-navy relative bg-[var(--sidebar-bg)] text-white lg:flex lg:min-h-screen lg:flex-col">

        <div className="relative flex items-center justify-between gap-4 px-6 py-5 sm:px-10 lg:px-14 lg:py-8">
          <div className="flex min-w-0 items-center gap-3">
            <OrgLogo size={36} inverted />
            <div className="min-w-0 leading-tight">
              <p className="text-base font-semibold text-white">FirstRecord</p>
              <p className="truncate text-[13px] text-[var(--sidebar-item)]">{t.wordmarkTagline}</p>
            </div>
          </div>
          <div className="lg:hidden">
            <LanguageSwitch current={lang} languages={languages} label={t.language} apply={t.apply} />
          </div>
        </div>

        <section aria-labelledby="intro-title" className="relative px-6 pb-8 sm:px-10 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-14 lg:pb-0">
          <h2 id="intro-title" className="max-w-lg text-[24px] font-semibold leading-tight tracking-[-0.01em] sm:text-[28px] lg:text-[30px]">
            {t.heroTitle}
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--sidebar-item)]">{t.heroBody}</p>
          <ul className="mt-10 hidden max-w-lg space-y-5 border-t border-white/10 pt-8 lg:block">
            {t.points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--sidebar-accent)]" aria-hidden />
                <div>
                  <p className="text-[14px] font-semibold text-white">{p.title}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--sidebar-item)]">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="relative hidden px-14 py-8 lg:block">
          <p className="flex max-w-lg items-start gap-2 text-[13px] leading-relaxed text-[var(--sidebar-label)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t.aiNote}
          </p>
        </div>
      </aside>

      {/* Sign-in panel */}
      <div className="flex min-h-[60vh] flex-col bg-[var(--surface-app)] lg:min-h-screen lg:bg-white">
        <div className="hidden justify-end px-10 py-8 lg:flex">
          <LanguageSwitch current={lang} languages={languages} label={t.language} apply={t.apply} variant="light" />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <section aria-labelledby="signin-title" className="w-full max-w-[420px]">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-6 sm:p-8 lg:border-0 lg:p-0">
              <h1 id="signin-title" className="text-[22px] font-semibold tracking-[-0.01em] text-slate-900">{t.signInTitle}</h1>
              <p className="mt-1 text-sm text-slate-600">{t.signInSubtitle}</p>
              <LoginForm t={{ email: t.email, password: t.password, submit: t.submit, submitting: t.submitting }} />
              <p className="mt-6 border-t border-slate-200 pt-5 text-[13px] leading-relaxed text-slate-600">{t.ssoNote}</p>
            </div>
            <p className="mt-5 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700" role="note">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t.notice}</span>
            </p>
            {/* Points on small screens */}
            <ul className="mt-8 space-y-4 lg:hidden">
              {t.points.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-slate-500" aria-hidden />
                  <div>
                    <p className="text-[14px] font-semibold text-slate-900">{p.title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-slate-600">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-start gap-2 text-[13px] leading-relaxed text-slate-500 lg:hidden">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              {t.aiNote}
            </p>
          </section>
        </main>
        <footer className="border-t border-slate-200 px-5 py-5 sm:px-10">
          <div className="flex flex-col gap-1 text-[12.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>{t.footerLine}</p>
            <p>{t.footerAffiliation}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
