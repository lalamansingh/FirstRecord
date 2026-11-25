"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { markRead } from "@/lib/domain/notifications";

export async function markNotificationReadAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor();
    const id = z.string().uuid().parse(fd.get("id"));
    markRead(user.id, id); // scoped to user_id — cannot touch others' notifications
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor();
    markRead(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "All notifications marked as read." };
  });
}
