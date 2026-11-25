/**
 * Task management domain logic. All functions enforce authorization themselves;
 * callers must still authenticate the actor.
 */
import { all, get, insert, update, newId, now, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/domain/notifications";
import { getWorkflow, getSetting, assertTransition, initialState, doneStates, stateLabel } from "@/lib/domain/workflow";
import { assertCan, assertCaseAccess, assertTaskAccess, taskVisibilityFilter, caseVisibilityFilter, type AuthUser } from "@/lib/rbac/access";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface TaskRow {
  id: string;
  station_id: string;
  case_id: string | null;
  case_reference: string | null;
  title: string;
  description: string;
  task_type: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignee_name: string | null;
  due_at: string | null;
  remind_at: string | null;
  completed_at: string | null;
  created_by: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskFilters {
  quick?: "mine" | "overdue" | "due_soon" | "completed" | "all";
  caseId?: string | null;
  assigneeId?: string | null; // "unassigned" allowed
  status?: string | null;
  type?: string | null;
  priority?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
  sort?: "due" | "updated" | "priority" | "created";
}

const PRIORITY_ORDER = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";

const SELECT = `SELECT t.id, t.station_id, t.case_id, c.reference AS case_reference, t.title, t.description, t.task_type,
       t.status, t.priority, t.assignee_id, ua.name AS assignee_name, t.due_at, t.remind_at, t.completed_at,
       t.created_by, uc.name AS creator_name, t.created_at, t.updated_at
  FROM tasks t
  LEFT JOIN cases c ON c.id = t.case_id
  LEFT JOIN users ua ON ua.id = t.assignee_id
  LEFT JOIN users uc ON uc.id = t.created_by`;

function buildWhere(user: AuthUser, f: TaskFilters) {
  const vis = taskVisibilityFilter(user);
  const where: string[] = [vis.sql];
  const params: (string | number)[] = [...vis.params];
  const nowIso = now();
  switch (f.quick) {
    case "mine":
      where.push("t.assignee_id = ?", "t.completed_at IS NULL");
      params.push(user.id);
      break;
    case "overdue":
      where.push("t.completed_at IS NULL", "t.due_at IS NOT NULL", "t.due_at < ?");
      params.push(nowIso);
      break;
    case "due_soon":
      where.push("t.completed_at IS NULL", "t.due_at IS NOT NULL", "t.due_at >= ?", "t.due_at <= ?");
      params.push(nowIso, new Date(Date.now() + 48 * 3600e3).toISOString());
      break;
    case "completed":
      where.push("t.completed_at IS NOT NULL");
      break;
  }
  if (f.caseId) {
    where.push("t.case_id = ?");
    params.push(f.caseId);
  }
  if (f.assigneeId === "unassigned") where.push("t.assignee_id IS NULL");
  else if (f.assigneeId) {
    where.push("t.assignee_id = ?");
    params.push(f.assigneeId);
  }
  if (f.status) {
    where.push("t.status = ?");
    params.push(f.status);
  }
  if (f.type) {
    where.push("t.task_type = ?");
    params.push(f.type);
  }
  if (f.priority) {
    where.push("t.priority = ?");
    params.push(f.priority);
  }
  if (f.q) {
    where.push("(t.title LIKE ? ESCAPE '\\' OR c.reference LIKE ? ESCAPE '\\')");
    const like = `%${f.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    params.push(like, like);
  }
  return { sql: where.join(" AND "), params };
}

export function listTasks(user: AuthUser, f: TaskFilters = {}) {
  const { sql, params } = buildWhere(user, f);
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 200);
  const page = Math.max(f.page ?? 1, 1);
  const order =
    f.sort === "updated"
      ? "t.updated_at DESC"
      : f.sort === "priority"
        ? `${PRIORITY_ORDER}, t.due_at IS NULL, t.due_at`
        : f.sort === "created"
          ? "t.created_at DESC"
          : f.quick === "completed"
            ? "t.completed_at DESC"
            : `t.due_at IS NULL, t.due_at, ${PRIORITY_ORDER}`;
  const total = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks t LEFT JOIN cases c ON c.id = t.case_id WHERE ${sql}`,
    ...params,
  )!.n;
  const rows = all<TaskRow>(`${SELECT} WHERE ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { rows, total, page, pageSize };
}

export function quickCounts(user: AuthUser) {
  const count = (quick: TaskFilters["quick"]) => {
    const { sql, params } = buildWhere(user, { quick });
    return get<{ n: number }>(`SELECT COUNT(*) AS n FROM tasks t LEFT JOIN cases c ON c.id = t.case_id WHERE ${sql}`, ...params)!.n;
  };
  return { mine: count("mine"), overdue: count("overdue"), due_soon: count("due_soon"), completed: count("completed") };
}

export function getTask(user: AuthUser, id: string): TaskRow {
  assertTaskAccess(user, id);
  const t = get<TaskRow>(`${SELECT} WHERE t.id = ?`, id);
  if (!t) throw new NotFoundError();
  return t;
}

export function taskActivity(user: AuthUser, id: string) {
  assertTaskAccess(user, id);
  return all<{ id: string; action: string; detail: string | null; created_at: string; actor_name: string | null }>(
    `SELECT a.id, a.action, a.detail, a.created_at, u.name AS actor_name FROM task_activity a
       LEFT JOIN users u ON u.id = a.actor_id WHERE a.task_id = ? ORDER BY a.created_at DESC`,
    id,
  );
}

export function taskComments(user: AuthUser, id: string) {
  assertTaskAccess(user, id);
  return all<{ id: string; body: string; created_at: string; author_name: string | null; author_id: string }>(
    `SELECT tc.id, tc.body, tc.created_at, tc.author_id, u.name AS author_name FROM task_comments tc
       LEFT JOIN users u ON u.id = tc.author_id WHERE tc.task_id = ? ORDER BY tc.created_at ASC`,
    id,
  );
}

/** Active users a task in this station can be assigned to. */
export function assignableUsers(stationId: string | null) {
  if (!stationId) return [];
  return all<{ id: string; name: string; role_name: string }>(
    `SELECT u.id, u.name, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.station_id = ? AND u.status = 'active' AND r.permissions LIKE '%"task.view"%'
      ORDER BY u.name`,
    stationId,
  );
}

/** Cases the user can link a task to (most recent first). */
export function linkableCases(user: AuthUser, limit = 200) {
  const f = caseVisibilityFilter(user);
  return all<{ id: string; reference: string; title: string }>(
    `SELECT c.id, c.reference, c.title FROM cases c WHERE ${f.sql} ORDER BY c.updated_at DESC LIMIT ?`,
    ...f.params,
    limit,
  );
}

export function taskTypeLabel(key: string) {
  return getSetting("task.types").find((t) => t.key === key)?.label ?? key;
}

function assertAssignee(stationId: string, assigneeId: string | null) {
  if (!assigneeId) return;
  const ok = assignableUsers(stationId).some((u) => u.id === assigneeId);
  if (!ok) throw new ValidationError("Assignee must be an active user in the same station who can view tasks.", { assigneeId: "Choose an active user from this station" });
}

function assertType(type: string) {
  if (!getSetting("task.types").some((t) => t.key === type)) throw new ValidationError("Unknown task type.", { taskType: "Choose a task type" });
}

function logActivity(taskId: string, actorId: string, action: string, detail?: string | null) {
  insert("task_activity", { id: newId(), task_id: taskId, actor_id: actorId, action, detail: detail ?? null, created_at: now() });
}

export interface TaskInput {
  title: string;
  description: string;
  taskType: string;
  priority: "low" | "medium" | "high" | "urgent";
  caseId: string | null;
  assigneeId: string | null;
  dueAt: string | null;
  remindAt: string | null;
}

function validateDates(i: Pick<TaskInput, "dueAt" | "remindAt">) {
  if (i.remindAt && i.dueAt && Date.parse(i.remindAt) > Date.parse(i.dueAt)) {
    throw new ValidationError("The reminder must be before the due date.", { remindAt: "Reminder must be before the due date" });
  }
}

export function createTask(user: AuthUser, input: TaskInput): string {
  assertCan(user, "task.manage");
  let stationId = user.stationId;
  if (input.caseId) {
    assertCaseAccess(user, input.caseId);
    stationId = get<{ station_id: string }>("SELECT station_id FROM cases WHERE id = ?", input.caseId)!.station_id;
  }
  if (!stationId) throw new ValidationError("You must belong to a station, or link the task to a case, to create a task.");
  assertType(input.taskType);
  assertAssignee(stationId, input.assigneeId);
  validateDates(input);
  const wf = getWorkflow("task");
  const id = newId();
  const t = now();
  tx(() => {
    insert("tasks", {
      id,
      station_id: stationId,
      case_id: input.caseId,
      title: input.title,
      description: input.description,
      task_type: input.taskType,
      status: initialState(wf),
      priority: input.priority,
      assignee_id: input.assigneeId,
      due_at: input.dueAt,
      remind_at: input.remindAt,
      created_by: user.id,
      created_at: t,
      updated_at: t,
    });
    logActivity(id, user.id, "created", input.assigneeId ? "Created and assigned" : "Created");
    audit({
      actorId: user.id,
      action: "task.created",
      entityType: "task",
      entityId: id,
      caseId: input.caseId,
      summary: `Task created (${taskTypeLabel(input.taskType)}, ${input.priority} priority)`,
      metadata: { assigneeId: input.assigneeId, dueAt: input.dueAt },
    });
    notify({ userId: input.assigneeId, actorId: user.id, kind: "task_assigned", title: `Task assigned to you: ${input.title}`, link: `/tasks/${id}`, entityType: "task", entityId: id });
  });
  return id;
}

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  description: "description",
  task_type: "type",
  priority: "priority",
  due_at: "due date",
  remind_at: "reminder",
  case_id: "linked case",
};

export function updateTask(user: AuthUser, id: string, input: Omit<TaskInput, "assigneeId">) {
  assertCan(user, "task.manage");
  const task = getTask(user, id);
  if (input.caseId && input.caseId !== task.case_id) assertCaseAccess(user, input.caseId);
  if (input.caseId) {
    const st = get<{ station_id: string }>("SELECT station_id FROM cases WHERE id = ?", input.caseId)!.station_id;
    if (st !== task.station_id) throw new ValidationError("A task can only be linked to a case in the same station.", { caseId: "Case is in a different station" });
  }
  assertType(input.taskType);
  validateDates(input);
  const next: Record<string, string | null> = {
    title: input.title,
    description: input.description,
    task_type: input.taskType,
    priority: input.priority,
    due_at: input.dueAt,
    remind_at: input.remindAt,
    case_id: input.caseId,
  };
  const changed = Object.keys(next).filter((k) => (task as unknown as Record<string, unknown>)[k] !== next[k]);
  if (changed.length === 0) return;
  const values: Record<string, string | null> = { updated_at: now() };
  for (const k of changed) values[k] = next[k];
  if (changed.includes("due_at") || changed.includes("remind_at")) values.reminder_sent_at = null;
  tx(() => {
    update("tasks", id, values);
    const summary = `Updated ${changed.map((k) => FIELD_LABELS[k]).join(", ")}`;
    logActivity(id, user.id, "updated", summary);
    audit({ actorId: user.id, action: "task.updated", entityType: "task", entityId: id, caseId: input.caseId ?? task.case_id, summary, metadata: { fields: changed } });
    if (task.assignee_id) notify({ userId: task.assignee_id, actorId: user.id, kind: "comment", title: `Task updated: ${input.title}`, link: `/tasks/${id}`, entityType: "task", entityId: id });
  });
}

export function assignTask(user: AuthUser, id: string, assigneeId: string | null) {
  assertCan(user, "task.manage");
  const task = getTask(user, id);
  if (task.assignee_id === assigneeId) return;
  assertAssignee(task.station_id, assigneeId);
  const name = assigneeId ? get<{ name: string }>("SELECT name FROM users WHERE id = ?", assigneeId)?.name : null;
  tx(() => {
    update("tasks", id, { assignee_id: assigneeId, reminder_sent_at: null, updated_at: now() });
    logActivity(id, user.id, "assigned", name ? `Assigned to ${name}` : "Unassigned");
    audit({ actorId: user.id, action: "task.assigned", entityType: "task", entityId: id, caseId: task.case_id, summary: name ? `Task assigned to ${name}` : "Task unassigned", metadata: { from: task.assignee_id, to: assigneeId } });
    notify({ userId: assigneeId, actorId: user.id, kind: "task_assigned", title: `Task assigned to you: ${task.title}`, link: `/tasks/${id}`, entityType: "task", entityId: id });
  });
}

export function changeTaskStatus(user: AuthUser, id: string, to: string) {
  assertCan(user, "task.manage");
  const task = getTask(user, id);
  const wf = getWorkflow("task");
  assertTransition(wf, task.status, to);
  const done = doneStates(wf);
  const completing = done.includes(to);
  const reopening = done.includes(task.status) && !completing;
  tx(() => {
    update("tasks", id, {
      status: to,
      completed_at: completing ? now() : null,
      ...(reopening ? { reminder_sent_at: null } : {}),
      updated_at: now(),
    });
    const detail = `${stateLabel(wf, task.status)} → ${stateLabel(wf, to)}`;
    logActivity(id, user.id, completing ? "completed" : reopening ? "reopened" : "status_changed", detail);
    audit({ actorId: user.id, action: completing ? "task.completed" : reopening ? "task.reopened" : "task.status_changed", entityType: "task", entityId: id, caseId: task.case_id, summary: `Task status: ${detail}`, metadata: { from: task.status, to } });
    const notifyUser = task.assignee_id && task.assignee_id !== user.id ? task.assignee_id : task.created_by;
    notify({ userId: notifyUser, actorId: user.id, kind: "status_change", title: `Task ${completing ? "completed" : reopening ? "reopened" : "status changed"}: ${task.title}`, link: `/tasks/${id}`, entityType: "task", entityId: id });
  });
}

export function addTaskComment(user: AuthUser, id: string, body: string) {
  assertCan(user, "task.manage");
  const task = getTask(user, id);
  tx(() => {
    insert("task_comments", { id: newId(), task_id: id, author_id: user.id, body, created_at: now() });
    logActivity(id, user.id, "commented", null);
    audit({ actorId: user.id, action: "task.commented", entityType: "task", entityId: id, caseId: task.case_id, summary: "Comment added to task" });
    for (const uid of new Set([task.assignee_id, task.created_by])) {
      notify({ userId: uid, actorId: user.id, kind: "comment", title: `New comment on task: ${task.title}`, link: `/tasks/${id}`, entityType: "task", entityId: id });
    }
  });
}
