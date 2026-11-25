import { notFound } from "next/navigation";
import { requirePagePermission, requestIp } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { get } from "@/lib/db";
import { recordAccess } from "@/lib/audit";
import { loadStatement, type StatementRow } from "@/lib/domain/statements";
import { getDraftRow, listDraftsForStatement } from "@/lib/domain/drafts";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { ReviewWorkspace } from "@/components/drafts/review-workspace";
import { LegalPanel } from "@/components/legal/legal-panel";
import { getTr } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: (await getTr())("Draft review") };
}

export default async function DraftReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string; v?: string }> }) {
  const user = await requirePagePermission("statement.view");
  const tr = await getTr();
  const { id } = await params;
  const sp = await searchParams;
  let s: StatementRow;
  try {
    s = loadStatement(user, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const draft = sp.draft ? getDraftRow(sp.draft) : listDraftsForStatement(s.id)[0];
  if (draft && draft.statement_id !== s.id) notFound();
  const caseRow = s.case_id ? get<{ id: string; reference: string }>("SELECT id, reference FROM cases WHERE id = ?", s.case_id) : undefined;
  if (draft) recordAccess({ userId: user.id, entityType: "draft", entityId: draft.id, caseId: s.case_id, action: "view", ip: await requestIp() });

  return (
    <>
      <PageHeader
        title={tr("FIR draft review")}
        description={tr("Compare the draft with the source statement. Accept, edit or reject each suggestion, then mark the draft reviewed. Reviewing is internal and is not an official filing.")}
        crumbs={[
          ...(caseRow ? [{ label: tr("Cases"), href: "/cases" }, { label: caseRow.reference, href: `/cases/${caseRow.id}` }] : [{ label: tr("New Report"), href: "/intake" }]),
          { label: tr("Statement"), href: `/statements/${s.id}` },
          { label: tr("Draft review") },
        ]}
      />
      {draft ? (
        <ReviewWorkspace
          user={user}
          draft={draft}
          statement={s}
          versionParam={sp.v ? Number(sp.v) : undefined}
          hrefForVersion={(v) => `/statements/${s.id}/review?draft=${draft.id}&v=${v}`}
        />
      ) : (
        <EmptyState
          title={tr("No draft prepared yet")}
          description={tr("A draft is generated from the confirmed transcript.")}
          action={s.status === "in_progress" ? <ButtonLink href={`/intake/${s.id}?step=draft`} variant="primary">{tr("Prepare draft")}</ButtonLink> : undefined}
        />
      )}
      <div className="mt-6">
        <LegalPanel user={user} statementId={s.id} />
      </div>
    </>
  );
}
