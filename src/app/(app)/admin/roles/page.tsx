import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { listRoles } from "@/lib/domain/admin";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { groupedPermissions } from "@/components/admin/perm-groups";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { getTr } from "@/lib/i18n/server";
import type { MsgKey, Tr } from "@/lib/i18n/messages";


export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Roles & permissions") };
}

export default async function RolesPage() {
  const actor = await requirePagePermission("user.manage", "role.manage");
  const roles = listRoles();
  const canEdit = can(actor, "role.manage");
  const tr = await getTr();
  const groups = groupedPermissions(tr);

  return (
    <>
      <PageHeader
        title={tr("Users & Roles")}
        description={tr("Access is denied unless a role explicitly grants it. Permissions are enforced on the server for every operation.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Users & Roles") }]}
        actions={canEdit ? <ButtonLink href="/admin/roles/new" variant="primary"><Plus className="h-4 w-4" aria-hidden /> {tr("New role")}</ButtonLink> : undefined}
      />
      <AdminTabs active="roles" canUsers={can(actor, "user.manage")} canRoles={canEdit} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {canEdit ? <Link href={`/admin/roles/${r.id}`} className="text-[#1B6650] hover:underline">{roleName(tr, r)}</Link> : roleName(tr, r)}
                </h2>
                <p className="mt-1 text-xs text-slate-600">{r.is_system ? tr((r.description || "No description.") as MsgKey) : r.description || tr("No description.")}</p>
              </div>
              <Badge tone={r.is_system ? "slate" : "blue"}>{r.is_system ? tr("Built-in") : tr("Custom")}</Badge>
            </div>
            <p className="mt-3 text-xs text-slate-500">{tr("{count} permissions", { count: r.permissions.length })} · {tr(r.user_count === 1 ? "{count} user" : "{count} users", { count: r.user_count })}</p>
          </Card>
        ))}
      </div>

      <Card title={tr("Role & permission matrix")} description={tr("Read-only overview of what each role can do.")} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{tr("Permissions granted to each role")}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">{tr("Permission")}</th>
                {roles.map((r) => (
                  <th key={r.id} scope="col" className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-600">{roleName(tr, r)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.label} label={g.label} perms={g.perms} roles={roles} tr={tr} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/** Built-in role names are translated; custom role names are shown as entered. */
function roleName(tr: Tr, r: { name: string; is_system: number | boolean }) {
  return r.is_system ? tr(r.name as MsgKey) : r.name;
}

function GroupRows({ label, perms, roles, tr }: { label: string; perms: (keyof typeof PERMISSIONS)[]; roles: ReturnType<typeof listRoles>; tr: Tr }) {
  return (
    <>
      <tr>
        <th scope="colgroup" colSpan={roles.length + 1} className="border-b border-slate-200 bg-white px-3 pb-1 pt-4 text-left text-xs font-semibold text-slate-500">
          {label}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="hover:bg-slate-50">
          <th scope="row" className="sticky left-0 border-b border-slate-100 bg-white px-3 py-1.5 text-left font-normal text-slate-700">
            {tr(PERMISSIONS[p] as MsgKey)} <span className="font-mono text-[11px] text-slate-400">{p}</span>
          </th>
          {roles.map((r) => (
            <td key={r.id} className="border-b border-slate-100 px-2 py-1.5 text-center">
              {r.permissions.includes(p) ? (
                <><Check className="mx-auto h-4 w-4 text-emerald-700" aria-hidden /><span className="sr-only">{tr("Granted")}</span></>
              ) : (
                <span className="text-slate-300" aria-label={tr("Not granted")}>—</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
