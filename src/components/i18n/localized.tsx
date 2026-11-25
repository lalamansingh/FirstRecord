"use client";
/** Small display components that follow the interface language (usable from server and client trees). */
import { Badge, PRIORITY_TONE } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { trDyn } from "@/lib/i18n/dynamic";
import { PRIORITY_LABELS } from "@/lib/format";

export function PriorityBadge({ priority }: { priority: string }) {
  const tr = useT();
  const label = PRIORITY_LABELS[priority] ?? priority.charAt(0).toUpperCase() + priority.slice(1);
  return <Badge tone={PRIORITY_TONE[priority] ?? "slate"}>{trDyn(tr, label)}</Badge>;
}
