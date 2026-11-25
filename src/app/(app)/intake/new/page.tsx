import { trDyn } from "@/lib/i18n/dynamic";
import { getTr } from "@/lib/i18n/server";
import { requirePagePermission } from "@/lib/auth/session";
import { getSetting, LANGUAGES } from "@/lib/domain/workflow";
import { toLocalInput } from "@/lib/format";
import { Card, Notice, PageHeader } from "@/components/ui";
import { IntakeForm } from "@/components/intake/intake-form";
import { createIntakeAction } from "../actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Start new report") };
}

export default async function NewIntakePage() {
  const tr = await getTr();
  const user = await requirePagePermission("statement.create");
  const languages = getSetting("languages.enabled").filter((c) => c in LANGUAGES).map((c) => ({ code: c, label: `${LANGUAGES[c].label} (${LANGUAGES[c].native})` }));
  return (
    <>
      <PageHeader
        title={tr("Start new report")}
        description={tr("Step 1 of the report workflow: intake details. Only collect what is needed for this report.")}
        crumbs={[{ label: tr("New Report"), href: "/intake" }, { label: tr("Start") }]}
      />
      {!user.stationId ? (
        <Notice tone="amber" title={tr("No station assigned")}>{tr("Your account is not assigned to a station, so you cannot start a report. Ask your administrator.")}</Notice>
      ) : (
        <Card>
          <IntakeForm
            action={createIntakeAction}
            stationName={user.stationName ?? ""}
            officerName={`${user.name}${user.badgeNumber ? ` (${user.badgeNumber})` : ""}`}
            incidentTypes={getSetting("incident.types")}
            languages={languages}
            requireContact={getSetting("intake.require_contact")}
            submitLabel={tr("Save and continue")}
            defaults={{ intakeAt: toLocalInput(new Date().toISOString()), incidentType: "", incidentDate: "", incidentLocation: "", language: user.preferredLanguage in LANGUAGES ? user.preferredLanguage : "en", speakerName: "", speakerContact: "", speakerAddress: "", speakerRole: "complainant" }}
          />
        </Card>
      )}
    </>
  );
}
