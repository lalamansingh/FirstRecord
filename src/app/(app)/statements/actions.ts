"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import {
  addReviewComment,
  decideFields,
  getDraftRow,
  getTemplate,
  markReviewed,
  requestClarification,
  requestReview,
  resolveComment,
  saveDraftEdits,
} from "@/lib/domain/drafts";

function draftId(fd: FormData) {
  return z.string().uuid("Invalid draft").parse(fd.get("draftId"));
}

function revalidateDraft(id: string) {
  const d = getDraftRow(id);
  if (!d) return;
  revalidatePath(`/statements/${d.statement_id}`);
  revalidatePath(`/statements/${d.statement_id}/review`);
  revalidatePath(`/intake/${d.statement_id}`);
  if (d.case_id) revalidatePath(`/cases/${d.case_id}`);
}

/** Save edits to one or more fields. Inputs are named `field:<key>`. */
export async function saveDraftAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.edit");
    const id = draftId(fd);
    const d = getDraftRow(id);
    if (!d) return { ok: false, error: "Draft not found." };
    const keys = new Set(getTemplate(d.template_id).fields.map((f) => f.key));
    const patch: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("field:") && keys.has(k.slice(6)) && typeof v === "string") patch[k.slice(6)] = v;
    }
    const summary = zs.optional(300).parse(fd.get("changeSummary") ?? "");
    const version = saveDraftEdits(user, id, patch, summary);
    revalidateDraft(id);
    return { ok: true, message: version ? `Saved as draft version ${version}.` : "No changes to save." };
  });
}

export async function decideFieldAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.edit");
    const id = draftId(fd);
    const decision = z.enum(["accepted", "rejected"]).parse(fd.get("decision"));
    const key = String(fd.get("fieldKey") || "");
    const version = decideFields(user, id, key === "__all__" ? "all_pending" : [key], decision);
    revalidateDraft(id);
    return { ok: true, message: version ? `Recorded in draft version ${version}.` : "Nothing to change." };
  });
}

export async function commentAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.edit", "draft.review");
    const id = draftId(fd);
    const fieldKey = (fd.get("fieldKey") as string) || null;
    addReviewComment(user, id, fieldKey, String(fd.get("body") ?? ""));
    revalidateDraft(id);
    return { ok: true, message: "Comment added." };
  });
}

export async function resolveCommentAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.edit", "draft.review");
    const commentId = z.string().uuid().parse(fd.get("commentId"));
    resolveComment(user, commentId);
    revalidateDraft(draftId(fd));
    return { ok: true, message: "Comment resolved." };
  });
}

export async function requestReviewAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.edit");
    const id = draftId(fd);
    const n = requestReview(user, id);
    revalidateDraft(id);
    return { ok: true, message: n ? `Review requested. ${n} reviewer(s) notified.` : "Review requested, but no eligible reviewer was found in this station." };
  });
}

export async function clarificationAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.review");
    const id = draftId(fd);
    requestClarification(user, id, String(fd.get("comment") ?? ""));
    revalidateDraft(id);
    return { ok: true, message: "Clarification requested. The preparer has been notified." };
  });
}

export async function markReviewedAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("draft.review");
    const id = draftId(fd);
    markReviewed(user, id, {
      confirmNeedsConfirmation: fd.get("confirmNeedsConfirmation") === "on",
      comment: zs.optional(4000).parse(fd.get("comment") ?? ""),
      expectedVersion: z.coerce.number().int().parse(fd.get("expectedVersion")),
    });
    revalidateDraft(id);
    return { ok: true, message: "Draft marked reviewed. This is an internal review — it has not been filed with any official system." };
  });
}
