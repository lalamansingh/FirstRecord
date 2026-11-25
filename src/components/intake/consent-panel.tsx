"use client";
import { useT } from "@/lib/i18n/client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton, useFieldError, type ActionResult } from "@/components/forms";
import { inputClass } from "@/components/ui";

export interface ConsentNotice {
  code: string;
  label: string;
  text: string;
  ui: { title: string; lead: string; question: string; grant: string; decline: string };
}

export function ConsentPanel({
  action,
  statementId,
  scope,
  notices,
  defaultLanguage,
  noticeVersion,
}: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  statementId: string;
  scope: "audio" | "video";
  notices: ConsentNotice[];
  defaultLanguage: string;
  noticeVersion: string;
}) {
  const tr = useT();
  const [lang, setLang] = useState(notices.some((n) => n.code === defaultLanguage) ? defaultLanguage : notices[0]?.code);
  const notice = notices.find((n) => n.code === lang) ?? notices[0];
  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="statementId" value={statementId} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="noticeLanguage" value={notice.code} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="notice-lang" className="mb-1 block text-sm font-medium text-slate-800">{tr("Notice language")}</label>
          <select id="notice-lang" value={lang} onChange={(e) => setLang(e.target.value)} className={`${inputClass} w-48`}>
            {notices.map((n) => (
              <option key={n.code} value={n.code}>{n.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">{tr("Notice version {version}. The exact text shown is stored with the decision.", { version: noticeVersion })}</p>
      </div>
      <section lang={notice.code} aria-labelledby="consent-title" className="rounded-lg border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-navy-700" aria-hidden />
          <h3 id="consent-title" className="text-base font-semibold text-slate-900">
            {notice.ui.title} — {scope === "video" ? "video" : "audio"}
          </h3>
        </div>
        <p className="mt-1 text-xs text-slate-600">{notice.ui.lead}</p>
        <div className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-900">{notice.text}</div>
      </section>
      <Acknowledge />
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        <SubmitButton variant="secondary" name="decision" value="declined" pendingLabel={tr("Saving…")}>
          <span lang={notice.code}>{notice.ui.decline}</span>
        </SubmitButton>
        <SubmitButton name="decision" value="granted" pendingLabel={tr("Saving…")}>
          <span lang={notice.code}>{notice.ui.grant}</span>
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function Acknowledge() {
  const tr = useT();
  const err = useFieldError("acknowledged");
  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-slate-800">
        <input type="checkbox" name="acknowledged" className="mt-0.5" aria-invalid={!!err} aria-describedby={err ? "ack-err" : undefined} />
        <span>{tr("I (staff) read this notice to the person, or they read it themselves, and they had the chance to ask questions. Required only when consent is granted.")}</span>
      </label>
      {err && <p id="ack-err" className="mt-1 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}
