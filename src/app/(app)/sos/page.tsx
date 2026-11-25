import { trDyn } from "@/lib/i18n/dynamic";
import Link from "next/link";
import { Siren } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { getTr, getLang } from "@/lib/i18n/server";
import { listAlerts, getLocationSharing } from "@/lib/domain/sos";
import { pushConfigured, vapidPublicKey } from "@/lib/push";
import { formatDate, formatRelative } from "@/lib/format";
import { PageHeader, Card, Table, Th, Td, Badge, EmptyState, Notice } from "@/components/ui";
import { RaiseSosForm } from "@/components/sos/raise-form";
import { LocationSharing } from "@/components/sos/location-sharing";
import { PushToggle } from "@/components/sos/push-toggle";
import { AutoRefresh } from "@/components/sos/auto-refresh";
import { SosStatusBadge, SosResponseBadge } from "@/components/sos/badges";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "SOS") };
}

export default async function SosPage() {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const active = listAlerts(user, { status: "active" });
  const history = listAlerts(user, { status: "closed", limit: 30 });
  const loc = getLocationSharing(user.id);
  const vapid = pushConfigured() ? vapidPublicKey() : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr("SOS alerts")}
        description={tr("Raise an emergency alert to nearby staff, and choose how alerts reach you.")}
      />
      {active.length > 0 && <AutoRefresh />}

      <Card title={tr("Active alerts")} padded={active.length === 0}>
        {active.length === 0 ? (
          <EmptyState icon={<Siren className="h-8 w-8" />} title={tr("No active alerts")} description={tr("When an SOS is raised for your station it will appear here.")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {active.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link href={`/sos/${a.id}`} className="flex items-center gap-2 font-semibold text-red-800 hover:underline">
                    <span className="relative flex h-2.5 w-2.5" aria-hidden>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                    </span>
                    {a.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {a.location_text ? `${a.location_text} · ` : ""}
                    {tr("Raised by {name}", { name: a.raised_by_name })} · {formatRelative(a.created_at, lang)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge tone={a.severity === "critical" ? "red" : "amber"}>{a.severity === "critical" ? tr("Critical") : tr("High")}</Badge>
                  <span className="text-slate-600">{tr("{r} of {n} responded", { r: a.responded, n: a.recipients })}</span>
                  {a.my_response && <SosResponseBadge response={a.my_response} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {can(user, "sos.raise") && (
          <Card title={tr("Raise an SOS")} description={tr("For emergencies only. Every alert is logged.")}>
            <RaiseSosForm />
          </Card>
        )}
        <Card title={tr("How alerts reach me")} description={tr("These settings apply to you only.")}>
          <div className="space-y-6">
            <LocationSharing initialEnabled={loc.enabled} lastUpdated={loc.updatedAt} />
            {vapid ? (
              <PushToggle vapidPublicKey={vapid} />
            ) : (
              <p className="text-sm text-slate-600">{tr("Phone notifications are not set up on this server. Alerts sound only while FirstRecord is open.")}</p>
            )}
            <Notice tone="amber" title={tr("Keep FirstRecord open while on duty")}>
              {tr("A website can sound the siren only while it is open in your browser. Keep a FirstRecord tab open (screen may be locked on some phones, but the browser must not be closed).")}
            </Notice>
          </div>
        </Card>
      </div>

      <Card title={tr("Alert history")} padded={history.length === 0}>
        {history.length === 0 ? (
          <p className="text-sm text-slate-600">{tr("No past alerts.")}</p>
        ) : (
          <>
          <ul className="divide-y divide-slate-200 sm:hidden">
            {history.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/sos/${a.id}`} className="min-w-0 font-medium text-[#1F4E9C] hover:underline">{a.title}</Link>
                  <SosStatusBadge status={a.status} />
                </div>
                <div className="mt-1 text-xs text-slate-500">{tr("Raised by {name}", { name: a.raised_by_name })} · {formatDate(a.created_at, { time: true, lang })}</div>
                <div className="mt-0.5 text-xs text-slate-600">{tr("{r} of {n} responded", { r: a.responded, n: a.recipients })}</div>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
          <Table caption={tr("Alert history")}>
            <thead>
              <tr>
                <Th>{tr("Alert")}</Th>
                <Th>{tr("Raised")}</Th>
                <Th>{tr("Status")}</Th>
                <Th>{tr("Responses")}</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <Link href={`/sos/${a.id}`} className="font-medium text-[#1F4E9C] hover:underline">{a.title}</Link>
                    <div className="text-xs text-slate-500">{tr("Raised by {name}", { name: a.raised_by_name })}</div>
                  </Td>
                  <Td>{formatDate(a.created_at, { time: true, lang })}</Td>
                  <Td><SosStatusBadge status={a.status} /></Td>
                  <Td>{tr("{r} of {n} responded", { r: a.responded, n: a.recipients })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
