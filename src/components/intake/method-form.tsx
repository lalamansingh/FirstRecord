"use client";
import { useT } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/messages";
import { useState } from "react";
import { Keyboard, Mic, Video, Users, Accessibility } from "lucide-react";
import { ActionForm, SubmitButton, useFieldError, type ActionResult } from "@/components/forms";
import { cx, inputClass } from "@/components/ui";

const OPTIONS = [
  { value: "typed", label: "Typed statement", desc: "Staff or the speaker types the account in their own words.", Icon: Keyboard, recording: false },
  { value: "audio", label: "Audio recording", desc: "Record the spoken account (requires consent). Staff transcribe it afterwards.", Icon: Mic, recording: true },
  { value: "video", label: "Video recording", desc: "Record audio and video (requires consent).", Icon: Video, recording: true },
  { value: "assisted", label: "Staff-assisted entry", desc: "Staff write down the account on the speaker's behalf and read it back.", Icon: Users, recording: false },
  { value: "accessible", label: "Accessible alternative", desc: "For people unable to read, write, hear or use the standard workflow — e.g. with an interpreter or sign-language support.", Icon: Accessibility, recording: false },
] as const;

export function MethodForm({
  action,
  statementId,
  current,
  canRecord,
  accessibilityNotes,
  interpreterName,
  locked,
}: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  statementId: string;
  current: string | null;
  canRecord: boolean;
  accessibilityNotes: string;
  interpreterName: string;
  locked: boolean;
}) {
  const tr = useT();
  const [value, setValue] = useState(current ?? "");
  return (
    <ActionForm action={action} className="space-y-5">
      <input type="hidden" name="statementId" value={statementId} />
      <fieldset disabled={locked}>
        <legend className="mb-3 text-sm font-semibold text-slate-900">{tr("How will the statement be captured?")}</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {OPTIONS.map((o) => {
            const disabled = o.recording && !canRecord;
            return (
              <label
                key={o.value}
                className={cx(
                  "flex cursor-pointer gap-3 rounded-lg border p-4 focus-within:ring-2 focus-within:ring-navy-700",
                  value === o.value ? "border-navy-600 bg-navy-50" : "border-slate-200 bg-white hover:border-slate-300",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <input type="radio" name="method" value={o.value} checked={value === o.value} onChange={() => setValue(o.value)} disabled={disabled} className="mt-1" />
                <o.Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{tr(o.label as MsgKey)}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{tr(o.desc as MsgKey)}</span>
                  {disabled && <span className="mt-1 block text-xs font-medium text-amber-800">{tr("Your role cannot make recordings.")}</span>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {(value === "accessible" || value === "assisted") && (
        <SupportFields required={value === "accessible"} accessibilityNotes={accessibilityNotes} interpreterName={interpreterName} />
      )}
      <p className="text-xs text-slate-500">{tr("Recording is always optional. A report is accepted whether or not the person agrees to be recorded.")}</p>
      {!locked && (
        <div className="flex justify-end border-t border-slate-200 pt-4">
          <SubmitButton disabled={!value} pendingLabel={tr("Saving…")}>{tr("Continue")}</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

function SupportFields({ required, accessibilityNotes, interpreterName }: { required: boolean; accessibilityNotes: string; interpreterName: string }) {
  const tr = useT();
  const notesErr = useFieldError("accessibilityNotes");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="accessibilityNotes" className="mb-1 block text-sm font-medium text-slate-800">
          Support provided {required && <span className="text-red-700" aria-hidden>*</span>}
        </label>
        <textarea id="accessibilityNotes" name="accessibilityNotes" rows={3} maxLength={1000} defaultValue={accessibilityNotes} className={inputClass} aria-invalid={!!notesErr} aria-describedby={notesErr ? "accessibilityNotes-error" : undefined} placeholder={tr("e.g. Statement read aloud; sign-language interpreter present")} />
        {notesErr && <p id="accessibilityNotes-error" className="mt-1 text-xs font-medium text-red-700">{notesErr}</p>}
      </div>
      <div>
        <label htmlFor="interpreterName" className="mb-1 block text-sm font-medium text-slate-800">{tr("Interpreter / assisting person (if any)")}</label>
        <input id="interpreterName" name="interpreterName" maxLength={150} defaultValue={interpreterName} className={inputClass} />
      </div>
    </div>
  );
}
