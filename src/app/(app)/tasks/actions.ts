"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import { createTask, updateTask, assignTask, changeTaskStatus, addTaskComment } from "@/lib/domain/tasks";

const localDate = () =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Invalid date")
    .transform((v) => (v ? new Date(v).toISOString() : null));

const taskSchema = z.object({
  title: zs.required("Title", 200),
  description: zs.text(4000).default(""),
  taskType: zs.required("Type", 50),
  priority: zs.priority(),
  caseId: zs.optionalId(),
  dueAt: localDate(),
  remindAt: localDate(),
});

function obj(fd: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  return o;
}

function revalidate(id?: string) {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (id) revalidatePath(`/tasks/${id}`);
}

export async function createTaskAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("task.manage");
    const raw = obj(fd);
    const input = taskSchema.extend({ assigneeId: zs.optionalId() }).parse(raw);
    const id = createTask(user, input);
    revalidate();
    if (input.caseId) revalidatePath(`/cases/${input.caseId}`);
    return { ok: true, message: "Task created.", redirectTo: `/tasks/${id}` };
  });
}

export async function updateTaskAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("task.manage");
    const raw = obj(fd);
    const id = zs.id().parse(raw.id);
    updateTask(user, id, taskSchema.parse(raw));
    revalidate(id);
    return { ok: true, message: "Task updated." };
  });
}

export async function assignTaskAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("task.manage");
    const raw = obj(fd);
    const id = zs.id().parse(raw.id);
    const assigneeId = zs.optionalId().parse(raw.assigneeId);
    assignTask(user, id, assigneeId);
    revalidate(id);
    return { ok: true, message: assigneeId ? "Task assigned." : "Task unassigned." };
  });
}

export async function changeTaskStatusAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("task.manage");
    const raw = obj(fd);
    const id = zs.id().parse(raw.id);
    const to = zs.required("Status", 50).parse(raw.status);
    changeTaskStatus(user, id, to);
    revalidate(id);
    return { ok: true, message: "Status updated." };
  });
}

export async function addTaskCommentAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActor("task.manage");
    const raw = obj(fd);
    const id = zs.id().parse(raw.id);
    const body = zs.required("Comment", 4000).parse(raw.body);
    addTaskComment(user, id, body);
    revalidate(id);
    return { ok: true, message: "Comment added." };
  });
}
