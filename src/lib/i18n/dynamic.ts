/**
 * Render-time translation of values that are stored in English (workflow state
 * labels, priority/status labels, task types). Unknown strings — e.g. custom
 * labels an admin typed — are shown as stored.
 */
import type { MsgKey, Tr } from "./messages";
import type { Workflow } from "@/lib/domain/workflow";

export function trDyn(tr: Tr, s: string, vars?: Record<string, string | number>): string {
  return tr(s as MsgKey, vars);
}

/** Copy of a workflow with state labels translated for display only. */
export function localizeWorkflow(wf: Workflow, tr: Tr): Workflow {
  return { ...wf, states: wf.states.map((s) => ({ ...s, label: trDyn(tr, s.label) })) };
}
