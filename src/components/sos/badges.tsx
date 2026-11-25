"use client";
import { Badge } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { SosResponse, SosStatus } from "@/lib/domain/sos";

export function SosStatusBadge({ status }: { status: SosStatus }) {
  const tr = useT();
  if (status === "active") return <Badge tone="red">{tr("Active")}</Badge>;
  if (status === "resolved") return <Badge tone="green">{tr("Resolved")}</Badge>;
  return <Badge tone="slate">{tr("Cancelled")}</Badge>;
}

export function SosResponseBadge({ response }: { response: SosResponse | null }) {
  const tr = useT();
  if (response === "en_route") return <Badge tone="green">{tr("On my way")}</Badge>;
  if (response === "acknowledged") return <Badge tone="blue">{tr("Acknowledged")}</Badge>;
  if (response === "unavailable") return <Badge tone="slate">{tr("Unavailable")}</Badge>;
  return <Badge tone="amber">{tr("No response yet")}</Badge>;
}
