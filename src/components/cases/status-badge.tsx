import { trDyn } from "@/lib/i18n/dynamic";
import { Badge } from "@/components/ui";
import type { Workflow } from "@/lib/domain/workflow";
import { stateOf } from "@/lib/domain/workflow";
import { OFFICIAL_STATUS_LABELS } from "@/lib/format";
import { getTr } from "@/lib/i18n/server";

export function CaseStatusBadge({ wf, status }: { wf: Workflow; status: string }) {
  const s = stateOf(wf, status);
  return <Badge tone={s.color}>{s.label}</Badge>;
}

export async function OfficialStatusBadge({ status }: { status: string }) {
  const tr = await getTr();
  const info = OFFICIAL_STATUS_LABELS[status] ?? OFFICIAL_STATUS_LABELS.local;
  const tone = status === "filed" ? "green" : status === "submitted" ? "amber" : "slate";
  return (
    <Badge tone={tone} className="!font-normal">
      <span title={trDyn(tr, info.description)}>{trDyn(tr, info.label)}</span>
    </Badge>
  );
}
