"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, requestIp } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import { raiseAlert, closeAlert } from "@/lib/domain/sos";
import { sendPush } from "@/lib/push";
import { getTr } from "@/lib/i18n/server";

function obj(fd: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  return o;
}

const optNum = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), "Out of range");

const raiseSchema = z.object({
  title: zs.required("Title", 120),
  message: zs.required("Message", 1000),
  severity: z.enum(["critical", "high"]),
  lat: optNum(-90, 90),
  lng: optNum(-180, 180),
  radiusKm: z.coerce.number().min(0.5, "At least 0.5 km").max(100, "At most 100 km"),
  locationText: zs.text(300).optional().transform((v) => (v ? v : null)),
});

export async function raiseSosAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("sos.raise");
    const input = raiseSchema.parse(obj(fd));
    const { id, recipients } = raiseAlert(user, input, await requestIp());
    // Phone notifications (only if VAPID keys are configured). Never blocks the alert.
    await sendPush(recipients, {
      title: `SOS: ${input.title}`,
      body: input.locationText ? `${input.locationText} — open FirstRecord to respond` : "Open FirstRecord to respond",
      url: `/sos/${id}`,
      tag: `sos-${id}`,
    }).catch(() => undefined);
    revalidatePath("/sos");
    const tr = await getTr();
    return { ok: true, message: tr("SOS sent to {n} staff member(s).", { n: recipients.length }), redirectTo: `/sos/${id}` };
  });
}

export async function closeSosAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("sos.manage");
    const raw = obj(fd);
    const id = zs.id().parse(raw.id);
    const outcome = z.enum(["resolved", "cancelled"]).parse(raw.outcome);
    const note = zs.text(500).optional().parse(raw.note) || null;
    closeAlert(user, id, outcome, note, await requestIp());
    revalidatePath("/sos");
    revalidatePath(`/sos/${id}`);
    const tr = await getTr();
    return { ok: true, message: outcome === "resolved" ? tr("Alert resolved.") : tr("Alert cancelled.") };
  });
}
