import { getTr } from "@/lib/i18n/server";

export default async function Loading() {
  const tr = await getTr();
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">{tr("Loading…")}</span>
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="h-4 w-80 rounded bg-slate-200" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-slate-200" />)}
      </div>
      <div className="h-64 rounded-lg bg-slate-200" />
    </div>
  );
}
