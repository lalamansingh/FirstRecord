"use client";
/** Staff controls on an online complaint: notes, assignment, verification decisions, conversion to a case. */
import { useState } from "react";
import { ActionForm, SubmitButton, FieldError, type ActionResult } from "@/components/forms";
import { inputClass, cx } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/messages";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

export function NotesForm({ action, id, notes }: { action: Action; id: string; notes: string }) {
  const tr = useT();
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="oc-notes" className="sr-only">{tr("Verification notes")}</label>
      <textarea id="oc-notes" name="notes" rows={4} maxLength={8000} defaultValue={notes} className={inputClass} placeholder={tr("Calls made, documents checked, what was confirmed…")} />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="secondary">{tr("Save notes")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AssignForm({ action, id, current, people }: { action: Action; id: string; current: string | null; people: { id: string; name: string }[] }) {
  const tr = useT();
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-[200px] flex-1">
        <label htmlFor="oc-assignee" className="mb-1.5 block text-xs font-medium text-slate-600">{tr("Verifying officer")}</label>
        <select id="oc-assignee" name="assigneeId" defaultValue={current ?? ""} className={inputClass}>
          <option value="">{tr("Unassigned")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <FieldError name="assigneeId" />
      </div>
      <SubmitButton size="sm" variant="secondary">{tr("Assign")}</SubmitButton>
    </ActionForm>
  );
}

const STATUS_LABELS: Record<string, string> = {
  under_verification: "Mark under verification",
  verified: "Mark verified",
  rejected: "Not accepted",
  duplicate: "Mark as duplicate",
};

export function DecisionForm({
  action,
  id,
  allowed,
  cases,
}: {
  action: Action;
  id: string;
  allowed: string[];
  cases: { id: string; reference: string; title: string }[];
}) {
  const tr = useT();
  const [status, setStatus] = useState(allowed[0] ?? "");
  if (allowed.length === 0) return null;
  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-600">{tr("Decision")}</legend>
        <div className="flex flex-wrap gap-2">
          {allowed.map((s) => (
            <label
              key={s}
              className={cx(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                status === s ? "border-navy-700 bg-navy-50 text-navy-900 " : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
              )}
            >
              <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
              {tr(STATUS_LABELS[s] as MsgKey)}
            </label>
          ))}
        </div>
      </fieldset>
      {status === "duplicate" && (
        <div>
          <label htmlFor="oc-dup" className="mb-1.5 block text-xs font-medium text-slate-600">{tr("Existing case")}</label>
          <select id="oc-dup" name="duplicateCaseId" required defaultValue="" className={inputClass}>
            <option value="" disabled>{tr("Choose the existing case")}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{c.reference} — {c.title}</option>
            ))}
          </select>
          <FieldError name="duplicateCaseId" />
        </div>
      )}
      <div>
        <label htmlFor="oc-public" className="mb-1.5 block text-xs font-medium text-slate-600">
          {tr("Message to the complainant")} {status === "rejected" ? <span className="text-red-700">*</span> : <span className="font-normal text-slate-500">({tr("optional")})</span>}
        </label>
        <textarea id="oc-public" name="publicNote" rows={3} maxLength={1000} required={status === "rejected"} className={inputClass} />
        <p className="mt-1 text-xs text-slate-500">{tr("Shown to the complainant on the tracking page. Do not include internal notes.")}</p>
        <FieldError name="publicNote" />
      </div>
      <div className="flex justify-end">
        <SubmitButton variant={status === "rejected" ? "danger" : "primary"}>{tr("Save decision")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ConvertForm({
  action,
  id,
  defaultTitle,
  people,
  currentUserId,
  canAssignOthers,
}: {
  action: Action;
  id: string;
  defaultTitle: string;
  people: { id: string; name: string }[];
  currentUserId: string;
  canAssignOthers: boolean;
}) {
  const tr = useT();
  const options = canAssignOthers ? people : people.filter((p) => p.id === currentUserId);
  return (
    <ActionForm
      action={action}
      className="space-y-4"
      confirm={tr("A local case will be opened with the complaint as a typed statement marked “submitted online, not yet confirmed in person”. This does not register an FIR.")}
      confirmTitle={tr("Open a case from this complaint?")}
      confirmLabel={tr("Open case")}
    >
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor="oc-title" className="mb-1.5 block text-xs font-medium text-slate-600">{tr("Case title")}</label>
        <input id="oc-title" name="title" required maxLength={200} defaultValue={defaultTitle} className={inputClass} />
        <FieldError name="title" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="oc-priority" className="mb-1.5 block text-xs font-medium text-slate-600">{tr("Priority")}</label>
          <select id="oc-priority" name="priority" defaultValue="medium" className={inputClass}>
            {(["low", "medium", "high", "urgent"] as const).map((p) => (
              <option key={p} value={p}>{tr(({ low: "Low", medium: "Medium", high: "High", urgent: "Urgent" } as const)[p] as MsgKey)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="oc-lead" className="mb-1.5 block text-xs font-medium text-slate-600">{tr("Assign case to")}</label>
          <select id="oc-lead" name="assignedTo" defaultValue={currentUserId} className={inputClass}>
            <option value="">{tr("Unassigned")}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <FieldError name="assignedTo" />
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitButton>{tr("Open case and start work")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
