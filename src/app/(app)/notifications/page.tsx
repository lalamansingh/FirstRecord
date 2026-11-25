import { getTr, getLang } from "@/lib/i18n/server";
import { trDyn } from "@/lib/i18n/dynamic";
import Link from "next/link";
import { Bell, Settings } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listNotifications, unreadCount, NOTIFICATION_KIND_LABELS } from "@/lib/domain/notifications";
import { formatDate, formatRelative } from "@/lib/format";
import { PageHeader, Card, EmptyState, ButtonLink, Badge, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { markNotificationReadAction, markAllNotificationsReadAction } from "./actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Notifications") };
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";
  const items = listNotifications(user.id, { unreadOnly, limit: 100 });
  const unread = unreadCount(user.id);

  return (
    <>
      <PageHeader
        title={tr("Notifications")}
        description={tr("Assignments, review requests, reminders and status changes. Previews never include statement content.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Notifications") }]}
        actions={
          <>
            <ButtonLink href="/settings?tab=notifications">
              <Settings className="h-4 w-4" aria-hidden /> {tr("Preferences")}
            </ButtonLink>
            {unread > 0 && (
              <ActionForm action={markAllNotificationsReadAction}>
                <SubmitButton variant="secondary">{tr("Mark all as read")}</SubmitButton>
              </ActionForm>
            )}
          </>
        }
      />
      <nav aria-label={tr("Filter notifications")} className="mb-4 flex gap-2">
        {[
          { key: "all", label: tr("All"), href: "/notifications" },
          { key: "unread", label: tr("Unread ({n})", { n: unread }), href: "/notifications?filter=unread" },
        ].map((t) => {
          const active = (t.key === "unread") === unreadOnly;
          return (
            <Link key={t.key} href={t.href} aria-current={active ? "page" : undefined} className={cx("rounded-md border px-3 py-1 text-sm", active ? "border-navy-300 bg-navy-50 font-medium text-navy-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
      {items.length === 0 ? (
        <EmptyState icon={<Bell className="h-8 w-8" />} title={unreadOnly ? tr("No unread notifications") : tr("No notifications yet")} description={tr("You'll be notified about assignments, review requests and approaching deadlines.")} />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id} className={cx("flex items-start gap-3 px-4 py-3", !n.read_at && "bg-navy-50/50")}>
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-navy-700")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cx("text-sm", n.read_at ? "text-slate-700" : "font-medium text-slate-900")}>
                    {n.link ? <Link href={n.link} className="hover:text-[#183E7C] hover:underline">{n.title}</Link> : n.title}
                    {!n.read_at && <span className="sr-only"> (unread)</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge>{trDyn(tr, NOTIFICATION_KIND_LABELS[n.kind] ?? n.kind)}</Badge>
                    <time dateTime={n.created_at} title={formatDate(n.created_at, { time: true, lang })}>{formatRelative(n.created_at, lang)}</time>
                  </p>
                </div>
                {!n.read_at && (
                  <ActionForm action={markNotificationReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <SubmitButton variant="ghost" size="sm">{tr("Mark read")}</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
