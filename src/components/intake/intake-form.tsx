"use client";
import { useT } from "@/lib/i18n/client";
import { ActionForm, SubmitButton, useFieldError, type ActionResult } from "@/components/forms";
import { inputClass } from "@/components/ui";

export interface IntakeDefaults {
  statementId?: string;
  intakeAt: string;
  incidentType: string;
  incidentDate: string;
  incidentLocation: string;
  language: string;
  speakerName: string;
  speakerContact: string;
  speakerAddress: string;
  speakerRole: string;
}

function F({ name, label, required, hint, children }: { name: string; label: string; required?: boolean; hint?: string; children: (p: { id: string; invalid: boolean; describedBy?: string }) => React.ReactNode }) {
  const err = useFieldError(name);
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
        {required && <span className="ml-0.5 text-red-700" aria-hidden>*</span>}
      </label>
      {children({ id, invalid: !!err, describedBy: err ? `${id}-err` : hint ? `${id}-hint` : undefined })}
      {hint && !err && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {err && <p id={`${id}-err`} className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}

export function IntakeForm({
  action,
  defaults,
  stationName,
  officerName,
  incidentTypes,
  languages,
  requireContact,
  submitLabel,
}: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  defaults: IntakeDefaults;
  stationName: string;
  officerName: string;
  incidentTypes: string[];
  languages: { code: string; label: string }[];
  requireContact: boolean;
  submitLabel: string;
}) {
  const tr = useT();
  return (
    <ActionForm action={action} className="space-y-6">
      {defaults.statementId && <input type="hidden" name="statementId" value={defaults.statementId} />}
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-900">{tr("Intake")}</legend>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-800">{tr("Station")}</p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{stationName}</p>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-800">{tr("Capture officer")}</p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{officerName}</p>
        </div>
        <F name="intakeAt" label={tr("Intake date & time")} required>
          {(p) => <input id={p.id} name="intakeAt" type="datetime-local" required defaultValue={defaults.intakeAt} className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </F>
        <F name="language" label={tr("Preferred language")} required hint={tr("Used for the consent notice and read-back.")}>
          {(p) => (
            <select id={p.id} name="language" defaultValue={defaults.language} className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          )}
        </F>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-slate-900">{tr("Incident (as reported)")}</legend>
        <F name="incidentType" label={tr("Incident type")} hint={tr("An intake category only — not a legal classification.")}>
          {(p) => (
            <select id={p.id} name="incidentType" defaultValue={defaults.incidentType} className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy}>
              <option value="">{tr("Not yet known")}</option>
              {incidentTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </F>
        <F name="incidentDate" label={tr("Incident date (if known)")} hint={tr("Leave blank if unsure — details come from the statement.")}>
          {(p) => <input id={p.id} name="incidentDate" type="date" defaultValue={defaults.incidentDate} className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </F>
        <F name="incidentLocation" label={tr("Incident location (if known)")}>
          {(p) => <input id={p.id} name="incidentLocation" maxLength={300} defaultValue={defaults.incidentLocation} className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </F>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-slate-900">{tr("Person giving the statement")}</legend>
        <p className="col-span-full -mt-1 text-xs text-slate-500">{tr("Collect only what is needed. Contact details are visible only to roles permitted to see personal information.")}</p>
        <F name="speakerName" label={tr("Name")}>
          {(p) => <input id={p.id} name="speakerName" maxLength={150} defaultValue={defaults.speakerName} autoComplete="off" className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </F>
        <F name="speakerRole" label={tr("Role in report")}>
          {(p) => (
            <select id={p.id} name="speakerRole" defaultValue={defaults.speakerRole} className={inputClass} aria-invalid={p.invalid}>
              <option value="complainant">{tr("Complainant")}</option>
              <option value="witness">{tr("Witness")}</option>
              <option value="involved">{tr("Involved party")}</option>
              <option value="other">{tr("Other")}</option>
            </select>
          )}
        </F>
        <F name="speakerContact" label={tr("Contact (phone or email)")} required={requireContact}>
          {(p) => <input id={p.id} name="speakerContact" maxLength={150} defaultValue={defaults.speakerContact} autoComplete="off" className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </F>
        <F name="speakerAddress" label={tr("Address")}>
          {(p) => <input id={p.id} name="speakerAddress" maxLength={300} defaultValue={defaults.speakerAddress} autoComplete="off" className={inputClass} aria-invalid={p.invalid} aria-describedby={p.describedBy} />}
        </F>
      </fieldset>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <SubmitButton pendingLabel={tr("Saving…")}>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
