"use client";
import { useT } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/messages";
import { Badge, type Tone } from "@/components/ui";

const LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_verification: "Under verification",
  verified: "Verified",
  rejected: "Not accepted",
  duplicate: "Duplicate",
  converted: "Case opened",
};
const TONE: Record<string, Tone> = {
  submitted: "blue",
  under_verification: "amber",
  verified: "green",
  rejected: "red",
  duplicate: "slate",
  converted: "green",
};

export function OnlineStatusBadge({ status }: { status: string }) {
  const tr = useT();
  return <Badge tone={TONE[status] ?? "slate"}>{tr((LABELS[status] ?? status) as MsgKey)}</Badge>;
}
