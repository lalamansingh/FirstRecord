"use client";
import { useT } from "@/lib/i18n/client";
import { useId } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { inputClass, cx } from "@/components/ui";
import { changeStatusAction } from "@/app/(app)/cases/actions";

/** Accessible status change: a select of allowed transitions + submit (keyboard and screen-reader friendly). */
export function MoveStatusForm({
  caseId,
  reference,
  options,
  compact,
}: {
  caseId: string;
  reference: string;
  options: { key: string; label: string; category: string }[];
  compact?: boolean;
}) {
  const tr = useT();
  const id = useId();
  if (options.length === 0) return <p className="text-xs text-slate-400">{tr("No further moves allowed")}</p>;
  const closing = options.some((o) => o.category === "done");
  return (
    <ActionForm
      action={changeStatusAction}
      className="flex items-end gap-1.5"
      confirm={closing ? <p>{tr("If you choose a closing status, the case will be marked closed. You can reopen it later if the workflow allows.")}</p> : undefined}
      confirmTitle={tr("Change status of {title}?", { title: reference })}
      confirmLabel={tr("Change status")}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={compact ? "sr-only" : "block text-xs font-medium text-slate-700"}>
          Move {reference} to
        </label>
        <select id={id} name="to" required defaultValue="" className={cx(inputClass, "!py-1 !text-xs")}>
          <option value="" disabled>{tr("Move to…")}</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
      <SubmitButton size="sm" variant="secondary">{tr("Move")}</SubmitButton>
    </ActionForm>
  );
}
