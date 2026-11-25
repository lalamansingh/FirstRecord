/**
 * In-app notifications + delivery adapters.
 * Titles must be generic (reference numbers, task titles) and never include
 * statement content. Email/SMS adapters are integration points: when no provider
 * is configured nothing is sent and nothing is claimed as sent.
 */
import { all, get, insert, newId, now, parseJson, run } from "@/lib/db";

export type NotificationKind =
  | "assignment"
  | "review_request"
  | "clarification_requested"
  | "draft_reviewed"
  | "task_assigned"
  | "task_due_soon"
  | "task_overdue"
  | "status_change"
  | "comment"
  | "bulletin"
  | "online_complaint"
  | "sos";

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  assignment: "Case assignments",
  review_request: "Review requests",
  clarification_requested: "Clarification requests",
  draft_reviewed: "Draft reviewed",
  task_assigned: "Task assignments",
  task_due_soon: "Tasks due soon",
  task_overdue: "Overdue tasks",
  status_change: "Case status changes",
  comment: "Comments",
  bulletin: "Updates & new rules",
  online_complaint: "Online complaints",
  sos: "SOS alerts",
};

export interface NotificationPrefs {
  muted: NotificationKind[];
  email: boolean;
  sms: boolean;
}

export function getPrefs(userId: string): NotificationPrefs {
  const row = get<{ notification_prefs: string }>("SELECT notification_prefs FROM users WHERE id = ?", userId);
  const p = parseJson<Partial<NotificationPrefs>>(row?.notification_prefs, {});
  return { muted: p.muted ?? [], email: p.email ?? false, sms: p.sms ?? false };
}

interface DeliveryAdapter {
  name: string;
  configured: boolean;
  send(userId: string, title: string, link: string | null): Promise<void>;
}

/** No provider bundled. Implement and register real adapters here. */
const adapters: DeliveryAdapter[] = [];

export function notify(input: {
  userId: string | null | undefined;
  kind: NotificationKind;
  title: string;
  link?: string | null;
  entityType?: string;
  entityId?: string;
  actorId?: string | null;
}) {
  if (!input.userId) return;
  if (input.actorId && input.actorId === input.userId) return; // don't notify yourself
  const prefs = getPrefs(input.userId);
  if (prefs.muted.includes(input.kind)) return;
  insert("notifications", {
    id: newId(),
    user_id: input.userId,
    kind: input.kind,
    title: input.title.slice(0, 200),
    link: input.link ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    read_at: null,
    created_at: now(),
  });
  for (const a of adapters) {
    if (!a.configured) continue;
    if ((a.name === "email" && prefs.email) || (a.name === "sms" && prefs.sms)) {
      a.send(input.userId, input.title, input.link ?? null).catch((e) =>
        console.error("[notify] delivery failed:", a.name, (e as Error).message),
      );
    }
  }
}

export function unreadCount(userId: string): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId)!.n;
}

export function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  return all<{
    id: string;
    kind: NotificationKind;
    title: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    `SELECT id, kind, title, link, read_at, created_at FROM notifications
      WHERE user_id = ? ${opts.unreadOnly ? "AND read_at IS NULL" : ""}
      ORDER BY created_at DESC LIMIT ?`,
    userId,
    opts.limit ?? 50,
  );
}

export function markRead(userId: string, id?: string) {
  if (id) run("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL", now(), id, userId);
  else run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", now(), userId);
}

/**
 * Generate due-soon / overdue reminders. Idempotent per task (reminder_sent_at).
 * Called opportunistically on page loads and by `npm run retention:run`.
 */
export function generateTaskReminders() {
  const t = now();
  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const due = all<{ id: string; title: string; assignee_id: string; due_at: string }>(
    `SELECT t.id, t.title, t.assignee_id, t.due_at FROM tasks t
      WHERE t.assignee_id IS NOT NULL AND t.completed_at IS NULL AND t.reminder_sent_at IS NULL
        AND ((t.remind_at IS NOT NULL AND t.remind_at <= ?) OR (t.due_at IS NOT NULL AND t.due_at <= ?))`,
    t,
    soon,
  );
  for (const task of due) {
    const overdue = task.due_at && task.due_at < t;
    notify({
      userId: task.assignee_id,
      kind: overdue ? "task_overdue" : "task_due_soon",
      title: overdue ? `Task overdue: ${task.title}` : `Task due soon: ${task.title}`,
      link: `/tasks/${task.id}`,
      entityType: "task",
      entityId: task.id,
    });
    run("UPDATE tasks SET reminder_sent_at = ? WHERE id = ?", t, task.id);
  }
}
