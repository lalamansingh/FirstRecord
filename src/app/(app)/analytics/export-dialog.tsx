"use client";
import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { useToast } from "@/components/forms";
import { useT } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/messages";

export function ExportDialog({
  datasets,
  purposes,
  filters,
}: {
  datasets: Record<string, string>;
  purposes: Record<string, string>;
  filters: Record<string, string>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [purpose, setPurpose] = useState("operational_review");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const tr = useT();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      for (const [k, v] of Object.entries(filters)) if (v) fd.set(k, v);
      const res = await fetch("/api/export", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: tr("Export failed.") }));
        setError(j.error ?? tr("Export failed."));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? "firstrecord-export.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      ref.current?.close();
      toast.show(tr("Export downloaded. This export was recorded in the audit log."), "success");
    } catch {
      setError(tr("Network error — the export was not downloaded."));
    } finally {
      setPending(false);
    }
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v);

  return (
    <>
      <button type="button" className={buttonClass("secondary")} onClick={() => { setError(null); ref.current?.showModal(); }}>
        <Download className="h-4 w-4" aria-hidden /> {tr("Export CSV")}
      </button>
      <dialog ref={ref} aria-labelledby="export-title" className="m-auto w-[min(92vw,32rem)] rounded-lg border border-slate-200 p-0 shadow-[0_4px_12px_rgb(16_24_40/0.08)] backdrop:bg-slate-900/40">
        <form onSubmit={submit}>
          <div className="space-y-4 p-5">
            <div>
              <h2 id="export-title" className="text-base font-semibold text-slate-900">{tr("Export aggregate report")}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {tr("Exports contain aggregate counts only — no statement text, party names or contact details. Every export is recorded in the audit log with its purpose.")}
              </p>
            </div>
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <div>
              <label htmlFor="exp-dataset" className="mb-1 block text-sm font-medium text-slate-800">{tr("Report")}</label>
              <select id="exp-dataset" name="dataset" className={inputClass} defaultValue="stage">
                {Object.entries(datasets).map(([k, v]) => <option key={k} value={k}>{tr(v as MsgKey)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="exp-purpose" className="mb-1 block text-sm font-medium text-slate-800">{tr("Purpose")}<span className="ml-0.5 text-red-700" aria-hidden>*</span></label>
              <select id="exp-purpose" name="purpose" className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} required>
                {Object.entries(purposes).map(([k, v]) => <option key={k} value={k}>{tr(v as MsgKey)}</option>)}
              </select>
            </div>
            {purpose === "other" && (
              <div>
                <label htmlFor="exp-note" className="mb-1 block text-sm font-medium text-slate-800">{tr("Describe the purpose")}<span className="ml-0.5 text-red-700" aria-hidden>*</span></label>
                <input id="exp-note" name="purposeNote" className={inputClass} maxLength={300} minLength={5} required />
              </div>
            )}
            <p className="text-xs text-slate-500">
              {tr("Filters applied:")} {activeFilters.length ? activeFilters.map(([k, v]) => `${k}=${v}`).join(", ") : tr("none (all accessible records)")}
            </p>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
              {tr("I confirm this export is for the stated, authorized purpose and will be handled under my organization's data policy.")}
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button type="button" className={buttonClass("secondary")} onClick={() => ref.current?.close()}>{tr("Cancel")}</button>
            <button type="submit" className={buttonClass("primary")} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {pending ? tr("Preparing…") : tr("Export")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
