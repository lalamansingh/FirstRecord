/** Small presentational pieces shared by the Updates pages (server-safe). */
import { Pin, Scale, FileText, AlertTriangle, MonitorCog } from "lucide-react";
import { Badge, type Tone } from "@/components/ui";
import type { BulletinCategory } from "@/lib/domain/bulletins";

export const CATEGORY_TONE: Record<BulletinCategory, Tone> = {
  new_rule: "blue",
  circular: "blue",
  advisory: "amber",
  system_update: "slate",
};

const ICON = { new_rule: Scale, circular: FileText, advisory: AlertTriangle, system_update: MonitorCog } as const;

export function CategoryBadge({ category, label }: { category: BulletinCategory; label: string }) {
  return <Badge tone={CATEGORY_TONE[category]}>{label}</Badge>;
}

export function CategoryIcon({ category }: { category: BulletinCategory }) {
  const Icon = ICON[category];
  const tone = {
    new_rule: "bg-slate-50 text-slate-600 ring-slate-200",
    circular: "bg-slate-50 text-slate-600 ring-slate-200",
    advisory: "bg-amber-50 text-amber-700 ring-amber-200",
    system_update: "bg-slate-50 text-slate-600 ring-slate-200",
  }[category];
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${tone}`} aria-hidden>
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function PinnedMark({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
      <Pin className="h-3.5 w-3.5" aria-hidden /> {label}
    </span>
  );
}

/** Renders plain text keeping paragraphs and line breaks (no HTML interpretation). */
export function PlainText({ text }: { text: string }) {
  const paras = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-800">
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-line">{p}</p>
      ))}
    </div>
  );
}
