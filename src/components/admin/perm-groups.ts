import { ALL_PERMISSIONS, PERMISSIONS, PERMISSION_GROUPS, type Permission } from "@/lib/rbac/permissions";
import type { AuthUser } from "@/lib/rbac/access";
import type { PermGroup } from "./role-editor";
import type { MsgKey, Tr } from "@/lib/i18n/messages";

const same: Tr = (k) => k;

export function groupedPermissions(tr: Tr = same): { label: string; perms: Permission[] }[] {
  return PERMISSION_GROUPS.map((g) => ({
    label: tr(g.label as MsgKey),
    perms: ALL_PERMISSIONS.filter((p) => g.prefix.some((pre) => p.startsWith(pre))),
  }));
}

export function editorGroups(actor: AuthUser, tr: Tr = same): PermGroup[] {
  return groupedPermissions(tr).map((g) => ({
    label: g.label,
    perms: g.perms.map((p) => ({ key: p, description: tr(PERMISSIONS[p] as MsgKey), grantable: actor.permissions.has(p) })),
  }));
}
