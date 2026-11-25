"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, requestIp } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import {
  addCaseNote,
  addParty,
  assignCase,
  bulkUpdate,
  changeCaseStatus,
  dismissDuplicate,
  linkCases,
  requestReview,
  setOfficialStatus,
  unlinkCase,
  updateCaseDetails,
  updateParty,
} from "@/lib/domain/cases";
import { deleteAttachment } from "@/lib/domain/attachments";
import { getWorkflow, stateLabel } from "@/lib/domain/workflow";

function refresh(caseId?: string) {
  revalidatePath("/cases");
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

const caseIdSchema = z.object({ caseId: zs.id() });

export async function changeStatusAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.status");
    const input = caseIdSchema
      .extend({ to: zs.required("New status", 60), reason: zs.optional(500) })
      .parse({ caseId: fd.get("caseId"), to: fd.get("to"), reason: fd.get("reason") ?? undefined });
    const r = changeCaseStatus(user, input.caseId, input.to, input.reason, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: `${r.reference} moved to ${stateLabel(getWorkflow("case"), r.to)}.` };
  });
}

export async function assignAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.assign");
    const input = caseIdSchema.extend({ assigneeId: zs.optionalId() }).parse({ caseId: fd.get("caseId"), assigneeId: fd.get("assigneeId") ?? undefined });
    const r = assignCase(user, input.caseId, input.assigneeId, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: input.assigneeId ? `Assigned to ${r.assigneeName}.` : "Assignment removed." };
  });
}

const detailsSchema = caseIdSchema.extend({
  title: zs.required("Title", 200),
  incident_type: zs.required("Incident type", 100),
  incident_date: zs.optionalDate(),
  incident_location: zs.optional(300),
  summary: zs.text(5000),
  priority: zs.priority(),
  next_action: zs.optional(300),
  next_action_due: zs.optionalDate(),
});

export async function updateDetailsAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.edit");
    const raw = Object.fromEntries(["caseId", "title", "incident_type", "incident_date", "incident_location", "summary", "priority", "next_action", "next_action_due"].map((k) => [k, fd.get(k) ?? undefined]));
    const { caseId, ...data } = detailsSchema.parse(raw);
    const r = updateCaseDetails(
      user,
      caseId,
      {
        ...data,
        incident_date: data.incident_date ? new Date(data.incident_date).toISOString() : null,
        next_action_due: data.next_action_due ? new Date(data.next_action_due).toISOString() : null,
      },
      await requestIp(),
    );
    refresh(caseId);
    return { ok: true, message: r.changed.length ? "Case details saved." : "No changes to save." };
  });
}

export async function officialStatusAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.official_status");
    const input = caseIdSchema
      .extend({
        status: z.enum(["local", "submitted", "filed"]),
        system: zs.optional(120),
        reference: zs.optional(120),
        confirmation: z.string().optional().transform((v) => v === "yes"),
      })
      .parse({ caseId: fd.get("caseId"), status: fd.get("status"), system: fd.get("system") ?? undefined, reference: fd.get("reference") ?? undefined, confirmation: fd.get("confirmation") ?? undefined });
    setOfficialStatus(user, input.caseId, { status: input.status, system: input.system, reference: input.reference, confirmation: input.confirmation }, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: "Official status recorded." };
  });
}

export async function addNoteAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.edit");
    const input = caseIdSchema.extend({ body: zs.required("Note", 5000) }).parse({ caseId: fd.get("caseId"), body: fd.get("body") });
    addCaseNote(user, input.caseId, input.body, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: "Note added." };
  });
}

const partySchema = caseIdSchema.extend({
  partyId: zs.optionalId(),
  party_role: z.enum(["complainant", "witness", "involved", "other"]),
  name: zs.required("Name", 200),
  age: zs.optional(20),
  gender: zs.optional(40),
  phone: zs.optional(40).refine((v) => v === null || /^[0-9+()\-\s]{5,40}$/.test(v), "Enter a valid phone number"),
  address: zs.optional(500),
  notes: zs.optional(2000),
});

export async function savePartyAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.edit");
    const raw = Object.fromEntries(["caseId", "partyId", "party_role", "name", "age", "gender", "phone", "address", "notes"].map((k) => [k, fd.get(k) ?? undefined]));
    const { caseId, partyId, ...p } = partySchema.parse(raw);
    const ip = await requestIp();
    if (partyId) updateParty(user, caseId, partyId, p, ip);
    else addParty(user, caseId, p, ip);
    refresh(caseId);
    return { ok: true, message: partyId ? "Party record updated." : "Party record added." };
  });
}

export async function linkCaseAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.link");
    const input = caseIdSchema
      .extend({
        linkedCaseId: zs.optionalId(),
        reference: zs.optional(80),
        linkType: z.enum(["related", "possible_duplicate"]),
        note: zs.optional(500),
      })
      .parse({ caseId: fd.get("caseId"), linkedCaseId: fd.get("linkedCaseId") ?? undefined, reference: fd.get("reference") ?? undefined, linkType: fd.get("linkType"), note: fd.get("note") ?? undefined });
    if (!input.linkedCaseId && !input.reference) return { ok: false, error: "Enter a case reference.", fieldErrors: { reference: "Case reference is required" } };
    linkCases(user, input.caseId, { linkedCaseId: input.linkedCaseId ?? undefined, reference: input.reference ?? undefined }, input.linkType, input.note, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: input.linkType === "possible_duplicate" ? "Linked as possible duplicate. Records were not merged." : "Cases linked." };
  });
}

export async function unlinkAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.link");
    const input = caseIdSchema.extend({ linkId: zs.id() }).parse({ caseId: fd.get("caseId"), linkId: fd.get("linkId") });
    unlinkCase(user, input.caseId, input.linkId, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: "Link removed." };
  });
}

export async function dismissDuplicateAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.link");
    const input = caseIdSchema.extend({ otherCaseId: zs.id() }).parse({ caseId: fd.get("caseId"), otherCaseId: fd.get("otherCaseId") });
    dismissDuplicate(user, input.caseId, input.otherCaseId, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: "Suggestion dismissed." };
  });
}

export async function requestReviewAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.edit");
    const input = caseIdSchema.extend({ reviewerId: zs.id(), note: zs.optional(1000) }).parse({ caseId: fd.get("caseId"), reviewerId: fd.get("reviewerId"), note: fd.get("note") ?? undefined });
    const r = requestReview(user, input.caseId, input.reviewerId, input.note, await requestIp());
    refresh(input.caseId);
    return { ok: true, message: `Review requested from ${r.reviewerName}.` };
  });
}

export async function bulkAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("case.bulk");
    const input = z
      .object({
        ids: z.array(zs.id()).min(1, "Select at least one case").max(200, "Select at most 200 cases"),
        op: z.enum(["status", "assign", "priority"]),
        value: z.string().trim().max(60),
      })
      .parse({ ids: fd.getAll("ids"), op: fd.get("op"), value: fd.get("value") ?? "" });
    if (input.op !== "assign" && !input.value) return { ok: false, error: "Choose a value to apply." };
    if (input.op === "priority" && !["low", "medium", "high", "urgent"].includes(input.value)) return { ok: false, error: "Invalid priority." };
    const op =
      input.op === "assign"
        ? { kind: "assign" as const, value: input.value || null }
        : input.op === "status"
          ? { kind: "status" as const, value: input.value }
          : { kind: "priority" as const, value: input.value };
    const r = bulkUpdate(user, input.ids, op, await requestIp());
    refresh();
    const skipped = r.skipped.length
      ? ` Skipped ${r.skipped.length}: ${r.skipped.slice(0, 5).map((s) => `${s.reference} (${s.reason})`).join("; ")}${r.skipped.length > 5 ? "…" : ""}`
      : "";
    if (r.done.length === 0) return { ok: false, error: `No cases were updated.${skipped}` };
    return { ok: true, message: `Updated ${r.done.length} case(s).${skipped}`, data: r };
  });
}

export async function deleteAttachmentAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("attachment.delete");
    const input = z
      .object({ attachmentId: zs.id(), reason: zs.required("Reason", 500) })
      .parse({ attachmentId: fd.get("attachmentId"), reason: fd.get("reason") });
    const r = await deleteAttachment(user, input.attachmentId, input.reason, await requestIp());
    refresh(r.caseId);
    return { ok: true, message: "Attachment deleted. Metadata and audit history are retained." };
  });
}
