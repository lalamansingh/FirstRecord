"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import { getTr } from "@/lib/i18n/server";
import {
  assignOnlineComplaint,
  convertOnlineComplaint,
  saveVerificationNotes,
  setOnlineComplaintStatus,
} from "@/lib/domain/online-complaints";

function obj(fd: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  return o;
}

function revalidate(id: string) {
  revalidatePath("/online-complaints");
  revalidatePath(`/online-complaints/${id}`);
}

export async function saveNotesAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("online.verify");
    const tr = await getTr();
    const raw = obj(fd);
    const id = zs.id().parse(raw.id);
    saveVerificationNotes(user, id, zs.text(8000).parse(raw.notes ?? ""));
    revalidate(id);
    return { ok: true, message: tr("Verification notes saved.") };
  });
}

export async function assignComplaintAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("online.verify");
    const tr = await getTr();
    const raw = obj(fd);
    const id = zs.id().parse(raw.id);
    assignOnlineComplaint(user, id, zs.optionalId().parse(raw.assigneeId));
    revalidate(id);
    return { ok: true, message: tr("Assignment updated.") };
  });
}

const statusSchema = z.object({
  id: zs.id(),
  status: z.enum(["under_verification", "verified", "rejected", "duplicate"]),
  publicNote: zs.text(1000).optional(),
  duplicateCaseId: zs.optionalId(),
});

export async function changeComplaintStatusAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("online.verify");
    const tr = await getTr();
    const input = statusSchema.parse(obj(fd));
    setOnlineComplaintStatus(user, input.id, input.status, { publicNote: input.publicNote ?? null, duplicateCaseId: input.duplicateCaseId });
    revalidate(input.id);
    return { ok: true, message: tr("Status updated.") };
  });
}

const convertSchema = z.object({
  id: zs.id(),
  title: zs.required("Title", 200),
  priority: zs.priority(),
  assignedTo: zs.optionalId(),
});

export async function convertComplaintAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("online.verify");
    const tr = await getTr();
    const input = convertSchema.parse(obj(fd));
    const r = convertOnlineComplaint(user, input.id, { title: input.title, priority: input.priority, assignedTo: input.assignedTo });
    revalidate(input.id);
    revalidatePath("/cases");
    revalidatePath("/");
    return { ok: true, message: tr("Case {reference} opened.", { reference: r.reference }), redirectTo: `/cases/${r.caseId}` };
  });
}
