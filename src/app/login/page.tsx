import { redirect } from "next/navigation";
import { CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getUiLang, UI_LANGS } from "@/lib/i18n/ui-lang";
import { loginStrings } from "@/lib/i18n/login";
import { EXTRA_LOGIN_STRINGS } from "@/lib/i18n/langs";
import { OrgLogo } from "@/components/brand/org-logo";
import { LoginForm } from "./login-form";
import { LanguageSwitch } from "./language-switch";
import { ReviewPanel } from "./review-panel";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (EXTRA_LOGIN_STRINGS[await getUiLang()] ?? loginStrings[await getUiLang() as keyof typeof loginStrings] ?? loginStrings.en).signInTitle };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const lang = await getUiLang();
  const t = EXTRA_LOGIN_STRINGS[lang] ?? loginStrings[lang] ?? loginStrings.en;
  // Evaluation credentials are shown only when the host sets them (never hard-coded).
  // Falls back to the evaluation account (JUDGE_*) in demo mode, so hosts that only set
  // JUDGE_EMAIL / JUDGE_PASSWORD still show the panel.
  const demoMode = ["1", "true", "yes", "on"].includes((process.env.DEMO_MODE || "").toLowerCase());
  const reviewEmail = process.env.REVIEW_LOGIN_EMAIL || (demoMode ? process.env.JUDGE_EMAIL : undefined);
  const reviewPassword = process.env.REVIEW_LOGIN_PASSWORD || (demoMode ? process.env.JUDGE_PASSWORD : undefined);
  const reviewLogin = reviewEmail && reviewPassword ? { email: reviewEmail, password: reviewPassword } : null;

  const languages = UI_LANGS.map((l) => ({ code: l.code, native: l.native }));

  return (
    <div lang={lang} className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <aside className="relative bg-[#e7f6e9] text-[#111216] lg:flex lg:min-h-screen lg:flex-col">

        <div className="relative flex items-center justify-between gap-4 px-6 py-5 sm:px-10 lg:px-14 lg:py-8">
          <div className="flex min-w-0 items-center gap-3">
            <OrgLogo size={36} />
            <div className="min-w-0 leading-tight">
              <p className="text-base font-semibold tracking-[-0.01em] text-[#111216]">FirstRecord</p>
              <p className="truncate text-[13px] text-[#4e545a]">{t.wordmarkTagline}</p>
            </div>
          </div>
          <div className="lg:hidden">
            <LanguageSwitch current={lang} languages={languages} label={t.language} apply={t.apply} variant="light" />
          </div>
        </div>

        <section aria-labelledby="intro-title" className="relative px-6 pb-8 sm:px-10 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-14 lg:pb-0">
          <h2 id="intro-title" className="max-w-lg text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[38px] lg:text-[46px]">
            {t.heroTitle}
          </h2>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-[#4e545a]">{t.heroBody}</p>
          <ul className="mt-10 hidden max-w-lg space-y-3 lg:block">
            {t.points.map((p) => (
              <li key={p.title} className="flex gap-3 rounded-[14px] border border-[#c9f3dd] bg-white/70 p-4 transition-colors hover:bg-white">
                <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#19c37d]" aria-hidden />
                <div>
                  <p className="text-[14px] font-semibold text-[#111216]">{p.title}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-[#4e545a]">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="relative hidden px-14 py-8 lg:block">
          <p className="flex max-w-lg items-start gap-2 text-[13px] leading-relaxed text-[#4e545a]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t.aiNote}
          </p>
        </div>
      </aside>

      {/* Sign-in panel */}
      <div className="flex min-h-[60vh] flex-col bg-white lg:min-h-screen">
        <div className="hidden justify-end px-10 py-8 lg:flex">
          <LanguageSwitch current={lang} languages={languages} label={t.language} apply={t.apply} variant="light" />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <section aria-labelledby="signin-title" className="w-full max-w-[420px]">
            <div className="rounded-[14px] border border-[var(--border-subtle)] bg-white p-6 sm:p-8 lg:border-0 lg:p-0">
              <h1 id="signin-title" className="text-[30px] font-semibold tracking-[-0.025em] text-[#111216]">{t.signInTitle}</h1>
              <p className="mt-1.5 text-sm text-[#5b5e66]">{t.signInSubtitle}</p>
              <LoginForm t={{ email: t.email, password: t.password, submit: t.submit, submitting: t.submitting, showPassword: t.showPassword ?? loginStrings.en.showPassword, hidePassword: t.hidePassword ?? loginStrings.en.hidePassword }} />
              <p className="mt-6 border-t border-[#ebe9e3] pt-5 text-[13px] leading-relaxed text-[#5b5e66]">{t.ssoNote}</p>
            </div>
            <p className="mt-5 flex items-start gap-2 rounded-[12px] border border-[#ffe2c4] bg-[#fff8f0] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#3a3d44]" role="note">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t.notice}</span>
            </p>
            {reviewLogin && (
              <ReviewPanel
                email={reviewLogin.email}
                password={reviewLogin.password}
                t={{
                  title: t.reviewTitle ?? loginStrings.en.reviewTitle ?? "For hackathon review",
                  id: t.reviewId ?? loginStrings.en.reviewId ?? "Demo ID",
                  password: t.reviewPassword ?? loginStrings.en.reviewPassword ?? "Password",
                  update: t.reviewUpdate ?? loginStrings.en.reviewUpdate ?? "",
                  copy: t.reviewCopy ?? loginStrings.en.reviewCopy ?? "Copy",
                  copied: t.reviewCopied ?? loginStrings.en.reviewCopied ?? "Copied",
                  useDemo: t.reviewUseDemo ?? loginStrings.en.reviewUseDemo ?? "Use demo login",
                }}
              />
            )}
            {/* Points on small screens */}
            <ul className="mt-8 space-y-4 lg:hidden">
              {t.points.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#19c37d]" aria-hidden />
                  <div>
                    <p className="text-[14px] font-semibold text-[#111216]">{p.title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-[#5b5e66]">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-start gap-2 text-[13px] leading-relaxed text-[#5b5e66] lg:hidden">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#5b5e66]" aria-hidden />
              {t.aiNote}
            </p>
          </section>
        </main>
        <footer className="border-t border-[#e6e4de] px-5 py-5 sm:px-10">
          <div className="flex flex-col gap-1 text-[12.5px] text-[#5b5e66] sm:flex-row sm:items-center sm:justify-between">
            <p>{t.footerLine}</p>
            <p>{t.footerAffiliation}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
