"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, type ActionResult } from "@/components/forms";
import { buttonClass, inputClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

type Action = (p: ActionResult, fd: FormData) => Promise<ActionResult>;

export interface EditorField {
  key: string;
  label: string;
  required: boolean;
  kind: "text" | "longtext" | "date" | "list";
  fill: "ai" | "manual";
  help: string;
}

export function TemplateEditor({
  action,
  templateId,
  name,
  jurisdiction,
  description,
  fields: initial,
  coreKeys,
  manualOnlyKeys,
  readOnly,
}: {
  action: Action;
  templateId: string;
  name: string;
  jurisdiction: string;
  description: string;
  fields: EditorField[];
  coreKeys: string[];
  manualOnlyKeys: string[];
  readOnly: boolean;
}) {
  const tr = useT();
  const [fields, setFields] = useState<(EditorField & { isNew?: boolean })[]>(initial);
  const [meta, setMeta] = useState({ name, jurisdiction, description });
  const upd = (i: number, p: Partial<EditorField>) => setFields((f) => f.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => {
    let n = 1;
    while (fields.some((f) => f.key === `custom_${n}`)) n++;
    setFields((f) => [...f, { key: `custom_${n}`, label: "New field", required: false, kind: "longtext", fill: "manual", help: "", isNew: true }]);
  };

  const payload = JSON.stringify({ templateId, ...meta, fields: fields.map(({ key, label, required, kind, fill, help }) => ({ key, label, required, kind, fill, help })) });

  return (
    <ActionForm
      action={action}
      confirmTitle={tr("Save as a new template version?")}
      confirm={tr("A new template version is created and used for new drafts. Existing drafts keep the version they were created with.")}
      confirmLabel={tr("Save new version")}
      className="space-y-5"
    >
      <input type="hidden" name="template" value={payload} />
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tpl-name" className="mb-1 block text-sm font-medium text-slate-800">{tr("Template name")}</label>
            <input id="tpl-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} maxLength={120} className={inputClass} />
          </div>
          <div>
            <label htmlFor="tpl-jur" className="mb-1 block text-sm font-medium text-slate-800">{tr("Jurisdiction")}</label>
            <input id="tpl-jur" value={meta.jurisdiction} onChange={(e) => setMeta({ ...meta, jurisdiction: e.target.value })} maxLength={120} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="tpl-desc" className="mb-1 block text-sm font-medium text-slate-800">{tr("Description")}</label>
            <textarea id="tpl-desc" rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={600} className={inputClass} />
          </div>
        </div>

        <div className="space-y-2">
          {fields.map((f, i) => {
            const core = coreKeys.includes(f.key);
            const manualOnly = manualOnlyKeys.includes(f.key) || !core;
            return (
              <div key={f.key} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">{f.key} · {core ? tr("core field") : tr("custom field")}</span>
                  {!core && (
                    <button type="button" onClick={() => setFields((x) => x.filter((_, j) => j !== i))} className={buttonClass("ghost", "sm")} aria-label={tr("Remove field {label}", { label: f.label })}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                  <div>
                    <label htmlFor={`f-label-${i}`} className="mb-0.5 block text-xs text-slate-600">{tr("Label")}</label>
                    <input id={`f-label-${i}`} value={f.label} maxLength={120} onChange={(e) => upd(i, { label: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor={`f-kind-${i}`} className="mb-0.5 block text-xs text-slate-600">{tr("Field type")}</label>
                    <select id={`f-kind-${i}`} value={f.kind} onChange={(e) => upd(i, { kind: e.target.value as EditorField["kind"] })} className={inputClass} disabled={core}>
                      <option value="text">{tr("Short text")}</option>
                      <option value="longtext">{tr("Long text")}</option>
                      <option value="date">{tr("Date")}</option>
                      <option value="list">{tr("List")}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`f-fill-${i}`} className="mb-0.5 block text-xs text-slate-600">{tr("Filled by")}</label>
                    <select id={`f-fill-${i}`} value={manualOnly ? "manual" : f.fill} onChange={(e) => upd(i, { fill: e.target.value as EditorField["fill"] })} className={inputClass} disabled={manualOnly}>
                      <option value="ai">{tr("Assistant draft (human-reviewed)")}</option>
                      <option value="manual">{tr("Officer only")}</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
                    <input type="checkbox" checked={f.required} onChange={(e) => upd(i, { required: e.target.checked })} className="h-4 w-4" /> {tr("Required")}
                  </label>
                </div>
                <div className="mt-2">
                  <label htmlFor={`f-help-${i}`} className="mb-0.5 block text-xs text-slate-600">{tr("Guidance for staff")}</label>
                  <input id={`f-help-${i}`} value={f.help} maxLength={300} onChange={(e) => upd(i, { help: e.target.value })} className={inputClass} />
                </div>
              </div>
            );
          })}
        </div>
        {!readOnly && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <button type="button" onClick={add} className={buttonClass("secondary", "sm")} disabled={fields.length >= 40}>
              <Plus className="h-4 w-4" aria-hidden /> {tr("Add custom field")}
            </button>
            <SubmitButton>{tr("Save new version")}</SubmitButton>
          </div>
        )}
      </fieldset>
    </ActionForm>
  );
}
