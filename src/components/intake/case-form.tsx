"use client";
import { useT } from "@/lib/i18n/client";
import Link from "next/link";
import { ActionForm, SubmitButton, useFieldError, type ActionResult } from "@/components/forms";
import { inputClass } from "@/components/ui";

export function CaseForm({
  action,
  statementId,
  defaults,
  incidentTypes,
  assignees,
  canAssignOthers,
  currentUserId,
  duplicates,
  initialStatusLabel,
}: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  statementId: string;
  defaults: { title: string; incidentType: string };
  incidentTypes: string[];
  assignees: { id: string; name: string; role_name: string }[];
  canAssignOthers: boolean;
  currentUserId: string;
  duplicates: { id: string; reference: string; title: string; reason: string }[];
  initialStatusLabel: string;
}) {
  const tr = useT();
  const options = canAssignOthers ? assignees : assignees.filter((a) => a.id === currentUserId);
  return (
    <ActionForm
      action={action}
      className="space-y-5"
      confirmTitle={tr("Create case?")}
      confirmLabel={tr("Create case")}
      confirm={
        <>
          {tr("A case reference will be issued and the statement, consent record, transcript and drafts will be linked to it. The case starts at")} <strong>{initialStatusLabel}</strong>. {tr("It is a local FirstRecord record only — nothing is submitted to or filed with any official system.")}
        </>
      }
    >
      <input type="hidden" name="statementId" value={statementId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Text name="title" label={tr("Case title")} required defaultValue={defaults.title} hint={tr("Short and neutral, e.g. “Mobile phone reported stolen at market”.")} className="sm:col-span-2" />
        <Sel name="incidentType" label={tr("Incident type")} required defaultValue={defaults.incidentType || ""}>
          <option value="" disabled>{tr("Select…")}</option>
          {incidentTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Sel>
        <Sel name="priority" label={tr("Priority")} required defaultValue="medium">
          <option value="low">{tr("Low")}</option>
          <option value="medium">{tr("Medium")}</option>
          <option value="high">{tr("High")}</option>
          <option value="urgent">{tr("Urgent")}</option>
        </Sel>
        <Sel name="assignedTo" label={tr("Assign to")} defaultValue="" hint={canAssignOthers ? undefined : "Your role can only assign a case to yourself."}>
          <option value="">{tr("Unassigned")}</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {a.role_name}</option>
          ))}
        </Sel>
        <div className="sm:col-span-2">
          <label htmlFor="c-summary" className="mb-1 block text-sm font-medium text-slate-800">{tr("Internal summary (optional)")}</label>
          <textarea id="c-summary" name="summary" rows={3} maxLength={4000} className={inputClass} placeholder={tr("Staff summary for the case workspace. Do not add facts that are not in the statement.")} />
        </div>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">{tr("Possible duplicates")}</legend>
        {duplicates.length === 0 ? (
          <p className="text-sm text-slate-600">{tr("No similar cases found among the cases you can access.")}</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-600">{tr("These cases share some details. Nothing is merged — ticking a case only links it as a possible duplicate for a person to check.")}</p>
            <ul className="space-y-2">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="duplicate" value={d.id} className="mt-1" />
                    <span>
                      <Link href={`/cases/${d.id}`} target="_blank" className="font-medium text-[#1F4E9C] hover:underline">{d.reference}</Link> — {d.title}
                      <span className="block text-xs text-slate-500">{d.reason}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      <div className="flex justify-end border-t border-slate-200 pt-4">
        <SubmitButton pendingLabel={tr("Creating…")}>{tr("Create case")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function Text({ name, label, required, defaultValue, hint, className }: { name: string; label: string; required?: boolean; defaultValue?: string; hint?: string; className?: string }) {
  const err = useFieldError(name);
  return (
    <div className={className}>
      <label htmlFor={`c-${name}`} className="mb-1 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-red-700" aria-hidden>*</span>}
      </label>
      <input id={`c-${name}`} name={name} required={required} maxLength={200} defaultValue={defaultValue} className={inputClass} aria-invalid={!!err} aria-describedby={err ? `c-${name}-err` : hint ? `c-${name}-hint` : undefined} />
      {hint && !err && <p id={`c-${name}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {err && <p id={`c-${name}-err`} className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}

function Sel({ name, label, required, defaultValue, hint, children }: { name: string; label: string; required?: boolean; defaultValue?: string; hint?: string; children: React.ReactNode }) {
  const err = useFieldError(name);
  return (
    <div>
      <label htmlFor={`c-${name}`} className="mb-1 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-red-700" aria-hidden>*</span>}
      </label>
      <select id={`c-${name}`} name={name} required={required} defaultValue={defaultValue} className={inputClass} aria-invalid={!!err}>
        {children}
      </select>
      {hint && !err && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {err && <p className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}
