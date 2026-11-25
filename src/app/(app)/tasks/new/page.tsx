import { getTr } from "@/lib/i18n/server";
import { trDyn } from "@/lib/i18n/dynamic";
import { requirePagePermission } from "@/lib/auth/session";
import { canViewCase } from "@/lib/rbac/access";
import { get } from "@/lib/db";
import { linkableCases, assignableUsers } from "@/lib/domain/tasks";
import { getSetting } from "@/lib/domain/workflow";
import { PageHeader, Card, Notice } from "@/components/ui";
import { TaskForm } from "@/components/tasks/task-controls";
import { createTaskAction } from "../actions";

export async function generateMetadata() {
  return { title: trDyn(await getTr(), "New task") };
}

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ caseId?: string }> }) {
  const tr = await getTr();
  const user = await requirePagePermission("task.manage");
  const { caseId: rawCase } = await searchParams;
  const caseId = rawCase && /^[0-9a-f-]{36}$/.test(rawCase) && canViewCase(user, rawCase) ? rawCase : null;
  const cases = linkableCases(user);
  const linked = caseId ? get<{ id: string; reference: string; title: string; station_id: string }>("SELECT id, reference, title, station_id FROM cases WHERE id = ?", caseId) : undefined;
  if (linked && !cases.some((c) => c.id === linked.id)) cases.unshift(linked);
  const stationId = linked?.station_id ?? user.stationId;

  return (
    <>
      <PageHeader
        title={tr("New task")}
        crumbs={[
          { label: tr("Tasks"), href: "/tasks" },
          ...(linked ? [{ label: linked.reference, href: `/cases/${linked.id}` }] : []),
          { label: tr("New task") },
        ]}
      />
      <div className="max-w-2xl">
        {!stationId && !linked ? (
          <Notice tone="amber" title={tr("No station assigned")}>
            {tr("Your account is not linked to a station, so tasks must be linked to a case you can access. No accessible cases are available.")}
          </Notice>
        ) : (
          <Card>
            {rawCase && !caseId && (
              <Notice tone="amber" className="mb-4">{tr("The requested case was not found or you do not have access to it. The task will not be linked unless you choose a case.")}</Notice>
            )}
            <TaskForm
              action={createTaskAction}
              values={{ caseId: linked?.id ?? null }}
              taskTypes={getSetting("task.types").map((t) => ({ ...t, label: trDyn(tr, t.label) }))}
              cases={cases}
              assignees={assignableUsers(stationId)}
              showAssignee
              submitLabel={tr("Create task")}
              lockCase={!!linked}
            />
          </Card>
        )}
      </div>
    </>
  );
}
