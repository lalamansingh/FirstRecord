"use client";
/** Create / edit form for Updates (new rules, circulars, advisories, system updates). */
import { useT } from "@/lib/i18n/client";
import { ActionForm, SubmitButton, FieldError, useFieldError, type ActionResult } from "@/components/forms";
import { inputClass } from "@/components/ui";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

export interface BulletinFormValues {
  id?: string;
  title?: string;
  body?: string;
  category?: string;
  stationId?: string | null;
  effectiveDate?: string | null;
  reference?: string | null;
  isPinned?: boolean;
  requiresAck?: boolean;
}

function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-800">
      {children}
      {required && <span className="ml-0.5 text-red-700" aria-hidden>*</span>}
    </label>
  );
}

function useInvalid(name: string) {
  const err = useFieldError(name);
  return { "aria-invalid": !!err, "aria-describedby": err ? `${name}-error` : undefined };
}

export function BulletinForm({
  action,
  values = {},
  categories,
  targets,
  submitLabel,
}: {
  action: Action;
  values?: BulletinFormValues;
  categories: { key: string; label: string }[];
  /** Stations the publisher may target; id null = all stations. */
  targets: { id: string | null; name: string }[];
  submitLabel: string;
}) {
  const tr = useT();
  const titleInv = useInvalid("title");
  const bodyInv = useInvalid("body");
  return (
    <ActionForm action={action} className="space-y-5">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div>
        <Label htmlFor="title" required>{tr("Title")}</Label>
        <input id="title" name="title" required maxLength={200} defaultValue={values.title} className={inputClass} {...titleInv}
          placeholder={tr("e.g. Revised procedure for registering online complaints")} />
        <FieldError name="title" />
        <p className="mt-1 text-xs text-slate-500">{tr("The title appears in every recipient's notifications.")}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="category" required>{tr("Category")}</Label>
          <select id="category" name="category" defaultValue={values.category ?? categories[0]?.key} className={inputClass}>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <FieldError name="category" />
        </div>
        <div>
          <Label htmlFor="stationId" required>{tr("Audience")}</Label>
          <select
            id="stationId"
            name="stationId"
            defaultValue={values.stationId ?? (targets[0]?.id ?? "all")}
            className={inputClass}
            disabled={targets.length === 1}
          >
            {targets.map((t) => (
              <option key={t.id ?? "all"} value={t.id ?? "all"}>{t.id ? t.name : tr("All stations")}</option>
            ))}
          </select>
          {targets.length === 1 && <input type="hidden" name="stationId" value={targets[0].id ?? "all"} />}
          <FieldError name="stationId" />
          {targets.length === 1 && targets[0].id && (
            <p className="mt-1 text-xs text-slate-500">{tr("Station administrators can publish only to their own station.")}</p>
          )}
        </div>
        <div>
          <Label htmlFor="effectiveDate">{tr("Effective date")}</Label>
          <input id="effectiveDate" name="effectiveDate" type="date" defaultValue={values.effectiveDate ?? ""} className={inputClass} />
          <FieldError name="effectiveDate" />
        </div>
        <div>
          <Label htmlFor="reference">{tr("Reference")}</Label>
          <input id="reference" name="reference" maxLength={200} defaultValue={values.reference ?? ""} className={inputClass}
            placeholder={tr("Circular / notification number or link")} />
          <FieldError name="reference" />
        </div>
      </div>

      <div>
        <Label htmlFor="body" required>{tr("Details")}</Label>
        <textarea id="body" name="body" required rows={10} maxLength={8000} defaultValue={values.body} className={inputClass} {...bodyInv} />
        <FieldError name="body" />
        <p className="mt-1 text-xs text-slate-500">
          {tr("Plain text. Line breaks are kept. Summarise the rule for staff and cite the official source in Reference — this is not the official text.")}
        </p>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <legend className="px-1 text-sm font-medium text-slate-800">{tr("Options")}</legend>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input type="checkbox" name="isPinned" defaultChecked={values.isPinned} className="mt-1 h-4 w-4 rounded border-slate-300" />
          <span>
            <span className="font-medium">{tr("Pin to top")}</span>
            <span className="block text-xs text-slate-500">{tr("Pinned updates stay above newer ones until archived.")}</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input type="checkbox" name="requiresAck" defaultChecked={values.requiresAck} className="mt-1 h-4 w-4 rounded border-slate-300" />
          <span>
            <span className="font-medium">{tr("Require acknowledgement")}</span>
            <span className="block text-xs text-slate-500">{tr("Each recipient must confirm they have read and understood it. You can see who hasn't.")}</span>
          </span>
        </label>
      </fieldset>

      <div className="flex justify-end gap-2">
        <SubmitButton pendingLabel={tr("Saving…")}>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
