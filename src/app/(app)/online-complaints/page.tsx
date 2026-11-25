import Link from "next/link";
import { ExternalLink, Inbox } from "lucide-react";
import { getTr, getLang } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { listOnlineComplaints, onlineStatusCounts, ONLINE_STATUS_LABELS, type OnlineStatus } from "@/lib/domain/online-complaints";
import { formatDate, formatRelative } from "@/lib/format";
import { PageHeader, Card, Table, Th, Td, EmptyState, Pagination, Tabs, buttonClass, inputClass } from "@/components/ui";
import { OnlineStatusBadge } from "@/components/online/status-badge";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Online Complaints") };
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
const TABS = ["open", "submitted", "under_verification", "verified", "converted", "rejected", "duplicate", "all"] as const;

export default async function OnlineComplaintsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requirePagePermission("online.view");
  const sp = await searchParams;
  const tabRaw = one(sp.status) ?? "open";
  const tab = (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "open";
  const q = one(sp.q)?.slice(0, 100) ?? null;
  const { rows, total, page, pageSize } = listOnlineComplaints(user, { status: tab === "all" ? null : tab, q, page: Number(one(sp.page)) || 1 });
  const counts = onlineStatusCounts(user);
  const showStation = can(user, "case.view.all");

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | null> = { status: tab === "open" ? null : tab, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/online-complaints${s ? `?${s}` : ""}`;
  };
  const tabLabel = (k: (typeof TABS)[number]) =>
    k === "open" ? tr("Needs action") : k === "all" ? tr("All") : tr(ONLINE_STATUS_LABELS[k as OnlineStatus] as MsgKey);

  return (
    <>
      <PageHeader
        title={tr("Online Complaints")}
        description={tr("Complaints submitted by the public through the online form. Verify each one before opening a case. A submission is not a registered FIR.")}
        actions={
          <Link href="/complaint" target="_blank" className={buttonClass("secondary")}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            {tr("Open public form")}
          </Link>
        }
      />

      <Tabs active={tab} tabs={TABS.map((k) => ({ key: k, label: tabLabel(k), href: href({ status: k === "open" ? null : k, page: null }), count: counts[k] }))} />

      <Card padded={false} className="mt-4">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-4" action="/online-complaints">
          {tab !== "open" && <input type="hidden" name="status" value={tab} />}
          <div className="min-w-[240px] flex-1">
            <label htmlFor="oc-q" className="sr-only">{tr("Search by tracking code or name")}</label>
            <input id="oc-q" name="q" defaultValue={q ?? ""} placeholder={tr("Search by tracking code or name")} className={inputClass} />
          </div>
          <button className={buttonClass("secondary")}>{tr("Search")}</button>
        </form>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Inbox className="h-6 w-6" />} title={tr("No online complaints here")} description={tr("New submissions from the public form appear in this queue.")} />
          </div>
        ) : (
          <Table caption={tr("Online Complaints")}>
            <thead>
              <tr>
                <Th>{tr("Tracking code")}</Th>
                <Th>{tr("Complainant")}</Th>
                <Th>{tr("Incident")}</Th>
                {showStation && <Th>{tr("Station")}</Th>}
                <Th>{tr("Status")}</Th>
                <Th>{tr("Assigned")}</Th>
                <Th>{tr("Received")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <Td>
                    <Link href={`/online-complaints/${r.id}`} className="font-mono text-[13px] font-semibold text-[#1F4E9C] hover:underline">
                      {r.tracking_code}
                    </Link>
                  </Td>
                  <Td>{r.complainant_name}</Td>
                  <Td>
                    <p>{r.incident_type ? tr(r.incident_type as MsgKey) : "—"}</p>
                    {r.incident_location && <p className="max-w-[260px] truncate text-xs text-slate-500">{r.incident_location}</p>}
                  </Td>
                  {showStation && <Td>{r.station_code ?? "—"}</Td>}
                  <Td>
                    <OnlineStatusBadge status={r.status} />
                    {r.case_reference && <p className="mt-1 text-xs text-slate-500">{r.case_reference}</p>}
                  </Td>
                  <Td>{r.assignee_name ?? <span className="text-slate-400">{tr("Unassigned")}</span>}</Td>
                  <Td>
                    <span title={formatDate(r.created_at, { time: true, lang })}>{formatRelative(r.created_at, lang)}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="mt-4">
        <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => href({ page: String(p) })} />
      </div>
    </>
  );
}
