"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import { get } from "@/lib/db";
import { getLang } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/messages";
import {
  addOfficerProvision,
  applySelectedToDraft,
  createProvision,
  decideSuggestion,
  generateSuggestions,
  setProvisionActive,
  updateProvision,
  type ProvisionInput,
} from "@/lib/domain/legal";

const uuid = z.string().uuid("Invalid id");

async function tr() {
  return translator(await getLang());
}

function revalidateStatement(statementId: string) {
  revalidatePath(`/statements/${statementId}`);
  revalidatePath(`/statements/${statementId}/review`);
  const c = get<{ case_id: string | null }>("SELECT case_id FROM statements WHERE id = ?", statementId);
  if (c?.case_id) revalidatePath(`/cases/${c.case_id}`);
}

export async function generateSuggestionsAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("legal.suggest");
    const statementId = uuid.parse(fd.get("statementId"));
    const { added, total } = generateSuggestions(user, statementId);
    revalidateStatement(statementId);
    const t = await tr();
    return { ok: true, message: total === 0 ? t("No catalogue entries matched the statement.") : t("{added} new suggestion(s); {total} matched in total.", { added, total }) };
  });
}

export async function decideSuggestionAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("legal.select");
    const id = uuid.parse(fd.get("suggestionId"));
    const decision = z.enum(["selected", "rejected", "suggested"]).parse(fd.get("decision"));
    const statementId = uuid.parse(fd.get("statementId"));
    decideSuggestion(user, id, decision);
    revalidateStatement(statementId);
    const t = await tr();
    return { ok: true, message: decision === "selected" ? t("Provision selected.") : decision === "rejected" ? t("Provision rejected.") : t("Decision undone.") };
  });
}

export async function addProvisionAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("legal.select");
    const statementId = uuid.parse(fd.get("statementId"));
    const provisionId = uuid.parse(fd.get("provisionId"));
    addOfficerProvision(user, statementId, provisionId);
    revalidateStatement(statementId);
    return { ok: true, message: (await tr())("Provision added and selected.") };
  });
}

export async function applyToDraftAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("legal.select");
    const statementId = uuid.parse(fd.get("statementId"));
    const version = applySelectedToDraft(user, statementId);
    revalidateStatement(statementId);
    const t = await tr();
    return { ok: true, message: version ? t("Saved as draft version {version}.", { version }) : t("The draft already lists these provisions.") };
  });
}

const provisionSchema = z.object({
  code: zs.required("Code", 40),
  act: zs.required("Act", 200),
  section: zs.required("Section", 40),
  title: zs.required("Title", 200),
  summary: zs.required("Summary", 1000),
  keywords: zs.text(4000),
  category: zs.text(40),
  sourceNote: zs.text(500),
});

function parseProvision(fd: FormData): ProvisionInput {
  const v = provisionSchema.parse(Object.fromEntries(["code", "act", "section", "title", "summary", "keywords", "category", "sourceNote"].map((k) => [k, fd.get(k) ?? ""])));
  return { ...v, keywords: v.keywords.split(/[\n,]/) };
}

export async function saveProvisionAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("legal.manage");
    const input = parseProvision(fd);
    const id = fd.get("id");
    const t = await tr();
    if (typeof id === "string" && id) {
      updateProvision(user, uuid.parse(id), input);
      revalidatePath("/legal");
      return { ok: true, message: t("Provision updated."), redirectTo: "/legal" };
    }
    createProvision(user, input);
    revalidatePath("/legal");
    return { ok: true, message: t("Provision added to the catalogue."), redirectTo: "/legal" };
  });
}

export async function toggleProvisionAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("legal.manage");
    const id = uuid.parse(fd.get("id"));
    const active = fd.get("active") === "1";
    setProvisionActive(user, id, active);
    revalidatePath("/legal");
    const t = await tr();
    return { ok: true, message: active ? t("Provision reactivated.") : t("Provision deactivated.") };
  });
}
