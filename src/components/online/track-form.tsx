"use client";
/** Public status lookup: tracking code + phone number → status and the station's note only. */
import { useActionState } from "react";
import { Loader2, SearchX } from "lucide-react";
import { useT, useLang } from "@/lib/i18n/client";
import { trackComplaintAction, type TrackState } from "@/app/complaint/actions";
import { buttonClass, inputClass, cx } from "@/components/ui";

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-[#EFF8FF] text-[#175CD3] ring-[#B2DDFF]",
  under_verification: "bg-amber-50 text-amber-900 ring-amber-200",
  verified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  converted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-red-50 text-red-800 ring-red-200",
  duplicate: "bg-slate-100 text-slate-700 ring-slate-200",
};
const STEPS = ["submitted", "under_verification", "verified", "converted"] as const;

function fmt(iso: string, lang: string) {
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-IN" : `${lang}-IN`, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function TrackForm({ initialCode = "" }: { initialCode?: string }) {
  const tr = useT();
  const lang = useLang();
  const [state, action, pending] = useActionState<TrackState, FormData>(trackComplaintAction, { ok: true });
  const result = state.ok ? state.result : undefined;
  const stepIndex = result ? STEPS.indexOf(result.status as (typeof STEPS)[number]) : -1;

  return (
    <div className="space-y-6">
      <form action={action} className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
        {!state.ok && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 border-l-[3px] border-l-red-600 bg-red-50/80 px-4 py-3 text-sm text-red-900">
            {state.error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="trackingCode" className="mb-1.5 block text-sm font-medium text-slate-800">{tr("Tracking code")}</label>
            <input
              id="trackingCode"
              name="trackingCode"
              required
              maxLength={40}
              defaultValue={initialCode}
              placeholder="FR-ON-XXXXXXXXXX"
              autoCapitalize="characters"
              spellCheck={false}
              className={cx(inputClass, "font-mono uppercase tracking-wide")}
            />
          </div>
          <div>
            <label htmlFor="trackPhone" className="mb-1.5 block text-sm font-medium text-slate-800">{tr("Phone number used")}</label>
            <input id="trackPhone" name="phone" type="tel" required maxLength={20} inputMode="tel" autoComplete="tel" className={inputClass} />
          </div>
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {tr("Check status")}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {state.ok && state.searched && !result && (
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700">
            <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            <p>{tr("No complaint matches this tracking code and phone number. Check both and try again.")}</p>
          </div>
        )}
        {result && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7" aria-labelledby="track-result">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="track-result" className="font-mono text-base font-semibold tracking-wide text-navy-900">{result.trackingCode}</h2>
              <span className={cx("rounded px-2.5 py-1 text-sm font-medium ring-1 ring-inset", STATUS_STYLE[result.status])}>{result.statusLabel}</span>
            </div>
            {stepIndex >= 0 && (
              <ol className="mt-5 grid grid-cols-4 gap-2" aria-label={tr("Progress")}>
                {STEPS.map((s, i) => (
                  <li key={s} className="min-w-0">
                    <div className={cx("h-1.5 rounded-full", i <= stepIndex ? "bg-navy-700" : "bg-slate-200")} />
                    <p className={cx("mt-1.5 truncate text-xs", i <= stepIndex ? "font-medium text-slate-800" : "text-slate-500")}>
                      {tr(({ submitted: "Submitted", under_verification: "Under verification", verified: "Verified", converted: "Case opened" } as const)[s])}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">{tr("Message from the station")}</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-800">{result.publicNoteText}</p>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">{tr("Police station")}</dt>
                <dd className="mt-0.5 text-slate-900">{result.stationName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{tr("Submitted")}</dt>
                <dd className="mt-0.5 text-slate-900">{fmt(result.submittedAt, lang)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{tr("Last updated")}</dt>
                <dd className="mt-0.5 text-slate-900">{fmt(result.updatedAt, lang)}</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              {tr("This is a complaint submission, not a registered FIR.")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
