"use client";
import { useT } from "@/lib/i18n/client";
/** Client controls for tasks: status select (allowed transitions only), task form, assignee, comment. */
import { useId } from "react";
import { ActionForm, SubmitButton, FieldError, useFieldError, type ActionResult } from "@/components/forms";
import { inputClass } from "@/components/ui";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

export function StatusSelect({
  action,
  taskId,
  current,
  options,
  compact,
  label = "Change status",
}: {
  action: Action;
  taskId: string;
  current: string;
  options: { key: string; label: string }[];
  compact?: boolean;
  label?: string;
}) {
  const tr = useT();
  const id = useId();
  if (options.length === 0) return null;
  return (
    <ActionForm action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={taskId} />
      <label htmlFor={id} className={compact ? "sr-only" : "text-xs font-medium text-slate-600"}>
        {label}
      </label>
      <select id={id} name="status" defaultValue="" required className={`${inputClass} !w-auto !py-1 text-xs`}>
        <option value="" disabled>
          {tr("Move to…")}
        </option>
        {options
          .filter((o) => o.key !== current)
          .map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
      </select>
      <SubmitButton size="sm" variant="secondary">
        {tr("Move")}
      </SubmitButton>
    </ActionForm>
  );
}

function Err({ name }: { name: string }) {
  return <FieldError name={name} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  const err = useFieldError(props.name);
  return <input {...props} className={inputClass} aria-invalid={!!err} aria-describedby={err ? `${props.name}-error` : undefined} />;
}

export interface TaskFormValues {
  id?: string;
  title?: string;
  description?: string;
  taskType?: string;
  priority?: string;
  caseId?: string | null;
  assigneeId?: string | null;
  dueAt?: string;
  remindAt?: string;
}

export function TaskForm({
  action,
  values = {},
  taskTypes,
  cases,
  assignees,
  showAssignee,
  submitLabel,
  lockCase,
}: {
  action: Action;
  values?: TaskFormValues;
  taskTypes: { key: string; label: string }[];
  cases: { id: string; reference: string; title: string }[];
  assignees: { id: string; name: string; role_name: string }[];
  showAssignee: boolean;
  submitLabel: string;
  lockCase?: boolean;
}) {
  const tr = useT();
  return (
    <ActionForm action={action} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-800">
          {tr("Title")}<span className="ml-0.5 text-red-700" aria-hidden>*</span>
        </label>
        <Input id="title" name="title" required maxLength={200} defaultValue={values.title} placeholder={tr("e.g. Collect purchase receipt from complainant")} />
        <Err name="title" />
        <p className="mt-1 text-xs text-slate-500">{tr("Titles appear in notifications — keep them generic and avoid statement details or personal information.")}</p>
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-800">{tr("Description")}</label>
        <textarea id="description" name="description" rows={4} maxLength={4000} defaultValue={values.description} className={inputClass} />
        <Err name="description" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="taskType" className="mb-1 block text-sm font-medium text-slate-800">{tr("Type")}</label>
          <select id="taskType" name="taskType" defaultValue={values.taskType ?? taskTypes[0]?.key} className={inputClass}>
            {taskTypes.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <Err name="taskType" />
        </div>
        <div>
          <label htmlFor="priority" className="mb-1 block text-sm font-medium text-slate-800">{tr("Priority")}</label>
          <select id="priority" name="priority" defaultValue={values.priority ?? "medium"} className={inputClass}>
            <option value="low">{tr("Low")}</option>
            <option value="medium">{tr("Medium")}</option>
            <option value="high">{tr("High")}</option>
            <option value="urgent">{tr("Urgent")}</option>
          </select>
          <Err name="priority" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="caseId" className="mb-1 block text-sm font-medium text-slate-800">{tr("Linked case")}</label>
          {lockCase && values.caseId ? (
            <>
              <input type="hidden" name="caseId" value={values.caseId} />
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {cases.find((c) => c.id === values.caseId)?.reference ?? "Selected case"}
              </p>
            </>
          ) : (
            <select id="caseId" name="caseId" defaultValue={values.caseId ?? ""} className={inputClass}>
              <option value="">{tr("No linked case")}</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>{c.reference} — {c.title}</option>
              ))}
            </select>
          )}
          <Err name="caseId" />
        </div>
        {showAssignee && (
          <div className="sm:col-span-2">
            <label htmlFor="assigneeId" className="mb-1 block text-sm font-medium text-slate-800">{tr("Assignee")}</label>
            <select id="assigneeId" name="assigneeId" defaultValue={values.assigneeId ?? ""} className={inputClass}>
              <option value="">{tr("Unassigned")}</option>
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.role_name}</option>
              ))}
            </select>
            <Err name="assigneeId" />
            <p className="mt-1 text-xs text-slate-500">{tr("Only active staff in the task's station are listed.")}</p>
          </div>
        )}
        <div>
          <label htmlFor="dueAt" className="mb-1 block text-sm font-medium text-slate-800">{tr("Due")}</label>
          <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={values.dueAt} />
          <Err name="dueAt" />
        </div>
        <div>
          <label htmlFor="remindAt" className="mb-1 block text-sm font-medium text-slate-800">{tr("Reminder")}</label>
          <Input id="remindAt" name="remindAt" type="datetime-local" defaultValue={values.remindAt} />
          <Err name="remindAt" />
          <p className="mt-1 text-xs text-slate-500">{tr("An in-app reminder is sent to the assignee at this time (or 24h before the due date).")}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <SubmitButton pendingLabel={tr("Saving…")}>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AssigneeForm({
  action,
  taskId,
  current,
  assignees,
}: {
  action: Action;
  taskId: string;
  current: string | null;
  assignees: { id: string; name: string; role_name: string }[];
}) {
  const tr = useT();
  return (
    <ActionForm action={action} className="flex items-end gap-2">
      <input type="hidden" name="id" value={taskId} />
      <div className="flex-1">
        <label htmlFor="assign-select" className="mb-1 block text-xs font-medium text-slate-600">{tr("Assignee")}</label>
        <select id="assign-select" name="assigneeId" defaultValue={current ?? ""} className={`${inputClass} !py-1.5`}>
          <option value="">{tr("Unassigned")}</option>
          {assignees.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>
      <SubmitButton size="sm" variant="secondary">{tr("Assign")}</SubmitButton>
    </ActionForm>
  );
}

export function CommentForm({ action, taskId }: { action: Action; taskId: string }) {
  const tr = useT();
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-2">
      <input type="hidden" name="id" value={taskId} />
      <label htmlFor="comment-body" className="block text-sm font-medium text-slate-800">{tr("Add a comment")}</label>
      <textarea id="comment-body" name="body" rows={3} maxLength={4000} required className={inputClass} placeholder={tr("Progress update, question or handover note…")} />
      <FieldError name="body" />
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel={tr("Posting…")}>{tr("Post comment")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
