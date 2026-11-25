import { requirePagePermission } from "@/lib/auth/session";
import { assignableRoles } from "@/lib/domain/admin";
import { listStations } from "@/lib/domain/workflow";
import { CreateUserForm } from "@/components/admin/user-forms";
import { Card, PageHeader } from "@/components/ui";
import { createUserAction } from "../../actions";
import { getTr } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("New user") };
}

export default async function NewUserPage() {
  const actor = await requirePagePermission("user.manage");
  const tr = await getTr();
  const roles = assignableRoles(actor).map((r) => ({ value: r.id, label: r.is_system ? tr(r.name as MsgKey) : r.name }));
  const stations = listStations().map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));
  const fixed = actor.stationId ? { value: actor.stationId, label: `${actor.stationCode} — ${actor.stationName}` } : null;
  return (
    <>
      <PageHeader
        title={tr("New user")}
        description={tr("Create an account. Grant the least privilege needed for the person's duties.")}
        crumbs={[{ label: tr("Users & Roles"), href: "/admin/users" }, { label: tr("New user") }]}
      />
      <div className="max-w-3xl">
        <Card>
          <CreateUserForm action={createUserAction} roles={roles} stations={stations} fixedStation={fixed} />
        </Card>
      </div>
    </>
  );
}
