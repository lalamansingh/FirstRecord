"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import {
  BULLETIN_CATEGORIES, createBulletin, updateBulletin, archiveBulletin, acknowledgeBulletin, type BulletinInput,
} from "@/lib/domain/bulletins";

const schema = z.object({
  title: zs.required("Title", 200),
  body: zs.required("Details", 8000),
  category: z.enum(BULLETIN_CATEGORIES, { message: "Choose a category" }),
  stationId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "all" ? v : null))
    .pipe(z.string().uuid("Choose a station").nullable()),
  effectiveDate: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date"),
  reference: zs.optional(200),
  isPinned: z.string().optional().transform((v) => v === "on"),
  requiresAck: z.string().optional().transform((v) => v === "on"),
});

function parse(fd: FormData): BulletinInput {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  return schema.parse(o);
}

function revalidate(id?: string) {
  revalidatePath("/updates");
  if (id) revalidatePath(`/updates/${id}`);
  revalidatePath("/", "layout");
}

export async function createBulletinAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("bulletin.publish");
    const id = createBulletin(user, parse(fd));
    revalidate(id);
    return { ok: true, message: "Update published.", redirectTo: `/updates/${id}` };
  });
}

export async function updateBulletinAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("bulletin.publish");
    const id = zs.id().parse(fd.get("id"));
    updateBulletin(user, id, parse(fd));
    revalidate(id);
    return { ok: true, message: "Update saved.", redirectTo: `/updates/${id}` };
  });
}

export async function archiveBulletinAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("bulletin.publish");
    const id = zs.id().parse(fd.get("id"));
    archiveBulletin(user, id);
    revalidate(id);
    return { ok: true, message: "Update archived.", redirectTo: "/updates" };
  });
}

export async function acknowledgeBulletinAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor();
    const id = zs.id().parse(fd.get("id"));
    acknowledgeBulletin(user, id);
    revalidate(id);
    return { ok: true, message: "Acknowledgement recorded." };
  });
}
