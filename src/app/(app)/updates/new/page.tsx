import { trDyn } from "@/lib/i18n/dynamic";
import { getTr } from "@/lib/i18n/server";
import { requirePagePermission } from "@/lib/auth/session";
import { BULLETIN_CATEGORIES, BULLETIN_CATEGORY_LABELS, publishTargets } from "@/lib/domain/bulletins";
import { PageHeader, Card, Notice } from "@/components/ui";
import { BulletinForm } from "@/components/updates/bulletin-form";
import { createBulletinAction } from "../actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Publish update") };
}

export default async function NewBulletinPage() {
  const tr = await getTr();
  const user = await requirePagePermission("bulletin.publish");
  const targets = publishTargets(user);
  return (
    <>
      <PageHeader
        title={tr("Publish update")}
        description={tr("Share a new rule, circular, advisory or system update. Every recipient is notified.")}
        crumbs={[{ label: tr("Updates"), href: "/updates" }, { label: tr("Publish update") }]}
      />
      <div className="max-w-3xl space-y-4">
        <Notice tone="slate">
          {tr("Write a clear summary for staff and cite the official source. Do not include personal details or case information.")}
        </Notice>
        <Card>
          <BulletinForm
            action={createBulletinAction}
            categories={BULLETIN_CATEGORIES.map((c) => ({ key: c, label: tr(BULLETIN_CATEGORY_LABELS[c]) }))}
            targets={targets}
            submitLabel={tr("Publish and notify")}
          />
        </Card>
      </div>
    </>
  );
}
