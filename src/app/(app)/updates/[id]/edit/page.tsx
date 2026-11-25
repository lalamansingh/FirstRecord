import { trDyn } from "@/lib/i18n/dynamic";
import { notFound } from "next/navigation";
import { getTr } from "@/lib/i18n/server";
import { requirePagePermission } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import {
  BULLETIN_CATEGORIES, BULLETIN_CATEGORY_LABELS, canManageBulletin, getBulletin, publishTargets,
} from "@/lib/domain/bulletins";
import { PageHeader, Card, Notice } from "@/components/ui";
import { BulletinForm } from "@/components/updates/bulletin-form";
import { updateBulletinAction } from "../../actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Edit update") };
}

export default async function EditBulletinPage({ params }: { params: Promise<{ id: string }> }) {
  const tr = await getTr();
  const user = await requirePagePermission("bulletin.publish");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let b;
  try {
    b = getBulletin(user, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  if (!canManageBulletin(user, b.station_id) || b.archived_at) notFound();

  return (
    <>
      <PageHeader
        title={tr("Edit update")}
        crumbs={[{ label: tr("Updates"), href: "/updates" }, { label: b.title, href: `/updates/${b.id}` }, { label: tr("Edit") }]}
      />
      <div className="max-w-3xl space-y-4">
        <Notice tone="slate">{tr("Edits are recorded in the audit log. Recipients are not notified again.")}</Notice>
        <Card>
          <BulletinForm
            action={updateBulletinAction}
            values={{
              id: b.id,
              title: b.title,
              body: b.body,
              category: b.category,
              stationId: b.station_id,
              effectiveDate: b.effective_date,
              reference: b.reference,
              isPinned: !!b.is_pinned,
              requiresAck: !!b.requires_ack,
            }}
            categories={BULLETIN_CATEGORIES.map((c) => ({ key: c, label: tr(BULLETIN_CATEGORY_LABELS[c]) }))}
            targets={publishTargets(user)}
            submitLabel={tr("Save changes")}
          />
        </Card>
      </div>
    </>
  );
}
