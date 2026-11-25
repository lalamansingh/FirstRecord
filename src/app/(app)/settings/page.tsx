import { requireUser } from "@/lib/auth/session";
import { can, type AuthUser } from "@/lib/rbac/access";
import { config } from "@/lib/config";
import { PageHeader, Tabs } from "@/components/ui";
import { getTr } from "@/lib/i18n/server";
import type { Tr } from "@/lib/i18n/messages";
import {
  ProfileSection,
  NotificationsSection,
  StationSection,
  NumberingSection,
  WorkflowSection,
  TemplatesSection,
  RecordingSection,
  RetentionSection,
  SystemSection,
  DataSection,
} from "./sections";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Settings") };
}

type TabKey = "profile" | "notifications" | "station" | "numbering" | "workflow" | "templates" | "recording" | "retention" | "system" | "data";

function visibleTabs(user: AuthUser, tr: Tr): { key: TabKey; label: string; scope: "user" | "deployment" }[] {
  const t: { key: TabKey; label: string; scope: "user" | "deployment" }[] = [
    { key: "profile", label: tr("Profile"), scope: "user" },
    { key: "notifications", label: tr("Notifications"), scope: "user" },
  ];
  if (can(user, "settings.station") && user.stationId) {
    t.push({ key: "station", label: tr("Station"), scope: "deployment" }, { key: "numbering", label: tr("Case numbering"), scope: "deployment" });
  }
  if (can(user, "settings.workflow")) {
    t.push({ key: "workflow", label: tr("Workflows"), scope: "deployment" }, { key: "templates", label: tr("FIR templates"), scope: "deployment" });
  }
  if (can(user, "settings.workflow") || can(user, "settings.retention")) t.push({ key: "recording", label: tr("Recording & languages"), scope: "deployment" });
  if (can(user, "settings.retention")) t.push({ key: "retention", label: tr("Retention"), scope: "deployment" });
  if (can(user, "settings.system")) t.push({ key: "system", label: tr("System"), scope: "deployment" });
  if (can(user, "settings.retention") || can(user, "settings.system") || (config.demoMode && can(user, "demo.reset"))) {
    t.push({ key: "data", label: tr("Data & backup"), scope: "deployment" });
  }
  return t;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const tr = await getTr();
  const tabs = visibleTabs(user, tr);
  const active = (tabs.find((t) => t.key === tab)?.key ?? "profile") as TabKey;
  const activeTab = tabs.find((t) => t.key === active)!;

  return (
    <>
      <PageHeader
        title={tr("Settings")}
        description={
          activeTab.scope === "user"
            ? tr("Personal preferences — these affect only your account.")
            : tr("Station and deployment configuration — changes affect everyone and are recorded in the audit log.")
        }
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Settings") }]}
      />
      <Tabs tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `/settings?tab=${t.key}` }))} active={active} />
      {active === "profile" && <ProfileSection user={user} />}
      {active === "notifications" && <NotificationsSection user={user} />}
      {active === "station" && <StationSection user={user} />}
      {active === "numbering" && <NumberingSection user={user} />}
      {active === "workflow" && <WorkflowSection />}
      {active === "templates" && <TemplatesSection />}
      {active === "recording" && <RecordingSection />}
      {active === "retention" && <RetentionSection user={user} />}
      {active === "system" && <SystemSection />}
      {active === "data" && <DataSection user={user} />}
    </>
  );
}
