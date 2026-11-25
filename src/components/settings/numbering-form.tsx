"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, FieldError, type ActionResult } from "@/components/forms";
import { inputClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

type Action = (p: ActionResult, fd: FormData) => Promise<ActionResult>;

/** Mirrors formatCaseReference in src/lib/domain/workflow.ts (client-safe copy for live preview). */
function preview(format: string, code: string, seq: number) {
  const d = new Date();
  return format
    .replace(/\{STATION\}/g, code)
    .replace(/\{YYYY\}/g, String(d.getFullYear()))
    .replace(/\{YY\}/g, String(d.getFullYear()).slice(2))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, "0"))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_m, w) => String(seq).padStart(Number(w || 1), "0"));
}

export function NumberingForm({
  action,
  format: initial,
  reset,
  stationCode,
  nextSeq,
}: {
  action: Action;
  format: string;
  reset: "yearly" | "never";
  stationCode: string;
  nextSeq: number;
}) {
  const tr = useT();
  const [format, setFormat] = useState(initial);
  const hasSeq = /\{SEQ(?::\d+)?\}/.test(format);
  return (
    <ActionForm
      action={action}
      confirmTitle={tr("Change case numbering?")}
      confirm={tr("New cases will use this format. Existing case references are never changed. Make sure the format matches your station's approved numbering rules.")}
      confirmLabel={tr("Save numbering")}
      className="space-y-4"
    >
      <div>
        <label htmlFor="case_number_format" className="mb-1 block text-sm font-medium text-slate-800">{tr("Reference format")}</label>
        <input id="case_number_format" name="case_number_format" value={format} onChange={(e) => setFormat(e.target.value)} maxLength={60} className={`${inputClass} font-mono`} aria-describedby="fmt-help" required />
        <FieldError name="case_number_format" />
        <p id="fmt-help" className="mt-1 text-xs text-slate-500">
          {tr("Tokens:")} <code>{"{STATION}"}</code> {tr("station code")}, <code>{"{YYYY}"}</code>/<code>{"{YY}"}</code> {tr("year")}, <code>{"{MM}"}</code> {tr("month")},{" "}
          <code>{"{SEQ:5}"}</code> {tr("sequence padded to 5 digits (required).")}
        </p>
      </div>
      <div>
        <label htmlFor="sequence_reset" className="mb-1 block text-sm font-medium text-slate-800">{tr("Sequence reset")}</label>
        <select id="sequence_reset" name="sequence_reset" defaultValue={reset} className={inputClass}>
          <option value="yearly">{tr("Restart at 1 every calendar year")}</option>
          <option value="never">{tr("Never restart")}</option>
        </select>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm" aria-live="polite">
        <span className="text-slate-600">{tr("Next reference preview:")} </span>
        {hasSeq ? <code className="font-semibold text-slate-900">{preview(format, stationCode, nextSeq)}</code> : <span className="text-red-700">{tr("Format must include a {SEQ} token.")}</span>}
      </div>
      <div className="flex justify-end">
        <SubmitButton disabled={!hasSeq}>{tr("Save numbering")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
