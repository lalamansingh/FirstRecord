import { Tabs } from "@/components/ui";
import { getTr } from "@/lib/i18n/server";

export async function AdminTabs({ active, canUsers, canRoles }: { active: "users" | "roles"; canUsers: boolean; canRoles: boolean }) {
  const tr = await getTr();
  const tabs = [
    ...(canUsers ? [{ key: "users", label: tr("Users"), href: "/admin/users" }] : []),
    { key: "roles", label: canRoles ? tr("Roles & permissions") : tr("Permission matrix"), href: "/admin/roles" },
  ];
  return <Tabs tabs={tabs} active={active} />;
}

/** True while a failed-sign-in lockout is in effect. */
export function isLocked(lockedUntil: string | null | undefined) {
  return !!lockedUntil && Date.parse(lockedUntil) > Date.now();
}

export const STATUS_TONE = { active: "green", suspended: "amber", deactivated: "slate" } as const;
