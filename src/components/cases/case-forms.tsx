"use client";
import { trDyn } from "@/lib/i18n/dynamic";
import { useT } from "@/lib/i18n/client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { ActionForm, FieldError, SubmitButton, useToast } from "@/components/forms";
import { buttonClass, inputClass, cx } from "@/components/ui";
import {
  addNoteAction,
  assignAction,
  changeStatusAction,
  deleteAttachmentAction,
  dismissDuplicateAction,
  linkCaseAction,
  officialStatusAction,
  requestReviewAction,
  savePartyAction,
  unlinkAction,
  updateDetailsAction,
} from "@/app/(app)/cases/actions";
import { Disclosure } from "./disclosure";
import { toLocalInput } from "@/lib/format";

const label = "mb-1 block text-sm font-medium text-slate-800";

export function CaseStatusForm({ caseId, options }: { caseId: string; options: { key: string; label: string; category: string }[] }) {
  const tr = useT();
  const [to, setTo] = useState("");
  const closing = options.find((o) => o.key === to)?.category === "done";
  if (options.length === 0) return <p className="text-sm text-slate-500">{tr("The workflow allows no further status changes from here.")}</p>;
  return (
    <ActionForm
      action={changeStatusAction}
      resetOnSuccess
      onSuccess={() => setTo("")}
      confirm={closing ? <p>{tr("This will close the case. Open tasks are not closed automatically. The case can be reopened if the workflow allows.")}</p> : undefined}
      confirmTitle={tr("Close this case?")}
      confirmLabel={tr("Close case")}
      className="space-y-3"
    >
      <input type="hidden" name="caseId" value={caseId} />
      <div>
        <label htmlFor="status-to" className={label}>{tr("New status")}</label>
        <select id="status-to" name="to" required value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
          <option value="" disabled>{tr("Choose…")}</option>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <FieldError name="to" />
      </div>
      <div>
        <label htmlFor="status-reason" className={label}>{tr("Reason")} <span className="font-normal text-slate-500">({tr("optional")})</span></label>
        <textarea id="status-reason" name="reason" rows={2} maxLength={500} className={inputClass} />
      </div>
      <SubmitButton size="sm">{tr("Change status")}</SubmitButton>
    </ActionForm>
  );
}

export function AssignForm({ caseId, current, staff }: { caseId: string; current: string | null; staff: { id: string; name: string; role_name: string }[] }) {
  const tr = useT();
  return (
    <ActionForm action={assignAction} className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <div>
        <label htmlFor="assign-to" className={label}>{tr("Lead officer")}</label>
        <select id="assign-to" name="assigneeId" defaultValue={current ?? ""} className={inputClass}>
          <option value="">{tr("Unassigned")}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name} — {trDyn(tr, s.role_name)}</option>
          ))}
        </select>
        <FieldError name="assigneeId" />
        <p className="mt-1 text-xs text-slate-500">{tr("The new assignee is notified. Assignment history is kept.")}</p>
      </div>
      <SubmitButton size="sm">{tr("Save assignment")}</SubmitButton>
    </ActionForm>
  );
}

export function DetailsForm({
  c,
  incidentTypes,
}: {
  c: {
    id: string;
    title: string;
    incident_type: string;
    incident_date: string | null;
    incident_location: string | null;
    summary: string;
    priority: string;
    next_action: string | null;
    next_action_due: string | null;
  };
  incidentTypes: string[];
}) {
  const tr = useT();
  const types = incidentTypes.includes(c.incident_type) ? incidentTypes : [c.incident_type, ...incidentTypes];
  return (
    <ActionForm action={updateDetailsAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="caseId" value={c.id} />
      <div className="sm:col-span-2">
        <label htmlFor="d-title" className={label}>{tr("Title")} <span className="text-red-700" aria-hidden>*</span></label>
        <input id="d-title" name="title" required maxLength={200} defaultValue={c.title} className={inputClass} />
        <FieldError name="title" />
      </div>
      <div>
        <label htmlFor="d-type" className={label}>{tr("Incident type")} <span className="text-red-700" aria-hidden>*</span></label>
        <select id="d-type" name="incident_type" defaultValue={c.incident_type} className={inputClass}>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="d-priority" className={label}>{tr("Priority")}</label>
        <select id="d-priority" name="priority" defaultValue={c.priority} className={inputClass}>
          {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="d-date" className={label}>{tr("Incident date/time")}</label>
        <input id="d-date" name="incident_date" type="datetime-local" defaultValue={toLocalInput(c.incident_date)} className={inputClass} />
        <FieldError name="incident_date" />
      </div>
      <div>
        <label htmlFor="d-loc" className={label}>{tr("Incident location")}</label>
        <input id="d-loc" name="incident_location" maxLength={300} defaultValue={c.incident_location ?? ""} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="d-summary" className={label}>{tr("Incident summary")}</label>
        <textarea id="d-summary" name="summary" rows={4} maxLength={5000} defaultValue={c.summary} className={inputClass} />
        <p className="mt-1 text-xs text-slate-500">{tr("Officer-written summary. The original statement and transcripts are kept separately and are not changed by this field.")}</p>
      </div>
      <div>
        <label htmlFor="d-next" className={label}>{tr("Next action")}</label>
        <input id="d-next" name="next_action" maxLength={300} defaultValue={c.next_action ?? ""} className={inputClass} />
      </div>
      <div>
        <label htmlFor="d-next-due" className={label}>{tr("Next action due")}</label>
        <input id="d-next-due" name="next_action_due" type="datetime-local" defaultValue={toLocalInput(c.next_action_due)} className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton size="sm">{tr("Save details")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function OfficialStatusForm({ caseId, current }: { caseId: string; current: { status: string; system: string | null; reference: string | null } }) {
  const tr = useT();
  const [status, setStatus] = useState(current.status);
  return (
    <ActionForm
      action={officialStatusAction}
      className="space-y-3"
      confirmTitle={tr("Record official status?")}
      confirm={
        <p>
          {tr("Only record \"submitted\" or \"filed\" when you hold a verified response from an authorized external system. FirstRecord has no automatic integration with official systems; this entry is manual and will be audited under your name.")}
        </p>
      }
      confirmLabel={tr("Record status")}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <fieldset>
        <legend className={label}>{tr("Official status")}</legend>
        <div className="space-y-1.5">
          {[
            ["local", "Local record only"],
            ["submitted", "Submitted to external system (awaiting confirmation)"],
            ["filed", "Officially filed — confirmed by external system"],
          ].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-slate-800">
              <input type="radio" name="status" value={v} checked={status === v} onChange={() => setStatus(v)} className="h-4 w-4" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      {status !== "local" && (
        <>
          <div>
            <label htmlFor="o-system" className={label}>{tr("External system name")}</label>
            <input id="o-system" name="system" maxLength={120} defaultValue={current.system ?? ""} className={inputClass} />
            <FieldError name="system" />
          </div>
          <div>
            <label htmlFor="o-ref" className={label}>{tr("Official reference")} {status === "filed" && <span className="text-red-700" aria-hidden>*</span>}</label>
            <input id="o-ref" name="reference" maxLength={120} defaultValue={current.reference ?? ""} className={inputClass} />
            <FieldError name="reference" />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" name="confirmation" value="yes" className="mt-0.5 h-4 w-4" />
            <span>{tr("I confirm this reflects a verified response from an authorized external system.")}</span>
          </label>
          <FieldError name="confirmation" />
        </>
      )}
      <SubmitButton size="sm">{tr("Save official status")}</SubmitButton>
    </ActionForm>
  );
}

export function NoteForm({ caseId }: { caseId: string }) {
  const tr = useT();
  return (
    <ActionForm action={addNoteAction} resetOnSuccess className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <label htmlFor="note-body" className="sr-only">{tr("Internal note")}</label>
      <textarea id="note-body" name="body" rows={3} required maxLength={5000} placeholder={tr("Add an internal note (visible to staff with access to this case)…")} className={inputClass} />
      <FieldError name="body" />
      <SubmitButton size="sm">{tr("Add note")}</SubmitButton>
    </ActionForm>
  );
}

export interface PartyValues {
  id?: string;
  party_role: string;
  name: string;
  age: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export function PartyForm({ caseId, party, canPii, onDone }: { caseId: string; party?: PartyValues; canPii: boolean; onDone?: () => void }) {
  const tr = useT();
  const p = useId();
  return (
    <ActionForm action={savePartyAction} resetOnSuccess={!party} onSuccess={onDone} className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
      <input type="hidden" name="caseId" value={caseId} />
      {party?.id && <input type="hidden" name="partyId" value={party.id} />}
      <div>
        <label htmlFor={`${p}-role`} className={label}>{tr("Role")}</label>
        <select id={`${p}-role`} name="party_role" defaultValue={party?.party_role ?? "witness"} className={inputClass}>
          <option value="complainant">{tr("Complainant")}</option>
          <option value="witness">{tr("Witness")}</option>
          <option value="involved">{tr("Involved party")}</option>
          <option value="other">{tr("Other")}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${p}-name`} className={label}>{tr("Name")} <span className="text-red-700" aria-hidden>*</span></label>
        <input id={`${p}-name`} name="name" required maxLength={200} defaultValue={party?.name} className={inputClass} />
        <FieldError name="name" />
      </div>
      <div>
        <label htmlFor={`${p}-age`} className={label}>{tr("Age")}</label>
        <input id={`${p}-age`} name="age" maxLength={20} defaultValue={party?.age ?? ""} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${p}-gender`} className={label}>{tr("Gender")}</label>
        <input id={`${p}-gender`} name="gender" maxLength={40} defaultValue={party?.gender ?? ""} className={inputClass} />
      </div>
      {canPii ? (
        <>
          <div>
            <label htmlFor={`${p}-phone`} className={label}>{tr("Phone")}</label>
            <input id={`${p}-phone`} name="phone" type="tel" maxLength={40} defaultValue={party?.phone ?? ""} className={inputClass} />
            <FieldError name="phone" />
          </div>
          <div>
            <label htmlFor={`${p}-address`} className={label}>{tr("Address")}</label>
            <input id={`${p}-address`} name="address" maxLength={500} defaultValue={party?.address ?? ""} className={inputClass} />
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500 sm:col-span-2">{tr("Contact details are restricted for your role and cannot be viewed or edited.")}</p>
      )}
      <div className="sm:col-span-2">
        <label htmlFor={`${p}-notes`} className={label}>{tr("Notes")}</label>
        <textarea id={`${p}-notes`} name="notes" rows={2} maxLength={2000} defaultValue={party?.notes ?? ""} className={inputClass} />
        <p className="mt-1 text-xs text-slate-500">{tr("Record only what is needed. Do not record guesses about identity or involvement.")}</p>
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <SubmitButton size="sm">{party ? "Save changes" : "Add party"}</SubmitButton>
        {onDone && <button type="button" className={buttonClass("ghost", "sm")} onClick={onDone}>{tr("Cancel")}</button>}
      </div>
    </ActionForm>
  );
}

export function EditPartyButton({ caseId, party, canPii }: { caseId: string; party: PartyValues; canPii: boolean }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)} aria-label={tr("Edit {name}", { name: party.name })}>
        {tr("Edit")}
      </button>
    );
  }
  return (
    <div className="mt-2 w-full">
      <PartyForm caseId={caseId} party={party} canPii={canPii} onDone={() => setOpen(false)} />
    </div>
  );
}

export function LinkForm({ caseId }: { caseId: string }) {
  const tr = useT();
  return (
    <Disclosure label={tr("Link a case")} size="sm">
      <ActionForm action={linkCaseAction} resetOnSuccess className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input type="hidden" name="caseId" value={caseId} />
        <div>
          <label htmlFor="link-ref" className={label}>{tr("Case reference")}</label>
          <input id="link-ref" name="reference" required maxLength={80} placeholder={tr("e.g. CNT/2026/00012")} className={inputClass} />
          <FieldError name="reference" />
        </div>
        <div>
          <label htmlFor="link-type" className={label}>{tr("Link type")}</label>
          <select id="link-type" name="linkType" className={inputClass}>
            <option value="related">{tr("Related case")}</option>
            <option value="possible_duplicate">{tr("Possible duplicate")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="link-note" className={label}>{tr("Note")}</label>
          <input id="link-note" name="note" maxLength={500} className={inputClass} />
        </div>
        <div className="sm:col-span-3">
          <SubmitButton size="sm">{tr("Link case")}</SubmitButton>
          <span className="ml-2 text-xs text-slate-500">{tr("Linking never merges records.")}</span>
        </div>
      </ActionForm>
    </Disclosure>
  );
}

export function SmallActionButton({
  action,
  fields,
  children,
  confirm,
  confirmTitle,
  variant = "ghost",
  danger,
}: {
  action: Parameters<typeof ActionForm>[0]["action"];
  fields: Record<string, string>;
  children: React.ReactNode;
  confirm?: React.ReactNode;
  confirmTitle?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  danger?: boolean;
}) {
  return (
    <ActionForm action={action} confirm={confirm} confirmTitle={confirmTitle} danger={danger} className="inline">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton size="sm" variant={variant}>{children}</SubmitButton>
    </ActionForm>
  );
}

export function UnlinkButton({ caseId, linkId, reference }: { caseId: string; linkId: string; reference: string }) {
  const tr = useT();
  return (
    <SmallActionButton action={unlinkAction} fields={{ caseId, linkId }} confirm={<p>{tr("Remove the link to {ref}? Both cases remain unchanged.", { ref: reference })}</p>} confirmTitle={tr("Remove link?")}>
      {tr("Unlink")}
    </SmallActionButton>
  );
}

export function DuplicateSuggestionActions({ caseId, otherCaseId }: { caseId: string; otherCaseId: string }) {
  const tr = useT();
  return (
    <div className="flex gap-1">
      <SmallActionButton action={linkCaseAction} fields={{ caseId, linkedCaseId: otherCaseId, linkType: "possible_duplicate" }} variant="secondary">
        {tr("Link as possible duplicate")}
      </SmallActionButton>
      <SmallActionButton action={dismissDuplicateAction} fields={{ caseId, otherCaseId }}>
        {tr("Dismiss")}
      </SmallActionButton>
    </div>
  );
}

export function RequestReviewForm({ caseId, reviewers }: { caseId: string; reviewers: { id: string; name: string; role_name: string }[] }) {
  const tr = useT();
  if (reviewers.length === 0) return <p className="text-sm text-slate-500">{tr("No other staff in this station can review drafts.")}</p>;
  return (
    <ActionForm action={requestReviewAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <div>
        <label htmlFor="rr-reviewer" className={label}>{tr("Reviewer")}</label>
        <select id="rr-reviewer" name="reviewerId" required defaultValue="" className={inputClass}>
          <option value="" disabled>{tr("Choose…")}</option>
          {reviewers.map((r) => <option key={r.id} value={r.id}>{r.name} — {trDyn(tr, r.role_name)}</option>)}
        </select>
        <FieldError name="reviewerId" />
      </div>
      <div>
        <label htmlFor="rr-note" className={label}>{tr("Message")} <span className="font-normal text-slate-500">({tr("optional, stored as an internal note")})</span></label>
        <textarea id="rr-note" name="note" rows={2} maxLength={1000} className={inputClass} />
      </div>
      <SubmitButton size="sm">{tr("Request review")}</SubmitButton>
    </ActionForm>
  );
}

export function AttachmentUploader({ caseId, maxMb, accept }: { caseId: string; maxMb: number; accept: string }) {
  const tr = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const form = e.currentTarget;
        const fd = new FormData(form);
        const file = fd.get("file");
        if (!(file instanceof File) || file.size === 0) {
          setError(tr("Choose a file to upload."));
          return;
        }
        if (file.size > maxMb * 1024 * 1024) {
          setError(`File is too large. Maximum size is ${maxMb} MB.`);
          return;
        }
        fd.set("caseId", caseId);
        setBusy(true);
        try {
          const res = await fetch("/api/attachments", { method: "POST", body: fd, credentials: "same-origin" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(body.error || `Upload failed (${res.status}). The file was not saved.`);
            return;
          }
          toast.show(tr("Attachment uploaded and stored."), "success");
          form.reset();
          router.refresh();
        } catch {
          setError(tr("Network error. The file was not saved. Please try again."));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="att-file" className={label}>{tr("File")}</label>
          <input ref={fileRef} id="att-file" name="file" type="file" required accept={accept} className={cx(inputClass, "!py-1.5")} />
          <p className="mt-1 text-xs text-slate-500">{tr("PDF, JPEG, PNG, WebP, TXT, MP3, WAV or MP4 · max {n} MB. Malware scanning is not configured.", { n: maxMb })}</p>
        </div>
        <div>
          <label htmlFor="att-desc" className={label}>{tr("Description")}</label>
          <input id="att-desc" name="description" maxLength={500} className={inputClass} placeholder={tr("What is this file?")} />
        </div>
      </div>
      <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
        {busy ? tr("Uploading…") : tr("Upload attachment")}
      </button>
    </form>
  );
}

export function DeleteAttachmentForm({ attachmentId, filename }: { attachmentId: string; filename: string }) {
  const tr = useT();
  const id = useId();
  return (
    <Disclosure label={tr("Delete")} size="sm" variant="ghost">
      <ActionForm
        action={deleteAttachmentAction}
        danger
        confirmTitle={tr("Delete attachment?")}
        confirm={<p>{tr("The stored file “{name}” will be permanently removed. Its metadata, checksum and the deletion reason are retained in the audit history.", { name: filename })}</p>}
        confirmLabel={tr("Delete file")}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="attachmentId" value={attachmentId} />
        <div className="min-w-48 flex-1">
          <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">{tr("Reason for deletion")}</label>
          <input id={id} name="reason" required maxLength={500} className={inputClass} />
          <FieldError name="reason" />
        </div>
        <SubmitButton size="sm" variant="danger">{tr("Delete")}</SubmitButton>
      </ActionForm>
    </Disclosure>
  );
}
