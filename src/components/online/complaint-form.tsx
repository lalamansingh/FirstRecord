"use client";
/** Public online complaint form (no sign-in). Shows the tracking code on success. */
import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { submitComplaintAction, type SubmitState } from "@/app/complaint/actions";
import { buttonClass, inputClass, cx } from "@/components/ui";

function FieldBlock({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const tr = useT();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
        {required ? (
          <>
            <span className="ml-0.5 text-red-700" aria-hidden>*</span>
            <span className="sr-only"> ({tr("required")})</span>
          </>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-slate-500">({tr("optional")})</span>
        )}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function ComplaintForm({
  stations,
  incidentTypes,
  language,
}: {
  stations: { id: string; name: string }[];
  incidentTypes: { value: string; label: string }[];
  language: string;
}) {
  const tr = useT();
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitComplaintAction, { ok: true });
  const [copied, setCopied] = useState(false);
  const fe = !state.ok ? (state.fieldErrors ?? {}) : {};
  const v = !state.ok ? (state.values ?? {}) : {};
  const aria = (name: string) => ({ "aria-invalid": !!fe[name], "aria-describedby": fe[name] ? `${name}-error` : undefined });

  if (state.ok && state.trackingCode) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-white p-6 sm:p-8" role="status">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-navy-900">{tr("Your complaint has been submitted")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {tr("Save this tracking code. You will need it, with your phone number, to check the status.")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="rounded-full border border-[#c9f3dd] bg-[#e7f6e9] px-4 py-2 font-mono text-lg font-semibold tracking-wider text-navy-900">
                {state.trackingCode}
              </code>
              <button
                type="button"
                className={buttonClass("secondary", "sm")}
                onClick={() => {
                  navigator.clipboard?.writeText(state.trackingCode ?? "").then(() => setCopied(true), () => {});
                }}
              >
                <Copy className="h-4 w-4" aria-hidden />
                {copied ? tr("Copied") : tr("Copy code")}
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              {tr("This is a complaint submission, not a registered FIR.")} {tr("Police staff will verify it and contact you.")}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/complaint/track" className={buttonClass("primary")}>
                {tr("Track a complaint")}
              </Link>
              <a href="/complaint" className={buttonClass("ghost")}>
                {tr("File another complaint")}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form key={JSON.stringify(v)} action={action} className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7" noValidate={false}>
      {!state.ok && (
        <div role="alert" className="mb-5 rounded-lg border border-red-200 border-l-[3px] border-l-red-600 bg-red-50/80 px-4 py-3 text-sm text-red-900">
          {state.error}
        </div>
      )}
      <input type="hidden" name="language" value={language} />
      {/* Honeypot — hidden from people and assistive technology. */}
      <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset>
        <legend className="text-[15px] font-semibold text-navy-900">{tr("Your details")}</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <FieldBlock id="complainantName" label={tr("Full name")} required error={fe.complainantName}>
            <input id="complainantName" name="complainantName" defaultValue={v.complainantName} required maxLength={120} autoComplete="name" className={inputClass} {...aria("complainantName")} />
          </FieldBlock>
          <FieldBlock id="phone" label={tr("Phone number")} required error={fe.phone} hint={tr("Staff will call this number to verify the complaint.")}>
            <input id="phone" name="phone" defaultValue={v.phone} type="tel" required maxLength={20} autoComplete="tel" inputMode="tel" className={inputClass} {...aria("phone")} />
          </FieldBlock>
          <FieldBlock id="email" label={tr("Email")} error={fe.email}>
            <input id="email" name="email" defaultValue={v.email} type="email" maxLength={200} autoComplete="email" className={inputClass} {...aria("email")} />
          </FieldBlock>
          <FieldBlock id="address" label={tr("Address")} error={fe.address}>
            <input id="address" name="address" defaultValue={v.address} maxLength={500} autoComplete="street-address" className={inputClass} {...aria("address")} />
          </FieldBlock>
        </div>
      </fieldset>

      <fieldset className="mt-7 border-t border-slate-100 pt-6">
        <legend className="text-[15px] font-semibold text-navy-900">{tr("What happened")}</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <FieldBlock id="stationId" label={tr("Police station")} required error={fe.stationId}>
            <select id="stationId" name="stationId" required defaultValue={v.stationId ?? ""} className={inputClass} {...aria("stationId")}>
              <option value="" disabled>
                {tr("Choose a police station")}
              </option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock id="incidentType" label={tr("Type of incident")} required error={fe.incidentType}>
            <select id="incidentType" name="incidentType" required defaultValue={v.incidentType ?? ""} className={inputClass} {...aria("incidentType")}>
              <option value="" disabled>
                {tr("Choose the type of incident")}
              </option>
              {incidentTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock id="incidentDate" label={tr("Date of incident")} error={fe.incidentDate}>
            <input id="incidentDate" name="incidentDate" defaultValue={v.incidentDate} type="date" max={new Date().toISOString().slice(0, 10)} className={inputClass} {...aria("incidentDate")} />
          </FieldBlock>
          <FieldBlock id="incidentLocation" label={tr("Where it happened")} required error={fe.incidentLocation}>
            <input id="incidentLocation" name="incidentLocation" defaultValue={v.incidentLocation} required maxLength={300} className={inputClass} {...aria("incidentLocation")} />
          </FieldBlock>
          <FieldBlock
            id="description"
            label={tr("Describe what happened")}
            required
            error={fe.description}
            hint={tr("In your own words: what happened, when, who was involved, and anything taken or damaged.")}
            className="sm:col-span-2"
          >
            <textarea id="description" name="description" defaultValue={v.description} required minLength={30} maxLength={8000} rows={8} className={inputClass} {...aria("description")} />
          </FieldBlock>
        </div>
      </fieldset>

      <div className="mt-7 border-t border-slate-100 pt-6">
        <label className={cx("flex items-start gap-3 rounded-lg border p-4 text-sm leading-6", fe.consent ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-slate-50")}>
          <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0 accent-[#111216]" aria-describedby={fe.consent ? "consent-error" : undefined} />
          <span className="text-slate-800">
            {tr("I confirm the information is true to the best of my knowledge. I understand this is a complaint submission, not a registered FIR, and that police staff will verify it and may contact me.")}
          </span>
        </label>
        {fe.consent && <p id="consent-error" className="mt-1 text-xs font-medium text-red-700">{fe.consent}</p>}
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {tr("Your details are used only to handle this complaint. Do not include passwords, bank PINs or one-time codes.")}
        </p>
        <div className="mt-5 flex justify-end">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {pending ? tr("Submitting…") : tr("Submit complaint")}
          </button>
        </div>
      </div>
    </form>
  );
}
