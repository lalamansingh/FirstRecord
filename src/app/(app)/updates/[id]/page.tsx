import { trDyn } from "@/lib/i18n/dynamic";
import { notFound } from "next/navigation";
import { CheckCircle2, Pencil, Archive, Users } from "lucide-react";
import { getTr, getLang } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import {
  BULLETIN_CATEGORY_LABELS, bulletinStats, canManageBulletin, getBulletin, markBulletinRead,
} from "@/lib/domain/bulletins";
import { formatDate } from "@/lib/format";
import { PageHeader, Card, ButtonLink, Badge, Notice, KeyValue } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { CategoryBadge, PinnedMark, PlainText } from "@/components/updates/bulletin-bits";
import { acknowledgeBulletinAction, archiveBulletinAction } from "../actions";
import { RefreshOnce } from "@/components/updates/refresh-once";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Update") };
}

export default async function BulletinPage({ params }: { params: Promise<{ id: string }> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  let b;
  try {
    b = getBulletin(user, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const justRead = !b.read_at && !b.archived_at;
  if (justRead) markBulletinRead(user, id);

  const manage = canManageBulletin(user, b.station_id);
  const stats = manage ? bulletinStats(user, id) : null;
  const needsAck = !!b.requires_ack && !b.acknowledged_at && !b.archived_at;

  return (
    <>
      {justRead && <RefreshOnce />}
      <PageHeader
        title={b.title}
        crumbs={[{ label: tr("Updates"), href: "/updates" }, { label: tr(BULLETIN_CATEGORY_LABELS[b.category]) }]}
        meta={
          <>
            <CategoryBadge category={b.category} label={tr(BULLETIN_CATEGORY_LABELS[b.category])} />
            {!!b.is_pinned && <PinnedMark label={tr("Pinned")} />}
            {b.archived_at && <Badge tone="slate">{tr("Archived")}</Badge>}
          </>
        }
        actions={
          manage && !b.archived_at ? (
            <>
              <ButtonLink href={`/updates/${b.id}/edit`}>
                <Pencil className="h-4 w-4" aria-hidden /> {tr("Edit")}
              </ButtonLink>
              <ActionForm
                action={archiveBulletinAction}
                confirm={tr("Archived updates are hidden from staff. This cannot be undone from the app.")}
                confirmTitle={tr("Archive this update?")}
                confirmLabel={tr("Archive")}
                danger
              >
                <input type="hidden" name="id" value={b.id} />
                <SubmitButton variant="danger">
                  <Archive className="h-4 w-4" aria-hidden /> {tr("Archive")}
                </SubmitButton>
              </ActionForm>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {needsAck && (
            <Notice tone="amber" title={tr("Your acknowledgement is required")}>
              {tr("Read this update carefully, then confirm below.")}
            </Notice>
          )}
          <Card>
            <PlainText text={b.body} />
            <div className="mt-6 border-t border-slate-100 pt-4">
              {needsAck ? (
                <ActionForm action={acknowledgeBulletinAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <SubmitButton pendingLabel={tr("Saving…")}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> {tr("I have read and understood")}
                  </SubmitButton>
                </ActionForm>
              ) : b.acknowledged_at && b.requires_ack ? (
                <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {tr("You acknowledged this on {date}", { date: formatDate(b.acknowledged_at, { time: true, lang }) })}
                </p>
              ) : (
                <p className="text-xs text-slate-500">{tr("This summary is for staff awareness and is not the official text. Refer to the cited source.")}</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={tr("Details")}>
            <KeyValue
              items={[
                { label: tr("Audience"), value: b.station_id ? (b.station_name ?? "—") : tr("All stations") },
                { label: tr("Effective date"), value: b.effective_date ? formatDate(b.effective_date, { lang }) : tr("Immediately") },
                { label: tr("Reference"), value: b.reference ? <span className="font-mono text-[13px] break-all">{b.reference}</span> : null },
                { label: tr("Published by"), value: b.publisher_name },
                { label: tr("Published"), value: formatDate(b.created_at, { time: true, lang }) },
                ...(b.updated_at !== b.created_at ? [{ label: tr("Last edited"), value: formatDate(b.updated_at, { time: true, lang }) }] : []),
              ]}
            />
          </Card>

          {stats && (
            <Card title={tr("Reach")} description={tr("Visible to publishers only.")}>
              <dl className="grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-200 text-center">
                {[
                  { label: tr("Recipients"), value: stats.audience },
                  { label: tr("Read"), value: stats.read },
                  { label: tr("Acknowledged"), value: b.requires_ack ? stats.acknowledged : "—" },
                ].map((s) => (
                  <div key={s.label} className="px-2 py-3">
                    <dt className="text-xs font-medium text-slate-500">{s.label}</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums text-navy-900">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4 text-slate-500" aria-hidden />
                {b.requires_ack ? tr("Not yet acknowledged ({n})", { n: stats.pending.length }) : tr("Not yet read ({n})", { n: stats.pending.length })}
              </h3>
              {stats.pending.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-700">{tr("Everyone has seen this update.")}</p>
              ) : (
                <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {stats.pending.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{p.name}</span>
                        <span className="block truncate text-xs text-slate-500">{p.role_name}{p.station_name ? ` · ${p.station_name}` : ""}</span>
                      </span>
                      {b.requires_ack && p.read_at && <Badge tone="blue">{tr("Read")}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
