import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { getRole } from "@/lib/domain/admin";
import { editorGroups } from "@/components/admin/perm-groups";
import { RolePermissionEditor } from "@/components/admin/role-editor";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Notice, PageHeader, inputClass } from "@/components/ui";
import { getTr } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import { updateRolePermissionsAction, renameRoleAction, deleteRoleAction } from "../../actions";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Edit role") };
}

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("role.manage");
  const { id } = await params;
  const role = getRole(id);
  if (!role) notFound();
  const own = role.id === actor.roleId;
  const tr = await getTr();
  const name = role.is_system ? tr(role.name as MsgKey) : role.name;
  const description = role.is_system ? tr(role.description as MsgKey) : role.description;

  return (
    <>
      <PageHeader
        title={name}
        description={description}
        crumbs={[{ label: tr("Users & Roles"), href: "/admin/roles" }, { label: name }]}
        meta={
          <>
            <Badge tone={role.is_system ? "slate" : "blue"}>{role.is_system ? tr("Built-in role") : tr("Custom role")}</Badge>
            <Badge>{tr(role.user_count === 1 ? "{count} active user" : "{count} active users", { count: role.user_count })}</Badge>
          </>
        }
      />
      {own && <Notice tone="amber" className="mb-4">{tr("This is your own role. You cannot remove role or user administration permissions from it.")}</Notice>}

      {!role.is_system && (
        <Card title={tr("Role details")} className="mb-6">
          <ActionForm action={renameRoleAction} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_2fr_auto]">
            <input type="hidden" name="roleId" value={role.id} />
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-800">{tr("Name")}</label>
              <input id="name" name="name" defaultValue={role.name} required maxLength={60} className={inputClass} />
            </div>
            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-800">{tr("Description")}</label>
              <input id="description" name="description" defaultValue={role.description} maxLength={300} className={inputClass} />
            </div>
            <SubmitButton variant="secondary">{tr("Save details")}</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card title={tr("Permissions")} description={tr("Checked permissions are granted. Unchecked means denied.")}>
        <RolePermissionEditor action={updateRolePermissionsAction} roleKey={role.key} initial={role.permissions} groups={editorGroups(actor, tr)} hidden={{ roleId: role.id }} />
      </Card>

      {!role.is_system && (
        <Card title={tr("Delete role")} className="mt-6">
          <ActionForm action={deleteRoleAction} confirmTitle={tr("Delete this role?")} confirm={tr("The role will be removed permanently. This is only possible when no user accounts use it.")} confirmLabel={tr("Delete role")} danger className="flex items-center justify-between gap-4">
            <input type="hidden" name="roleId" value={role.id} />
            <p className="text-sm text-slate-600">{tr("Custom roles can be deleted when no accounts are assigned to them.")}</p>
            <SubmitButton variant="danger" disabled={role.user_count > 0}>{tr("Delete role")}</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
