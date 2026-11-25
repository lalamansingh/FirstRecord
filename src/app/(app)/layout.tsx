import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { unreadCount, generateTaskReminders } from "@/lib/domain/notifications";
import { unreadBulletinCount } from "@/lib/domain/bulletins";
import { AppShell, type NavItem } from "@/components/shell";
import { get } from "@/lib/db";
import { getUiLang, UI_LANGS } from "@/lib/i18n/ui-lang";
import { LangProvider } from "@/lib/i18n/client";
import { ForcePasswordChange } from "@/components/auth/force-password-change";
import { SosListener } from "@/components/sos/sos-listener";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  try {
    generateTaskReminders();
  } catch (e) {
    console.error("[reminders]", (e as Error).message);
  }

  const lang = await getUiLang(user.preferredLanguage);
  const mustChange = !!get<{ m: number }>("SELECT must_change_password AS m FROM users WHERE id = ?", user.id)?.m;

  const nav: NavItem[] = [
    { href: "/", label: "Overview", icon: "overview" },
    ...(can(user, "case.view.assigned") || can(user, "case.view.station") || can(user, "case.view.all")
      ? [{ href: "/cases", label: "Cases", icon: "cases" } as NavItem]
      : []),
    ...(can(user, "statement.create") ? [{ href: "/intake", label: "New Report", icon: "new" } as NavItem] : []),
    ...(can(user, "task.view") ? [{ href: "/tasks", label: "Tasks", icon: "tasks" } as NavItem] : []),
    ...(can(user, "record.view") || can(user, "audit.view")
      ? [{ href: "/records", label: "Records", icon: "records" } as NavItem]
      : []),
    ...(can(user, "online.view") ? [{ href: "/online-complaints", label: "Online Complaints", icon: "online" } as NavItem] : []),
    { href: "/updates", label: "Updates", icon: "updates", badge: unreadBulletinCount(user.id) || undefined },
    { href: "/sos", label: "SOS", icon: "sos" },
    ...(can(user, "analytics.view") ? [{ href: "/analytics", label: "Reports & Analytics", icon: "analytics" } as NavItem] : []),
    ...(can(user, "user.manage") || can(user, "role.manage")
      ? [{ href: "/admin/users", label: "Users & Roles", icon: "users" } as NavItem]
      : []),
    ...(can(user, "legal.manage") ? [{ href: "/legal", label: "Legal provisions", icon: "legal" } as NavItem] : []),
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <LangProvider lang={lang}>
    <AppShell
      nav={nav}
      user={{
        name: user.name,
        email: user.email,
        roleName: user.roleName,
        stationName: user.stationName,
        stationCode: user.stationCode,
      }}
      unread={unreadCount(user.id)}
      language={lang}
      languages={UI_LANGS.map((l) => ({ code: l.code, native: l.native }))}
    >
      {mustChange ? <ForcePasswordChange name={user.name} /> : children}
      {!mustChange && <SosListener />}
    </AppShell>
    </LangProvider>
  );
}
