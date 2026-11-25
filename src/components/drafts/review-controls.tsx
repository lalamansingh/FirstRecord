"use client";
import { useState } from "react";
import { Check, X, Pencil, MessageSquare, CheckCheck } from "lucide-react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/forms";
import { buttonClass, inputClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { trDyn } from "@/lib/i18n/dynamic";
import {
  clarificationAction,
  commentAction,
  decideFieldAction,
  markReviewedAction,
  requestReviewAction,
  resolveCommentAction,
  saveDraftAction,
} from "@/app/(app)/statements/actions";

export function FieldDecision({ draftId, fieldKey, label }: { draftId: string; fieldKey: string; label: string }) {
  const tr = useT();
  const name = trDyn(tr, label);
  return (
    <div className="flex gap-1.5">
      <ActionForm action={decideFieldAction}>
        <input type="hidden" name="draftId" value={draftId} />
        <input type="hidden" name="fieldKey" value={fieldKey} />
        <input type="hidden" name="decision" value="accepted" />
        <SubmitButton variant="secondary" size="sm">
          <Check className="h-3.5 w-3.5" aria-hidden /> {tr("Accept")}<span className="sr-only"> {tr("suggestion for {label}", { label: name })}</span>
        </SubmitButton>
      </ActionForm>
      <ActionForm
        action={decideFieldAction}
        confirmTitle={tr("Reject suggestion for “{label}”?", { label: name })}
        confirmLabel={tr("Reject suggestion")}
        danger
        confirm={tr("The suggested value will be cleared and the field marked “Needs confirmation”. The suggestion remains visible in version history.")}
      >
        <input type="hidden" name="draftId" value={draftId} />
        <input type="hidden" name="fieldKey" value={fieldKey} />
        <input type="hidden" name="decision" value="rejected" />
        <SubmitButton variant="secondary" size="sm">
          <X className="h-3.5 w-3.5" aria-hidden /> {tr("Reject")}<span className="sr-only"> {tr("suggestion for {label}", { label: name })}</span>
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

export function AcceptAllPending({ draftId, count }: { draftId: string; count: number }) {
  const tr = useT();
  return (
    <ActionForm
      action={decideFieldAction}
      confirmTitle={tr("Accept all remaining suggestions?")}
      confirmLabel={tr("Accept {n} suggestion(s)", { n: count })}
      confirm={tr("Only accept suggestions you have checked against the source statement. Each accepted value stays linked to its source quotes.")}
    >
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="fieldKey" value="__all__" />
      <input type="hidden" name="decision" value="accepted" />
      <SubmitButton variant="secondary" size="sm">
        <CheckCheck className="h-3.5 w-3.5" aria-hidden /> {tr("Accept all checked ({n})", { n: count })}
      </SubmitButton>
    </ActionForm>
  );
}

export function FieldEditor({ draftId, fieldKey, label, kind, value, lang }: { draftId: string; fieldKey: string; label: string; kind: string; value: string; lang: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const name = trDyn(tr, label);
  if (!open) {
    return (
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" aria-hidden /> {tr("Edit")}<span className="sr-only"> {name}</span>
      </button>
    );
  }
  return (
    <ActionForm action={saveDraftAction} onSuccess={() => setOpen(false)} className="mt-3 w-full space-y-2">
      <input type="hidden" name="draftId" value={draftId} />
      <label htmlFor={`edit-${fieldKey}`} className="block text-xs font-medium text-slate-700">
        {name}
        {kind === "list" && <span className="font-normal text-slate-500"> — {tr("one item per line")}</span>}
      </label>
      <textarea id={`edit-${fieldKey}`} name={`field:${fieldKey}`} lang={lang} defaultValue={value} rows={kind === "text" ? 2 : 6} className={inputClass} autoFocus />
      <label htmlFor={`sum-${fieldKey}`} className="sr-only">{tr("Reason for change")}</label>
      <input id={`sum-${fieldKey}`} name="changeSummary" maxLength={300} placeholder={tr("Reason for change (recorded in version history)")} className={inputClass} />
      <p className="text-xs text-slate-500">{tr("Keep the speaker's words. Use “Not provided” or “Needs confirmation” rather than guessing.")}</p>
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel={tr("Saving…")}>{tr("Save as new version")}</SubmitButton>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(false)}>{tr("Cancel")}</button>
      </div>
    </ActionForm>
  );
}

export function CommentToggle({ draftId, fieldKey, label }: { draftId: string; fieldKey: string | null; label: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const name = trDyn(tr, label);
  if (!open) {
    return (
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)}>
        <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {tr("Comment")}<span className="sr-only"> {tr("on {label}", { label: name })}</span>
      </button>
    );
  }
  return (
    <ActionForm action={commentAction} onSuccess={() => setOpen(false)} resetOnSuccess className="mt-3 w-full space-y-2">
      <input type="hidden" name="draftId" value={draftId} />
      {fieldKey && <input type="hidden" name="fieldKey" value={fieldKey} />}
      <CommentBody id={fieldKey ?? "general"} label={tr("Comment on {label}", { label: name })} />
      <div className="flex gap-2">
        <SubmitButton size="sm">{tr("Add comment")}</SubmitButton>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(false)}>{tr("Cancel")}</button>
      </div>
    </ActionForm>
  );
}

function CommentBody({ id, label }: { id: string; label: string }) {
  const tr = useT();
  const err = useFieldError("body");
  return (
    <div>
      <label className="sr-only" htmlFor={`cb-${id}`}>{label}</label>
      <textarea id={`cb-${id}`} name="body" rows={2} maxLength={4000} className={inputClass} placeholder={tr("Review comment (no need to repeat statement content)")} aria-invalid={!!err} />
      {err && <p className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}

export function ResolveComment({ draftId, commentId }: { draftId: string; commentId: string }) {
  const tr = useT();
  return (
    <ActionForm action={resolveCommentAction}>
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="commentId" value={commentId} />
      <SubmitButton variant="ghost" size="sm">{tr("Resolve")}</SubmitButton>
    </ActionForm>
  );
}

export function RequestReviewButton({ draftId }: { draftId: string }) {
  const tr = useT();
  return (
    <ActionForm action={requestReviewAction}>
      <input type="hidden" name="draftId" value={draftId} />
      <SubmitButton variant="secondary">{tr("Request review")}</SubmitButton>
    </ActionForm>
  );
}

export function ClarificationForm({ draftId }: { draftId: string }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(true)}>{tr("Request clarification")}</button>;
  return (
    <ActionForm action={clarificationAction} onSuccess={() => setOpen(false)} className="w-full space-y-2">
      <input type="hidden" name="draftId" value={draftId} />
      <ClarificationText />
      <div className="flex gap-2">
        <SubmitButton size="sm">{tr("Send clarification request")}</SubmitButton>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(false)}>{tr("Cancel")}</button>
      </div>
    </ActionForm>
  );
}

function ClarificationText() {
  const tr = useT();
  const err = useFieldError("comment");
  return (
    <div>
      <label htmlFor="clar" className="mb-1 block text-sm font-medium text-slate-800">{tr("What needs clarification?")}</label>
      <textarea id="clar" name="comment" rows={3} maxLength={4000} className={inputClass} aria-invalid={!!err} />
      {err && <p className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}

export function MarkReviewedForm({ draftId, version, needsConfirmation, disabledReason }: { draftId: string; version: number; needsConfirmation: string[]; disabledReason: string | null }) {
  const tr = useT();
  return (
    <ActionForm
      action={markReviewedAction}
      className="w-full space-y-3"
      confirmTitle={tr("Mark draft version {n} reviewed?", { n: version })}
      confirmLabel={tr("Mark reviewed")}
      confirm={
        <>
          {tr("You confirm that you have checked this draft against the source statement. Marking it reviewed is an")} <strong>{tr("internal review only")}</strong>:{" "}
          {tr("it does not file an FIR or submit anything to an official system. Any later edit returns the draft to “not reviewed”.")}
        </>
      }
    >
      <input type="hidden" name="draftId" value={draftId} />
      <input type="hidden" name="expectedVersion" value={version} />
      {needsConfirmation.length > 0 && <NeedsConfirmationBox fields={needsConfirmation} />}
      <div>
        <label htmlFor="rev-comment" className="mb-1 block text-sm font-medium text-slate-800">{tr("Review note (optional)")}</label>
        <textarea id="rev-comment" name="comment" rows={2} maxLength={4000} className={inputClass} />
      </div>
      {disabledReason && <p className="text-xs font-medium text-amber-800">{disabledReason}</p>}
      <SubmitButton disabled={!!disabledReason} pendingLabel={tr("Saving…")}>{tr("Mark reviewed")}</SubmitButton>
    </ActionForm>
  );
}

function NeedsConfirmationBox({ fields }: { fields: string[] }) {
  const tr = useT();
  const err = useFieldError("confirmNeedsConfirmation");
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">{tr("Still marked “Needs confirmation”:")} {fields.map((f) => trDyn(tr, f)).join(", ")}</p>
      <label className="mt-2 flex items-start gap-2">
        <input type="checkbox" name="confirmNeedsConfirmation" className="mt-0.5" aria-invalid={!!err} />
        <span>{tr("I confirm the draft may be marked reviewed with these details still outstanding. They remain flagged in the draft.")}</span>
      </label>
      {err && <p className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}
