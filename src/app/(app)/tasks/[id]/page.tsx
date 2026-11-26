import { getTr, getLang } from "@/lib/i18n/server";
import { localizeAuditSummary } from "@/lib/i18n/audit-summary";
import Link from "next/link";
import { localizeWorkflow, trDyn } from "@/lib/i18n/dynamic";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { can, canViewTask } from "@/lib/rbac/access";
import { getTask, taskActivity, taskComments, linkableCases, assignableUsers, taskTypeLabel } from "@/lib/domain/tasks";
import { getWorkflow, getSetting, stateOf, doneStates } from "@/lib/domain/workflow";
import { formatDate, formatRelative, isOverdue, toLocalInput } from "@/lib/format";
import { PageHeader, Card, Badge, KeyValue, EmptyState, Notice } from "@/components/ui";
import { PriorityBadge } from "@/components/i18n/localized";
import { ActionForm, SubmitButton } from "@/components/forms";
import { TaskForm, AssigneeForm, CommentForm, StatusSelect } from "@/components/tasks/task-controls";
import { updateTaskAction, assignTaskAction, changeTaskStatusAction, addTaskCommentAction } from "../actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "Task") };
}

const ACTIVITY_LABELS: Record<string, string> = {
  created: "created the task",
  updated: "updated the task",
  assigned: "changed the assignee",
  status_changed: "changed the status",
  completed: "completed the task",
  reopened: "reopened the task",
  commented: "commented",
};

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const tr = await getTr();
  const lang = await getLang();
  const user = await requirePagePermission("task.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !canViewTask(user, id)) notFound();
  const task = getTask(user, id);
  const wf = localizeWorkflow(getWorkflow("task"), tr);
  const st = stateOf(wf, task.status);
  const done = doneStates(wf);
  const isDone = done.includes(task.status);
  const allowed = (wf.transitions[task.status] ?? []).map((k) => ({ key: k, label: stateOf(wf, k).label }));
  const completeTo = allowed.find((a) => done.includes(a.key));
  const reopenTo = isDone ? allowed.find((a) => stateOf(wf, a.key).category === "open") ?? allowed[0] : undefined;
  const manage = can(user, "task.manage");
  const comments = taskComments(user, id);
  const activity = taskActivity(user, id);
  const overdue = isOverdue(task.due_at, task.completed_at);
  const editCases = manage ? linkableCases(user) : [];
  if (manage && task.case_id && !editCases.some((c) => c.id === task.case_id)) editCases.unshift({ id: task.case_id, reference: task.case_reference ?? tr("Linked case"), title: "" });

  return (
    <>
      <PageHeader
        title={task.title}
        crumbs={[
          { label: tr("Tasks"), href: "/tasks" },
          ...(task.case_id ? [{ label: task.case_reference ?? tr("Case"), href: `/cases/${task.case_id}` }] : []),
          { label: tr("Task") },
        ]}
        meta={
          <>
            <Badge tone={st.color}>{st.label}</Badge>
            <PriorityBadge priority={task.priority} />
            <Badge>{trDyn(tr, taskTypeLabel(task.task_type))}</Badge>
            {overdue && (
              <Badge tone="red">
                <AlertTriangle className="h-3 w-3" aria-hidden /> {tr("Overdue")}
              </Badge>
            )}
          </>
        }
        actions={
          manage && (
            <>
              {completeTo && !isDone && (
                <ActionForm action={changeTaskStatusAction} confirm={tr("Mark this task as complete? It can be reopened later.")} confirmTitle={tr("Complete task")} confirmLabel={tr("Mark complete")}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value={completeTo.key} />
                  <SubmitButton variant="primary">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> {tr("Mark complete")}
                  </SubmitButton>
                </ActionForm>
              )}
              {reopenTo && (
                <ActionForm action={changeTaskStatusAction} confirm={tr("Reopen this task and move it to “{status}”?", { status: reopenTo.label })} confirmTitle={tr("Reopen task")} confirmLabel={tr("Reopen")}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value={reopenTo.key} />
                  <SubmitButton variant="secondary">
                    <RotateCcw className="h-4 w-4" aria-hidden /> {tr("Reopen")}
                  </SubmitButton>
                </ActionForm>
              )}
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={tr("Details")}>
            {task.description ? (
              <p className="whitespace-pre-wrap text-sm text-slate-800">{task.description}</p>
            ) : (
              <p className="text-sm text-slate-500">{tr("No description.")}</p>
            )}
          </Card>

          {manage && (
            <Card title={tr("Edit task")} description={tr("Changes are recorded in the activity history and audit log.")}>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-[#1B6650] hover:underline">{tr("Show edit form")}</summary>
                <div className="mt-4">
                  <TaskForm
                    action={updateTaskAction}
                    values={{
                      id: task.id,
                      title: task.title,
                      description: task.description,
                      taskType: task.task_type,
                      priority: task.priority,
                      caseId: task.case_id,
                      dueAt: toLocalInput(task.due_at),
                      remindAt: toLocalInput(task.remind_at),
                    }}
                    taskTypes={getSetting("task.types").map((t) => ({ ...t, label: trDyn(tr, t.label) }))}
                    cases={editCases}
                    assignees={[]}
                    showAssignee={false}
                    submitLabel={tr("Save changes")}
                  />
                </div>
              </details>
            </Card>
          )}

          <Card title={tr("Comments ({n})", { n: comments.length })}>
            {comments.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">{tr("No comments yet.")}</p>
            ) : (
              <ol className="mb-4 space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-800">{c.author_name ?? "Unknown user"}</span> ·{" "}
                      <time dateTime={c.created_at} title={formatDate(c.created_at, { time: true, lang })}>{formatRelative(c.created_at, lang)}</time>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                  </li>
                ))}
              </ol>
            )}
            {manage ? <CommentForm action={addTaskCommentAction} taskId={task.id} /> : <Notice tone="slate">{tr("Your role can view this task but not comment on it.")}</Notice>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={tr("Summary")}>
            <KeyValue
              items={[
                { label: tr("Status"), value: st.label },
                { label: tr("Owner"), value: task.assignee_name ?? tr("Unassigned") },
                { label: tr("Due"), value: <span className={overdue ? "font-medium text-red-700" : undefined}>{formatDate(task.due_at, { time: true, lang })}</span> },
                { label: tr("Reminder"), value: formatDate(task.remind_at, { time: true, lang }) },
                { label: tr("Linked case"), value: task.case_id ? <Link className="text-[#1B6650] hover:underline" href={`/cases/${task.case_id}`}>{task.case_reference}</Link> : "None" },
                { label: tr("Created by"), value: task.creator_name ?? "—" },
                { label: tr("Created"), value: formatDate(task.created_at, { time: true, lang }) },
                { label: tr("Completed"), value: formatDate(task.completed_at, { time: true, lang }) },
              ]}
            />
            {manage && (
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <AssigneeForm action={assignTaskAction} taskId={task.id} current={task.assignee_id} assignees={assignableUsers(task.station_id)} />
                {allowed.length > 0 && <StatusSelect action={changeTaskStatusAction} taskId={task.id} current={task.status} options={allowed} />}
              </div>
            )}
          </Card>

          <Card title={tr("Activity")}>
            {activity.length === 0 ? (
              <EmptyState title={tr("No activity yet")} />
            ) : (
              <ol className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{a.actor_name ?? tr("System")}</span> {ACTIVITY_LABELS[a.action] ?? a.action}
                    </p>
                    {a.detail && <p className="text-xs text-slate-600">{localizeAuditSummary(a.detail, tr)}</p>}
                    <time className="text-xs text-slate-500" dateTime={a.created_at}>{formatDate(a.created_at, { time: true, lang })}</time>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
