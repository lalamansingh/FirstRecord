import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { getTr, getLang } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import { requirePagePermission } from "@/lib/auth/session";
import { can, maskPii } from "@/lib/rbac/access";
import { NotFoundError } from "@/lib/errors";
import { recordAccess } from "@/lib/audit";
import { requestIp } from "@/lib/auth/session";
import { getOnlineComplaint, allowedTransitions, duplicateCandidates, ONLINE_MARKER, type OnlineComplaintRow } from "@/lib/domain/online-complaints";
import { assignableUsers } from "@/lib/domain/case-create";
import { LANGUAGES } from "@/lib/domain/workflow";
import { formatDate } from "@/lib/format";
import { PageHeader, Card, KeyValue, Notice, buttonClass } from "@/components/ui";
import { OnlineStatusBadge } from "@/components/online/status-badge";
import { NotesForm, AssignForm, DecisionForm, ConvertForm } from "@/components/online/staff-controls";
import { saveNotesAction, assignComplaintAction, changeComplaintStatusAction, convertComplaintAction } from "../actions";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Online complaint") };
}

export default async function OnlineComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requirePagePermission("online.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let c: OnlineComplaintRow;
  try {
    c = getOnlineComplaint(user, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  recordAccess({ userId: user.id, entityType: "online_complaint", entityId: id, caseId: c.case_id, action: "view", ip: await requestIp() });

  const verify = can(user, "online.verify");
  const people = c.station_id ? assignableUsers(c.station_id).map((p) => ({ id: p.id, name: p.name })) : [];
  const allowed = allowedTransitions(c.status);
  const inStation = !!user.stationId && user.stationId === c.station_id;
  const canConvert = verify && can(user, "case.create") && c.status === "verified" && inStation;

  return (
    <>
      <PageHeader
        crumbs={[{ label: tr("Online Complaints"), href: "/online-complaints" }, { label: c.tracking_code }]}
        title={<span className="font-mono">{c.tracking_code}</span>}
        meta={<OnlineStatusBadge status={c.status} />}
        description={tr("Submitted online by the complainant. Not a registered FIR; verify before acting.")}
        actions={
          c.case_id && c.case_reference ? (
            <Link href={`/cases/${c.case_id}`} className={buttonClass("secondary")}>
              <FolderOpen className="h-4 w-4" aria-hidden />
              {tr("Open case {reference}", { reference: c.case_reference })}
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card title={tr("Complaint")} description={tr(ONLINE_MARKER as MsgKey)}>
            <KeyValue
              items={[
                { label: tr("Type of incident"), value: c.incident_type ? tr(c.incident_type as MsgKey) : "—" },
                { label: tr("Date of incident"), value: c.incident_date ? formatDate(c.incident_date, { lang }) : "—" },
                { label: tr("Where it happened"), value: c.incident_location },
                { label: tr("Station"), value: c.station_name },
                { label: tr("Received"), value: formatDate(c.created_at, { time: true, lang }) },
                { label: tr("Language"), value: LANGUAGES[c.language]?.label ?? c.language },
              ]}
            />
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium text-slate-500">{tr("Description (complainant's own words)")}</p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-7 text-slate-900">{c.description}</p>
            </div>
          </Card>

          <Card title={tr("Complainant")}>
            <KeyValue
              items={[
                { label: tr("Full name"), value: c.complainant_name },
                { label: tr("Phone number"), value: maskPii(user, c.phone) },
                { label: tr("Email"), value: maskPii(user, c.email) },
                { label: tr("Address"), value: maskPii(user, c.address) },
              ]}
            />
          </Card>

          <Card title={tr("Verification notes")} description={tr("Internal. Never shown to the complainant.")}>
            {verify && c.status !== "converted" ? (
              <NotesForm action={saveNotesAction} id={c.id} notes={c.verification_notes ?? ""} />
            ) : (
              <p className="whitespace-pre-line text-sm leading-6 text-slate-800">{c.verification_notes || "—"}</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {canConvert && (
            <Card title={tr("Open a case")} description={tr("Turns this verified complaint into a local case so work can begin.")} className="border-emerald-200">
              <ConvertForm
                action={convertComplaintAction}
                id={c.id}
                defaultTitle={`${c.incident_type ?? tr("Complaint")} — ${c.incident_location ?? ""}`.slice(0, 200)}
                people={people}
                currentUserId={user.id}
                canAssignOthers={can(user, "case.assign")}
              />
            </Card>
          )}
          {verify && c.status === "verified" && !inStation && (
            <Notice tone="slate">{tr("Only staff of the station the complaint was sent to can open a case from it.")}</Notice>
          )}

          {verify && allowed.length > 0 && (
            <Card title={tr("Verification")}>
              <DecisionForm action={changeComplaintStatusAction} id={c.id} allowed={allowed} cases={duplicateCandidates(user, c.station_id)} />
            </Card>
          )}

          <Card title={tr("Assignment")}>
            {verify && c.status !== "converted" ? (
              <AssignForm action={assignComplaintAction} id={c.id} current={c.assigned_to} people={people} />
            ) : (
              <p className="text-sm text-slate-800">{c.assignee_name ?? tr("Unassigned")}</p>
            )}
            {c.verifier_name && c.verified_at && (
              <p className="mt-3 text-xs text-slate-500">
                {tr("Verified by {name} on {date}", { name: c.verifier_name, date: formatDate(c.verified_at, { time: true, lang }) })}
              </p>
            )}
          </Card>

          <Card title={tr("Message to the complainant")} description={tr("Shown on the public tracking page.")}>
            <p className="whitespace-pre-line text-sm leading-6 text-slate-800">{c.public_note || tr("No message yet (a standard status message is shown).")}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
