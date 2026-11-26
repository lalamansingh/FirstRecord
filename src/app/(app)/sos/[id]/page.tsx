import { trDyn } from "@/lib/i18n/dynamic";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { getTr, getLang } from "@/lib/i18n/server";
import { getAlert, listResponders } from "@/lib/domain/sos";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatRelative } from "@/lib/format";
import { PageHeader, Card, Table, Th, Td, Badge, KeyValue, Field, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AutoRefresh } from "@/components/sos/auto-refresh";
import { SosStatusBadge, SosResponseBadge } from "@/components/sos/badges";
import { closeSosAction } from "../actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "SOS alert") };
}

export default async function SosAlertPage({ params }: { params: Promise<{ id: string }> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const { id } = await params;
  let alert;
  try {
    alert = getAlert(user, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const responders = listResponders(id);
  const isActive = alert.status === "active";
  const counts = {
    en_route: responders.filter((r) => r.response === "en_route").length,
    acknowledged: responders.filter((r) => r.response === "acknowledged").length,
    unavailable: responders.filter((r) => r.response === "unavailable").length,
    none: responders.filter((r) => !r.response).length,
  };

  return (
    <div className="space-y-6">
      {isActive && <AutoRefresh />}
      <PageHeader
        title={alert.title}
        crumbs={[{ label: tr("SOS alerts"), href: "/sos" }, { label: alert.title }]}
        meta={
          <>
            <SosStatusBadge status={alert.status} />
            <Badge tone={alert.severity === "critical" ? "red" : "amber"}>{alert.severity === "critical" ? tr("Critical") : tr("High")}</Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title={tr("Alert")} className="lg:col-span-2">
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800">{alert.message}</p>
          <div className="mt-5">
            <KeyValue
              items={[
                { label: tr("Raised by"), value: alert.raised_by_name },
                { label: tr("Raised"), value: `${formatDate(alert.created_at, { time: true, lang })} (${formatRelative(alert.created_at, lang)})` },
                {
                  label: tr("Location"),
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <MapPin className="h-4 w-4 text-slate-400" aria-hidden />
                      {alert.location_text || (alert.lat == null ? tr("Not given") : "")}
                      {alert.lat != null && alert.lng != null && (
                        <a className="text-[#1B6650] underline" href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`} target="_blank" rel="noopener noreferrer">
                          {tr("Open map")}
                        </a>
                      )}
                    </span>
                  ),
                },
                { label: tr("Alerted"), value: alert.lat != null ? tr("Staff sharing location within {km} km", { km: alert.radius_km }) : tr("All active staff of the station") },
                ...(alert.resolved_at
                  ? [
                      { label: alert.status === "resolved" ? tr("Resolved") : tr("Cancelled"), value: `${formatDate(alert.resolved_at, { time: true, lang })} · ${alert.resolved_by_name ?? ""}` },
                      ...(alert.resolution_note ? [{ label: tr("Note"), value: alert.resolution_note }] : []),
                    ]
                  : []),
              ]}
            />
          </div>
        </Card>

        <Card title={tr("Responses")}>
          <dl className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-emerald-50 p-3"><dt className="text-xs text-emerald-800">{tr("On my way")}</dt><dd className="text-2xl font-semibold text-emerald-900">{counts.en_route}</dd></div>
            <div className="rounded-lg bg-blue-50 p-3"><dt className="text-xs text-blue-800">{tr("Acknowledged")}</dt><dd className="text-2xl font-semibold text-blue-900">{counts.acknowledged}</dd></div>
            <div className="rounded-lg bg-amber-50 p-3"><dt className="text-xs text-amber-800">{tr("No response yet")}</dt><dd className="text-2xl font-semibold text-amber-900">{counts.none}</dd></div>
            <div className="rounded-lg bg-slate-100 p-3"><dt className="text-xs text-slate-700">{tr("Unavailable")}</dt><dd className="text-2xl font-semibold text-slate-900">{counts.unavailable}</dd></div>
          </dl>
          {isActive && can(user, "sos.manage") && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <ActionForm action={closeSosAction} className="space-y-3">
                <input type="hidden" name="id" value={alert.id} />
                <Field label={tr("Closing note (optional)")} htmlFor="sos-note">
                  <textarea id="sos-note" name="note" rows={2} maxLength={500} className={inputClass} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="outcome" value="resolved">{tr("Mark resolved")}</SubmitButton>
                  <SubmitButton name="outcome" value="cancelled" variant="secondary">{tr("Cancel alert")}</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}
        </Card>
      </div>

      <Card title={tr("Recipients")} description={isActive ? tr("Updates automatically every few seconds.") : undefined} padded={responders.length === 0}>
        {responders.length === 0 ? (
          <p className="text-sm text-slate-600">{tr("No staff matched this alert. Nobody in range was sharing their location.")}</p>
        ) : (
          <Table caption={tr("Recipients")}>
            <thead>
              <tr>
                <Th>{tr("Name")}</Th>
                <Th>{tr("Distance")}</Th>
                <Th>{tr("Response")}</Th>
                <Th>{tr("Seen")}</Th>
              </tr>
            </thead>
            <tbody>
              {responders.map((r) => (
                <tr key={r.user_id}>
                  <Td>
                    <span className="font-medium text-slate-900">{r.name}</span>
                    {r.badge_number && <span className="ml-1 text-xs text-slate-500">#{r.badge_number}</span>}
                  </Td>
                  <Td>{r.distance_km != null ? `${r.distance_km.toFixed(1)} km` : "—"}</Td>
                  <Td>
                    <SosResponseBadge response={r.response} />
                    {r.responded_at && <span className="ml-2 text-xs text-slate-500">{formatRelative(r.responded_at, lang)}</span>}
                  </Td>
                  <Td>{r.delivered_at ? formatRelative(r.delivered_at, lang) : tr("Not yet")}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
