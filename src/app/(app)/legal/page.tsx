import { trDyn } from "@/lib/i18n/dynamic";
import Link from "next/link";
import { Scale } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { getLang, getTr } from "@/lib/i18n/server";
import { getProvision, listProvisions, type ProvisionRow } from "@/lib/domain/legal";
import { provisionTitleHi } from "@/lib/seed/legal";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, buttonClass, Card, EmptyState, Field, inputClass, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { saveProvisionAction, toggleProvisionAction } from "./actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Legal provisions catalogue") };
}

async function ProvisionForm({ p }: { p?: ProvisionRow }) {
  const tr = await getTr();
  return (
    <ActionForm action={saveProvisionAction} className="grid gap-4 md:grid-cols-2" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label={tr("Code")} htmlFor="code" required hint={tr("e.g. BNS 303(2)")}>
        <input id="code" name="code" required maxLength={40} defaultValue={p?.code} className={inputClass} />
      </Field>
      <Field label={tr("Section")} htmlFor="section" required>
        <input id="section" name="section" required maxLength={40} defaultValue={p?.section} className={inputClass} />
      </Field>
      <Field label={tr("Act")} htmlFor="act" required className="md:col-span-2">
        <input id="act" name="act" required maxLength={200} defaultValue={p?.act ?? "Bharatiya Nyaya Sanhita, 2023"} className={inputClass} />
      </Field>
      <Field label={tr("Title")} htmlFor="title" required className="md:col-span-2">
        <input id="title" name="title" required maxLength={200} defaultValue={p?.title} className={inputClass} />
      </Field>
      <Field label={tr("Plain-language summary")} htmlFor="summary" required hint={tr("A short paraphrase, not the statutory text.")} className="md:col-span-2">
        <textarea id="summary" name="summary" required rows={3} maxLength={1000} defaultValue={p?.summary} className={inputClass} />
      </Field>
      <Field label={tr("Trigger phrases")} htmlFor="keywords" hint={tr("One per line or comma-separated, in any language. A suggestion appears when one of these phrases is in the statement.")} className="md:col-span-2">
        <textarea id="keywords" name="keywords" rows={3} defaultValue={p?.keywords.join("\n")} className={inputClass} />
      </Field>
      <Field label={tr("Category")} htmlFor="category">
        <input id="category" name="category" maxLength={40} defaultValue={p?.category ?? "general"} className={inputClass} />
      </Field>
      <Field label={tr("Source note")} htmlFor="sourceNote" hint={tr("Where this entry was verified, or what still needs checking.")}>
        <input id="sourceNote" name="sourceNote" maxLength={500} defaultValue={p?.source_note} className={inputClass} />
      </Field>
      <div className="flex gap-2 md:col-span-2">
        <SubmitButton>{p ? tr("Save changes") : tr("Add provision")}</SubmitButton>
        {p && <ButtonLink href="/legal" variant="ghost">{tr("Cancel")}</ButtonLink>}
      </div>
    </ActionForm>
  );
}

export default async function LegalCatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; edit?: string }> }) {
  await requirePagePermission("legal.manage");
  const sp = await searchParams;
  const tr = await getTr();
  const lang = await getLang();
  const rows = listProvisions({ q: sp.q });
  const editing = sp.edit ? getProvision(sp.edit) : undefined;

  return (
    <>
      <PageHeader
        title={tr("Legal provisions catalogue")}
        icon={<Scale className="h-5 w-5" aria-hidden />}
        description={tr("The list the system draws suggestions from. Suggestions are only ever shown to officers, who decide what applies.")}
      />
      <Notice tone="amber" className="mb-6" title={tr("Verify every entry against the official text")}>
        {tr("The starter entries are plain-language summaries prepared for demonstration. Before real use, an authorized person must check each code, title and summary against the official gazetted text.")}
      </Notice>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={tr("Provisions ({count})", { count: rows.length })} className="xl:col-span-2" padded={false}>
          <form className="flex gap-2 border-b border-slate-200 p-4" role="search">
            <label htmlFor="q" className="sr-only">{tr("Search provisions")}</label>
            <input id="q" name="q" defaultValue={sp.q} placeholder={tr("Search code, title or summary")} className={inputClass} />
            <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{tr("Search")}</button>
          </form>
          {rows.length === 0 ? (
            <div className="p-4"><EmptyState title={tr("No provisions found")} /></div>
          ) : (
            <Table caption={tr("Legal provisions catalogue")}>
              <thead>
                <tr>
                  <Th>{tr("Code")}</Th>
                  <Th>{tr("Title")}</Th>
                  <Th>{tr("Status")}</Th>
                  <Th className="w-[15rem] text-right"><span className="sr-only">{tr("Actions")}</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={p.is_active ? "" : "opacity-60"}>
                    <Td className="whitespace-nowrap align-middle font-mono text-[13px] font-semibold">{p.code}</Td>
                    <Td className="align-middle">
                      <div className="font-medium text-slate-900">{(lang === "hi" ? provisionTitleHi(p.code) : undefined) ?? p.title}</div>
                      <div className="text-xs text-slate-500">{p.act}</div>
                      <div className="mt-1 text-xs text-slate-500">{tr("{count} trigger phrase(s)", { count: p.keywords.length })}</div>
                    </Td>
                    <Td className="align-middle">{p.is_active ? <Badge tone="green">{tr("Active")}</Badge> : <Badge tone="slate">{tr("Inactive")}</Badge>}</Td>
                    <Td className="w-[15rem] whitespace-nowrap text-right align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/legal?edit=${p.id}`} className={buttonClass("secondary", "sm")}>{tr("Edit")}</Link>
                        <ActionForm action={toggleProvisionAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="active" value={p.is_active ? "0" : "1"} />
                          <SubmitButton size="sm" variant="secondary">{p.is_active ? tr("Deactivate") : tr("Reactivate")}</SubmitButton>
                        </ActionForm>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title={editing ? tr("Edit {code}", { code: editing.code }) : tr("Add a provision")}>
          <ProvisionForm key={editing?.id ?? "new"} p={editing} />
        </Card>
      </div>
    </>
  );
}
