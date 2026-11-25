"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, type ActionResult } from "@/components/forms";
import { inputClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

type Action = (p: ActionResult, fd: FormData) => Promise<ActionResult>;
export const RESET_PHRASE = "RESET DEMO DATA";

export function DemoResetForm({ action }: { action: Action }) {
  const tr = useT();
  const [typed, setTyped] = useState("");
  return (
    <ActionForm
      action={action}
      confirmTitle={tr("Reset all sample data?")}
      confirm={tr("Every record in this database — cases, statements, recordings, users, settings and the audit log — will be permanently deleted and replaced with fresh fictional demo data. Everyone will be signed out.")}
      confirmLabel={tr("Reset everything")}
      danger
      className="space-y-3"
    >
      <div>
        <label htmlFor="phrase" className="mb-1 block text-sm font-medium text-slate-800">
          {tr("Type")} <code className="font-semibold">{RESET_PHRASE}</code> {tr("to confirm")}
        </label>
        <input id="phrase" name="phrase" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputClass} />
      </div>
      <SubmitButton variant="danger" disabled={typed !== RESET_PHRASE} pendingLabel={tr("Resetting…")}>{tr("Reset sample data")}</SubmitButton>
    </ActionForm>
  );
}
