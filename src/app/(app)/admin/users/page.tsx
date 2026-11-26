import Link from "next/link";
import { Lock, UserPlus } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { listUsers, listRoles } from "@/lib/domain/admin";
import { listStations } from "@/lib/domain/workflow";
import { formatRelative } from "@/lib/format";
import { AdminTabs, STATUS_TONE, isLocked } from "@/components/admin/admin-tabs";
import { getTr, getLang } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Pagination, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Users") };
}
const PAGE_SIZE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission("user.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = {
    q: sp.q?.slice(0, 100) || undefined,
    role: sp.role || undefined,
    status: ["active", "suspended", "deactivated"].includes(sp.status ?? "") ? sp.status : undefined,
    station: sp.station || undefined,
  };
  const { rows, total } = listUsers(actor, { ...filters, page, pageSize: PAGE_SIZE });
  const roles = listRoles();
  const stations = listStations();
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) u.set(k, v);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };
  const filtered = Object.values(filters).some(Boolean);
  const tr = await getTr();
  const lang = await getLang();
  const STATUS_LABEL = { active: tr("Active"), suspended: tr("Suspended"), deactivated: tr("Deactivated") } as const;

  return (
    <>
      <PageHeader
        title={tr("Users & Roles")}
        description={actor.stationId ? tr("Accounts for {station}. You can only manage users in your own station.", { station: actor.stationName ?? "" }) : tr("Accounts across all stations.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Users & Roles") }]}
        actions={<ButtonLink href="/admin/users/new" variant="primary"><UserPlus className="h-4 w-4" aria-hidden /> {tr("New user")}</ButtonLink>}
      />
      <AdminTabs active="users" canUsers canRoles={can(actor, "role.manage")} />

      <Card padded={false}>
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4" role="search" aria-label={tr("Filter users")}>
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">{tr("Search")}</label>
            <input id="q" name="q" defaultValue={filters.q} placeholder={tr("Name, email or badge")} className={inputClass} maxLength={100} />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-xs font-medium text-slate-600">{tr("Role")}</label>
            <select id="role" name="role" defaultValue={filters.role ?? ""} className={inputClass}>
              <option value="">{tr("All roles")}</option>
              {roles.map((r) => <option key={r.id} value={r.key}>{r.is_system ? tr(r.name as MsgKey) : r.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-xs font-medium text-slate-600">{tr("Status")}</label>
            <select id="status" name="status" defaultValue={filters.status ?? ""} className={inputClass}>
              <option value="">{tr("Any status")}</option>
              <option value="active">{STATUS_LABEL.active}</option>
              <option value="suspended">{STATUS_LABEL.suspended}</option>
              <option value="deactivated">{STATUS_LABEL.deactivated}</option>
            </select>
          </div>
          {!actor.stationId && (
            <div>
              <label htmlFor="station" className="mb-1 block text-xs font-medium text-slate-600">{tr("Station")}</label>
              <select id="station" name="station" defaultValue={filters.station ?? ""} className={inputClass}>
                <option value="">{tr("All stations")}</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className={buttonClass("secondary")}>{tr("Apply")}</button>
          {filtered && <Link href="/admin/users" className={buttonClass("ghost")}>{tr("Clear")}</Link>}
        </form>

        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title={filtered ? tr("No users match these filters") : tr("No users yet")} description={filtered ? tr("Try different filters.") : tr("Create the first account for this station.")} />
          </div>
        ) : (
          <Table caption={tr("Users")}>
            <thead>
              <tr><Th>{tr("Name")}</Th><Th>{tr("Role")}</Th><Th>{tr("Station")}</Th><Th>{tr("Status")}</Th><Th>{tr("Last sign-in")}</Th></tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const locked = isLocked(u.locked_until);
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/admin/users/${u.id}`} className="font-medium text-[#1B6650] hover:underline">{u.name}</Link>
                      <p className="text-xs text-slate-500">{u.email}{u.badge_number ? ` · ${u.badge_number}` : ""}</p>
                    </Td>
                    <Td>{tr(u.role_name as MsgKey)}</Td>
                    <Td>{u.station_code ?? <span className="text-slate-400">—</span>}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                        {locked && <Badge tone="red"><Lock className="h-3 w-3" aria-hidden /> {tr("Locked")}</Badge>}
                        
                      </div>
                    </Td>
                    <Td className="text-xs text-slate-500">{u.last_login_at ? formatRelative(u.last_login_at, lang) : tr("Never")}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={qs} />
      </Card>
    </>
  );
}
