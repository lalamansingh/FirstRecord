import { trDyn } from "@/lib/i18n/dynamic";
import Link from "next/link";
import { Megaphone, Plus, CheckCircle2 } from "lucide-react";
import { getTr, getLang } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import {
  BULLETIN_CATEGORIES, BULLETIN_CATEGORY_LABELS, bulletinCategoryCounts, isBulletinCategory, listBulletins, unreadBulletinCount,
} from "@/lib/domain/bulletins";
import { formatDate, formatRelative } from "@/lib/format";
import { PageHeader, Card, EmptyState, ButtonLink, Tabs, Badge, Notice, cx } from "@/components/ui";
import { CategoryBadge, CategoryIcon, PinnedMark } from "@/components/updates/bulletin-bits";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Updates") };
}

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<{ category?: string; view?: string }> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requireUser();
  const sp = await searchParams;
  const canPublish = can(user, "bulletin.publish");
  const archived = canPublish && sp.view === "archived";
  const category = isBulletinCategory(sp.category) ? sp.category : null;
  const items = listBulletins(user, { category, archived });
  const counts = bulletinCategoryCounts(user);
  const unread = unreadBulletinCount(user.id);
  const pendingAck = items.filter((b) => b.requires_ack && !b.acknowledged_at && !b.archived_at).length;

  const tabs = [
    { key: "all", label: tr("All"), href: "/updates", count: counts.all },
    ...BULLETIN_CATEGORIES.map((c) => ({
      key: c,
      label: tr(BULLETIN_CATEGORY_LABELS[c]),
      href: `/updates?category=${c}`,
      count: counts[c],
    })),
    ...(canPublish ? [{ key: "archived", label: tr("Archived"), href: "/updates?view=archived" }] : []),
  ];

  return (
    <>
      <PageHeader
        title={tr("Updates")}
        description={tr("New rules, circulars, advisories and system updates for your station. Summaries are for staff awareness — always refer to the official source.")}
        crumbs={[{ label: tr("Overview"), href: "/" }, { label: tr("Updates") }]}
        meta={
          <>
            {unread > 0 && <Badge tone="blue">{tr("{n} unread", { n: unread })}</Badge>}
            {pendingAck > 0 && <Badge tone="amber">{tr("{n} awaiting your acknowledgement", { n: pendingAck })}</Badge>}
          </>
        }
        actions={
          canPublish ? (
            <ButtonLink href="/updates/new" variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> {tr("Publish update")}
            </ButtonLink>
          ) : undefined
        }
      />

      <Tabs tabs={tabs} active={archived ? "archived" : (category ?? "all")} />

      {archived && <Notice tone="slate" className="mb-4">{tr("Archived updates are hidden from staff. Only publishers can see this list.")}</Notice>}

      {items.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-6 w-6" />}
          title={archived ? tr("No archived updates") : tr("No updates yet")}
          description={tr("New rules, circulars and announcements published for your station will appear here.")}
        />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {items.map((b) => {
              const isUnread = !b.read_at && !b.archived_at;
              const needsAck = !!b.requires_ack && !b.acknowledged_at && !b.archived_at;
              return (
                <li key={b.id} className={cx("relative flex gap-4 px-5 py-4 transition-colors hover:bg-slate-50", isUnread && "bg-navy-50/50")}>
                  <CategoryIcon category={b.category} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryBadge category={b.category} label={tr(BULLETIN_CATEGORY_LABELS[b.category])} />
                      {!!b.is_pinned && <PinnedMark label={tr("Pinned")} />}
                      {needsAck && <Badge tone="amber">{tr("Acknowledgement required")}</Badge>}
                      {!!b.requires_ack && b.acknowledged_at && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {tr("Acknowledged")}
                        </span>
                      )}
                    </div>
                    <h2 className={cx("mt-1.5 text-[15px] leading-6", isUnread ? "font-semibold text-navy-900" : "font-medium text-slate-800")}>
                      <Link href={`/updates/${b.id}`} className="after:absolute after:inset-0 hover:text-[#183E7C] focus-visible:outline-none">
                        <span className={cx("mr-2 inline-block h-2 w-2 shrink-0 rounded-full align-middle", isUnread ? "bg-navy-700" : "bg-transparent")} aria-hidden />
                        {b.title}
                        {isUnread && <span className="sr-only"> ({tr("unread")})</span>}
                      </Link>
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{b.body.replace(/\s+/g, " ")}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{b.station_id ? (b.station_name ?? tr("My station")) : tr("All stations")}</span>
                      {b.effective_date && <span>{tr("Effective {date}", { date: formatDate(b.effective_date, { lang }) })}</span>}
                      {b.reference && <span className="font-mono">{b.reference}</span>}
                      <time dateTime={b.created_at} title={formatDate(b.created_at, { time: true, lang })}>
                        {tr("Published {when}", { when: formatRelative(b.created_at, lang) })}
                      </time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
