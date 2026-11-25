/** Configurable workflows (case + task), settings store, and station case numbering. */
import { get, all, run, insert, now, newId, parseJson, tx } from "@/lib/db";
import { ValidationError } from "@/lib/errors";

export interface WorkflowState {
  key: string;
  label: string;
  category: "open" | "active" | "done";
  color: "slate" | "blue" | "amber" | "violet" | "green" | "red" | "teal";
}

export interface Workflow {
  id: string;
  kind: "case" | "task";
  name: string;
  states: WorkflowState[];
  transitions: Record<string, string[]>;
}

export const DEFAULT_CASE_WORKFLOW: Omit<Workflow, "id"> = {
  kind: "case",
  name: "Default case workflow",
  states: [
    { key: "received", label: "Report Received", category: "open", color: "slate" },
    { key: "statement_review", label: "Statement Review", category: "active", color: "blue" },
    { key: "draft_prepared", label: "Draft Prepared", category: "active", color: "violet" },
    { key: "officer_review", label: "Officer Review", category: "active", color: "amber" },
    { key: "investigation", label: "Investigation / Follow-up", category: "active", color: "teal" },
    { key: "closed", label: "Closed", category: "done", color: "green" },
  ],
  transitions: {
    received: ["statement_review", "closed"],
    statement_review: ["received", "draft_prepared", "closed"],
    draft_prepared: ["statement_review", "officer_review", "closed"],
    officer_review: ["draft_prepared", "investigation", "closed"],
    investigation: ["officer_review", "closed"],
    closed: ["investigation"],
  },
};

export const DEFAULT_TASK_WORKFLOW: Omit<Workflow, "id"> = {
  kind: "task",
  name: "Default task workflow",
  states: [
    { key: "todo", label: "To do", category: "open", color: "slate" },
    { key: "in_progress", label: "In progress", category: "active", color: "blue" },
    { key: "blocked", label: "Blocked", category: "active", color: "amber" },
    { key: "done", label: "Done", category: "done", color: "green" },
  ],
  transitions: {
    todo: ["in_progress", "blocked", "done"],
    in_progress: ["todo", "blocked", "done"],
    blocked: ["todo", "in_progress", "done"],
    done: ["todo", "in_progress"],
  },
};

export function getWorkflow(kind: "case" | "task"): Workflow {
  const row = get<{ id: string; name: string; states: string; transitions: string }>(
    "SELECT id, name, states, transitions FROM workflow_definitions WHERE kind = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1",
    kind,
  );
  const fallback = kind === "case" ? DEFAULT_CASE_WORKFLOW : DEFAULT_TASK_WORKFLOW;
  if (!row) return { id: "default", ...fallback };
  return {
    id: row.id,
    kind,
    name: row.name,
    states: parseJson(row.states, fallback.states),
    transitions: parseJson(row.transitions, fallback.transitions),
  };
}

export function stateLabel(wf: Workflow, key: string) {
  return wf.states.find((s) => s.key === key)?.label ?? key;
}

export function stateOf(wf: Workflow, key: string): WorkflowState {
  return wf.states.find((s) => s.key === key) ?? { key, label: key, category: "open", color: "slate" };
}

export function initialState(wf: Workflow) {
  return wf.states[0].key;
}

export function doneStates(wf: Workflow) {
  return wf.states.filter((s) => s.category === "done").map((s) => s.key);
}

export function canTransition(wf: Workflow, from: string, to: string): boolean {
  if (from === to) return false;
  return (wf.transitions[from] ?? []).includes(to);
}

export function assertTransition(wf: Workflow, from: string, to: string) {
  if (!wf.states.some((s) => s.key === to)) throw new ValidationError(`Unknown status "${to}".`);
  if (!canTransition(wf, from, to)) {
    throw new ValidationError(
      `Moving from "${stateLabel(wf, from)}" to "${stateLabel(wf, to)}" is not allowed by the configured workflow.`,
    );
  }
}

/* ---------------- Settings ---------------- */

export interface AppSettings {
  "recording.notice_version": string;
  "recording.notice.en": string;
  "recording.notice.hi": string;
  "languages.enabled": string[];
  "task.types": { key: string; label: string }[];
  "incident.types": string[];
  "intake.require_contact": boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  "recording.notice_version": "2026-01",
  "recording.notice.en":
    "We would like to record this statement on audio or video. The recording helps make sure your account is written down accurately.\n\n" +
    "• Recording is optional. You can give your statement in writing or with staff help instead — your report will be accepted either way.\n" +
    "• The recording will be stored securely by this station and can only be accessed by authorized staff working on this matter. Every access is logged.\n" +
    "• It will be kept according to the station's retention policy and then reviewed for deletion.\n" +
    "• You can ask us to stop recording at any time. Anything already recorded will be kept as part of the record unless policy allows deletion.\n\n" +
    "Do you agree to this recording?",
  "recording.notice.hi":
    "हम इस बयान को ऑडियो या वीडियो में रिकॉर्ड करना चाहते हैं। रिकॉर्डिंग से यह सुनिश्चित करने में मदद मिलती है कि आपका बयान सही-सही लिखा जाए।\n\n" +
    "• रिकॉर्डिंग वैकल्पिक है। आप अपना बयान लिखकर या कर्मचारियों की सहायता से भी दे सकते हैं — आपकी शिकायत दोनों ही स्थितियों में स्वीकार की जाएगी।\n" +
    "• रिकॉर्डिंग इस थाने द्वारा सुरक्षित रूप से रखी जाएगी और केवल इस मामले पर काम करने वाले अधिकृत कर्मचारी ही इसे देख सकेंगे। हर बार देखे जाने का रिकॉर्ड रखा जाता है।\n" +
    "• इसे थाने की रिकॉर्ड-अवधि नीति के अनुसार रखा जाएगा और उसके बाद हटाने के लिए समीक्षा की जाएगी।\n" +
    "• आप किसी भी समय रिकॉर्डिंग रोकने के लिए कह सकते हैं। जो पहले से रिकॉर्ड हो चुका है, वह रिकॉर्ड का हिस्सा रहेगा, जब तक कि नीति उसे हटाने की अनुमति न दे।\n\n" +
    "क्या आप इस रिकॉर्डिंग के लिए सहमत हैं?",
  "languages.enabled": ["en", "hi"],
  "task.types": [
    { key: "follow_up", label: "Follow-up" },
    { key: "witness_contact", label: "Contact witness" },
    { key: "document_collection", label: "Collect documents" },
    { key: "site_visit", label: "Site visit" },
    { key: "review", label: "Review" },
    { key: "other", label: "Other" },
  ],
  "incident.types": [
    "Theft",
    "Burglary",
    "Vehicle theft",
    "Assault",
    "Cheating / Fraud",
    "Cyber fraud",
    "Missing person",
    "Lost property",
    "Harassment",
    "Property damage",
    "Other",
  ],
  "intake.require_contact": false,
};

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row ? parseJson(row.value, DEFAULT_SETTINGS[key]) : DEFAULT_SETTINGS[key];
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K], userId: string | null) {
  run(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value),
    userId,
    now(),
  );
}

export const LANGUAGES: Record<string, { label: string; native: string; speechTag: string }> = {
  en: { label: "English", native: "English", speechTag: "en-IN" },
  hi: { label: "Hindi", native: "हिन्दी", speechTag: "hi-IN" },
};

/* ---------------- Case numbering ---------------- */

/**
 * Format: tokens {STATION} {YYYY} {YY} {MM} {SEQ:n}. Sequence is atomic per
 * station and period (year when sequence_reset = 'yearly').
 */
export function formatCaseReference(format: string, stationCode: string, date: Date, seq: number) {
  return format
    .replace(/\{STATION\}/g, stationCode)
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, "0"))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_m, w) => String(seq).padStart(Number(w || 1), "0"));
}

export function validateCaseNumberFormat(format: string): string | null {
  if (!/\{SEQ(?::\d+)?\}/.test(format)) return "Format must include a {SEQ} or {SEQ:n} token.";
  if (format.length > 60) return "Format is too long.";
  if (/[^\w{}:/\-.]/.test(format.replace(/\{[A-Z]+(?::\d+)?\}/g, ""))) return "Only letters, digits, / - . _ are allowed outside tokens.";
  return null;
}

export function nextCaseReference(stationId: string, date = new Date()): string {
  return tx(() => {
    const st = get<{ code: string; case_number_format: string; sequence_reset: string }>(
      "SELECT code, case_number_format, sequence_reset FROM stations WHERE id = ?",
      stationId,
    );
    if (!st) throw new ValidationError("Station not found.");
    const period = st.sequence_reset === "yearly" ? String(date.getFullYear()) : "all";
    run(
      `INSERT INTO case_sequences (station_id, period, last_value) VALUES (?, ?, 1)
       ON CONFLICT(station_id, period) DO UPDATE SET last_value = last_value + 1`,
      stationId,
      period,
    );
    const seq = get<{ last_value: number }>(
      "SELECT last_value FROM case_sequences WHERE station_id = ? AND period = ?",
      stationId,
      period,
    )!.last_value;
    return formatCaseReference(st.case_number_format, st.code, date, seq);
  });
}

/** Persist a workflow definition (replaces the active one of that kind). */
export function saveWorkflow(kind: "case" | "task", wf: Pick<Workflow, "name" | "states" | "transitions">, userId: string) {
  tx(() => {
    run("UPDATE workflow_definitions SET is_active = 0 WHERE kind = ?", kind);
    insert("workflow_definitions", {
      id: newId(),
      kind,
      name: wf.name,
      states: JSON.stringify(wf.states),
      transitions: JSON.stringify(wf.transitions),
      is_active: 1,
      updated_by: userId,
      created_at: now(),
      updated_at: now(),
    });
  });
}

export function listStations() {
  return all<{ id: string; code: string; name: string }>("SELECT id, code, name FROM stations ORDER BY name");
}
