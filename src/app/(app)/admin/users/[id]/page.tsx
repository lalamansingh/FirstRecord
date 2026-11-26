import { notFound } from "next/navigation";
import { localizeAuditSummary } from "@/lib/i18n/audit-summary";
import { Lock } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { all } from "@/lib/db";
import { getManagedUser, assignableRoles, getRole, activeSessionCount } from "@/lib/domain/admin";
import { listStations } from "@/lib/domain/workflow";
import { formatDate, formatRelative } from "@/lib/format";
import { NotFoundError } from "@/lib/errors";
import { AdminTabs, STATUS_TONE, isLocked } from "@/components/admin/admin-tabs";
import { EditUserForm, ResetPasswordForm, SimpleUserAction, StatusActionForm } from "@/components/admin/user-forms";
import { Badge, Card, KeyValue, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { getTr, getLang } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import { updateUserAction, setUserStatusAction, resetPasswordAction, unlockUserAction, revokeSessionsAction } from "../../actions";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("User") };
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("user.manage");
  const { id } = await params;
  let user;
  try {
    user = getManagedUser(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const isSelf = user.id === actor.id;
  const roles = assignableRoles(actor);
  if (!roles.some((r) => r.id === user.role_id)) {
    const current = getRole(user.role_id);
    if (current) roles.unshift(current);
  }
  const role = getRole(user.role_id);
  const tr = await getTr();
  const lang = await getLang();
  const roleLabel = (r: { name: string; is_system: number }) => (r.is_system ? tr(r.name as MsgKey) : r.name);
  const STATUS_LABEL = { active: tr("Active"), suspended: tr("Suspended"), deactivated: tr("Deactivated") } as const;
  const stations = listStations().map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));
  const fixed = actor.stationId ? { value: actor.stationId, label: `${actor.stationCode} — ${actor.stationName}` } : null;
  const locked = isLocked(user.locked_until);
  const sessions = activeSessionCount(user.id);
  const history = all<{ id: string; action: string; summary: string; created_at: string; actor_name: string | null }>(
    `SELECT a.id, a.action, a.summary, a.created_at, u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.entity_type = 'user' AND a.entity_id = ? ORDER BY a.seq DESC LIMIT 20`,
    user.id,
  );

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        crumbs={[{ label: tr("Users & Roles"), href: "/admin/users" }, { label: user.name }]}
        meta={
          <>
            <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
            {locked && <Badge tone="red"><Lock className="h-3 w-3" aria-hidden /> {tr("Locked until {time}", { time: formatDate(user.locked_until, { time: true, lang }) })}</Badge>}
            {user.must_change_password ? <Badge tone="amber">{tr("Must change password")}</Badge> : null}
            
          </>
        }
      />
      <AdminTabs active="users" canUsers canRoles={can(actor, "role.manage")} />
      {isSelf && <Notice tone="slate" className="mb-4">{tr("This is your own account. You cannot change your own role, station or status.")}</Notice>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={tr("Account details")}>
            <EditUserForm
              action={updateUserAction}
              user={{ id: user.id, name: user.name, badgeNumber: user.badge_number, roleId: user.role_id, stationId: user.station_id }}
              roles={roles.map((r) => ({ value: r.id, label: roleLabel(r) }))}
              stations={stations}
              fixedStation={fixed}
              isSelf={isSelf}
            />
          </Card>
          <Card title={tr("Account history")} description={tr("Administrative and security events for this account.")}>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">{tr("No recorded events.")}</p>
            ) : (
              <Table caption={tr("Account history")}>
                <thead><tr><Th>{tr("When")}</Th><Th>{tr("Event")}</Th><Th>{tr("By")}</Th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <Td className="whitespace-nowrap text-xs">{formatDate(h.created_at, { time: true, lang })}</Td>
                      <Td>{localizeAuditSummary(h.summary, tr)}<p className="text-xs text-slate-400">{h.action}</p></Td>
                      <Td className="text-xs">{h.actor_name ?? tr("System")}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={tr("Summary")}>
            <KeyValue
              items={[
                { label: tr("Role"), value: role ? roleLabel(role) : undefined },
                { label: tr("Station"), value: user.station_name ?? "—" },
                { label: tr("Created"), value: formatDate(user.created_at, { lang }) },
                { label: tr("Last sign-in"), value: user.last_login_at ? formatRelative(user.last_login_at, lang) : tr("Never") },
                { label: tr("Active sessions"), value: String(sessions) },
                { label: tr("Permissions"), value: tr("{count} granted by role", { count: role?.permissions.length ?? 0 }) },
              ]}
            />
          </Card>

          {!isSelf && (
            <Card title={tr("Account status")}>
              <div className="space-y-4">
                {user.status !== "active" && (
                  <StatusActionForm action={setUserStatusAction} userId={user.id} status="active" label={tr("Reactivate account")} description={tr("The user will be able to sign in again with their existing password.")} />
                )}
                {user.status === "active" && (
                  <StatusActionForm action={setUserStatusAction} userId={user.id} status="suspended" label={tr("Suspend account")} description={tr("The user is signed out everywhere and cannot sign in until reactivated. Their records and history are kept.")} />
                )}
                {user.status !== "deactivated" && (
                  <StatusActionForm action={setUserStatusAction} userId={user.id} status="deactivated" label={tr("Deactivate account")} danger description={tr("Use when the person leaves the station. The user is signed out and cannot sign in. Records they created remain attributed to them. This can be reversed.")} />
                )}
              </div>
            </Card>
          )}

          <Card title={tr("Security")}>
            <div className="space-y-4">
              {locked && (
                <SimpleUserAction action={unlockUserAction} userId={user.id} label={tr("Unlock account")} confirm={tr("Clear the temporary lockout caused by repeated failed sign-ins.")} />
              )}
              {sessions > 0 && !isSelf && (
                <SimpleUserAction action={revokeSessionsAction} userId={user.id} label={tr(sessions > 1 ? "Sign out {count} sessions" : "Sign out {count} session", { count: sessions })} confirm={tr("All active sessions for this user will end immediately.")} />
              )}
              {isSelf ? (
                <p className="text-sm text-slate-600">{tr("Change your own password under")} <a className="text-[#1B6650] underline" href="/settings?tab=profile">{tr("Settings → Profile")}</a>.</p>
              ) : (
                <ResetPasswordForm action={resetPasswordAction} userId={user.id} />
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
