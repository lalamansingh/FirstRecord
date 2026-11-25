import { requirePagePermission } from "@/lib/auth/session";
import { editorGroups } from "@/components/admin/perm-groups";
import { RolePermissionEditor } from "@/components/admin/role-editor";
import { Card, PageHeader, inputClass } from "@/components/ui";
import { createRoleAction } from "../../actions";
import { getTr } from "@/lib/i18n/server";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("New role") };
}

export default async function NewRolePage() {
  const actor = await requirePagePermission("role.manage");
  const tr = await getTr();
  return (
    <>
      <PageHeader
        title={tr("New custom role")}
        description={tr("You can only grant permissions you hold yourself.")}
        crumbs={[{ label: tr("Users & Roles"), href: "/admin/roles" }, { label: tr("New role") }]}
      />
      <Card>
        <RolePermissionEditor action={createRoleAction} roleKey="custom" initial={[]} groups={editorGroups(actor, tr)} create submitLabel={tr("Create role")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-800">{tr("Role name")} <span className="text-red-700" aria-hidden>*</span></label>
              <input id="name" name="name" required maxLength={60} className={inputClass} />
            </div>
            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-800">{tr("Description")}</label>
              <input id="description" name="description" maxLength={300} className={inputClass} />
            </div>
          </div>
        </RolePermissionEditor>
      </Card>
    </>
  );
}
