"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, type ActionResult } from "@/components/forms";
import { buttonClass, inputClass } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

type Action = (p: ActionResult, fd: FormData) => Promise<ActionResult>;

export interface EditorState {
  key: string;
  label: string;
  category: "open" | "active" | "done";
  color: "slate" | "blue" | "amber" | "violet" | "green" | "red" | "teal";
}

// Red is reserved for overdue/error/urgent states and is not offered for workflow stages.
const COLORS: EditorState["color"][] = ["slate", "blue", "amber", "violet", "green", "teal"];

function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "state";
}

export function WorkflowEditor({
  action,
  kind,
  name,
  initialStates,
  initialTransitions,
  usage,
}: {
  action: Action;
  kind: "case" | "task";
  name: string;
  initialStates: EditorState[];
  initialTransitions: Record<string, string[]>;
  usage: Record<string, number>;
}) {
  const tr = useT();
  const [states, setStates] = useState<(EditorState & { isNew?: boolean })[]>(initialStates);
  const [transitions, setTransitions] = useState<Record<string, string[]>>(initialTransitions);
  const [wfName, setWfName] = useState(name);

  const update = (i: number, patch: Partial<EditorState>) =>
    setStates((s) => s.map((st, j) => (j === i ? { ...st, ...patch, ...(st.isNew && patch.label !== undefined ? { key: uniqueKey(slugify(patch.label), s, j) } : {}) } : st)));

  const move = (i: number, d: -1 | 1) =>
    setStates((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const remove = (i: number) => {
    const key = states[i].key;
    setStates((s) => s.filter((_, j) => j !== i));
    setTransitions((t) => {
      const n: Record<string, string[]> = {};
      for (const [from, tos] of Object.entries(t)) if (from !== key) n[from] = tos.filter((x) => x !== key);
      return n;
    });
  };

  const add = () =>
    setStates((s) => [...s, { key: uniqueKey("new_state", s, -1), label: "New state", category: "active", color: "blue", isNew: true }]);

  const toggle = (from: string, to: string) =>
    setTransitions((t) => {
      const cur = new Set(t[from] ?? []);
      if (cur.has(to)) cur.delete(to);
      else cur.add(to);
      return { ...t, [from]: [...cur] };
    });

  const payload = JSON.stringify({
    name: wfName,
    states: states.map(({ key, label, category, color }) => ({ key, label, category, color })),
    transitions: Object.fromEntries(states.map((s) => [s.key, (transitions[s.key] ?? []).filter((k) => states.some((x) => x.key === k))])),
  });

  return (
    <ActionForm
      action={action}
      confirmTitle={kind === "case" ? tr("Save case workflow?") : tr("Save task workflow?")}
      confirm={tr("The new workflow applies immediately to all status changes. Existing records keep their current status. This change is audited.")}
      confirmLabel={tr("Save workflow")}
      className="space-y-5"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="workflow" value={payload} />
      <div className="max-w-md">
        <label htmlFor={`${kind}-wf-name`} className="mb-1 block text-sm font-medium text-slate-800">{tr("Workflow name")}</label>
        <input id={`${kind}-wf-name`} value={wfName} onChange={(e) => setWfName(e.target.value)} maxLength={80} className={inputClass} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{tr("States")}</h3>
        <p className="mb-2 text-xs text-slate-500">{tr("The first state is used for new records. At least one state must be a “done” state. States in use cannot be removed.")}</p>
        <ol className="space-y-2">
          {states.map((s, i) => {
            const inUse = (usage[s.key] ?? 0) > 0;
            return (
              <li key={i} className="grid grid-cols-1 items-end gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <div>
                  <label htmlFor={`${kind}-label-${i}`} className="mb-0.5 block text-xs text-slate-600">
                    {tr("Label")} <span className="font-mono text-[11px] text-slate-400">({s.key})</span>
                    {inUse && <span className="ml-1 text-[11px] text-slate-500">· {tr("{count} in use", { count: usage[s.key] })}</span>}
                  </label>
                  <input id={`${kind}-label-${i}`} value={s.label} maxLength={60} onChange={(e) => update(i, { label: e.target.value })} className={inputClass} required />
                </div>
                <div>
                  <label htmlFor={`${kind}-cat-${i}`} className="mb-0.5 block text-xs text-slate-600">{tr("Category")}</label>
                  <select id={`${kind}-cat-${i}`} value={s.category} onChange={(e) => update(i, { category: e.target.value as EditorState["category"] })} className={inputClass}>
                    <option value="open">{tr("Open")}</option>
                    <option value="active">{tr("Active")}</option>
                    <option value="done">{tr("Done")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`${kind}-color-${i}`} className="mb-0.5 block text-xs text-slate-600">{tr("Colour")}</label>
                  <select id={`${kind}-color-${i}`} value={s.color} onChange={(e) => update(i, { color: e.target.value as EditorState["color"] })} className={inputClass}>
                    {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-1">
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr("Move {label} up", { label: s.label })}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => move(i, 1)} disabled={i === states.length - 1} aria-label={tr("Move {label} down", { label: s.label })}><ArrowDown className="h-4 w-4" /></button>
                  <button
                    type="button"
                    className={buttonClass("ghost", "sm")}
                    onClick={() => remove(i)}
                    disabled={inUse || states.length <= 2}
                    title={inUse ? tr("In use — move records to another state first") : undefined}
                    aria-label={inUse ? tr("{label} is in use and cannot be removed", { label: s.label }) : tr("Remove {label}", { label: s.label })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={add} className={`${buttonClass("secondary", "sm")} mt-2`} disabled={states.length >= 15}>
          <Plus className="h-4 w-4" aria-hidden /> {tr("Add state")}
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{tr("Allowed transitions")}</h3>
        <p className="mb-2 text-xs text-slate-500">{tr("Rows are the current state; tick each state it may move to.")}</p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <caption className="sr-only">{tr("Transition matrix: from state (rows) to state (columns)")}</caption>
            <thead>
              <tr>
                <th scope="col" className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">{tr("From ↓ / To →")}</th>
                {states.map((s) => <th key={s.key} scope="col" className="border border-slate-200 bg-slate-50 px-2 py-1 font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {states.map((from) => (
                <tr key={from.key}>
                  <th scope="row" className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-medium">{from.label}</th>
                  {states.map((to) => (
                    <td key={to.key} className="border border-slate-200 px-2 py-1 text-center">
                      {from.key === to.key ? (
                        <span className="text-slate-300" aria-hidden>—</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={(transitions[from.key] ?? []).includes(to.key)}
                          onChange={() => toggle(from.key, to.key)}
                          aria-label={tr("Allow {from} to {to}", { from: from.label, to: to.label })}
                          className="h-4 w-4"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-200 pt-4">
        <SubmitButton>{kind === "case" ? tr("Save case workflow") : tr("Save task workflow")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function uniqueKey(base: string, states: { key: string }[], selfIndex: number) {
  let k = base;
  let n = 2;
  while (states.some((s, j) => j !== selfIndex && s.key === k)) k = `${base}_${n++}`;
  return k;
}
