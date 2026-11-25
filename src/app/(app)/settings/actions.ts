"use server";
import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { runAction, zs, type ActionResult } from "@/lib/actions";
import { requireActor, requestIp, SESSION_COOKIE } from "@/lib/auth/session";
import { getTr } from "@/lib/i18n/server";
import { get, insert, newId, now, parseJson, run, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/auth/password";
import { can } from "@/lib/rbac/access";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { getSetting, getWorkflow, saveWorkflow, setSetting, validateCaseNumberFormat, LANGUAGES } from "@/lib/domain/workflow";
import { NOTIFICATION_KIND_LABELS, type NotificationKind } from "@/lib/domain/notifications";
import { deleteFlaggedItem, runAutomaticRetention, updatePolicy } from "@/lib/domain/retention";
import { DEFAULT_TEMPLATE_FIELDS, seedBase, wipeAll } from "@/lib/seed/base";
import { seedDemoContent } from "@/lib/seed/demo-content";

const RESET_PHRASE = "RESET DEMO DATA";

function done(message: string, tab: string): ActionResult {
  revalidatePath("/settings");
  return { ok: true, message, redirectTo: undefined, data: { tab } };
}

/* ---------------- Profile ---------------- */

export async function updateProfileAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor();
    const { preferred_language } = z
      .object({ preferred_language: z.string().refine((v) => v in LANGUAGES, "Select a supported language") })
      .parse(Object.fromEntries(fd));
    update("users", actor.id, { preferred_language, updated_at: now() });
    audit({ actorId: actor.id, action: "user.preferences_updated", entityType: "user", entityId: actor.id, summary: `Preferred language set to ${LANGUAGES[preferred_language].label}` });
    return done("Preferences saved.", "profile");
  });
}

export async function changePasswordAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor();
    const input = z
      .object({
        current: z.string().min(1, "Enter your current password").max(200),
        next: z.string().min(1, "Enter a new password").max(200),
        confirm: z.string().max(200),
      })
      .parse(Object.fromEntries(fd));
    const row = get<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", actor.id);
    const ip = await requestIp();
    if (!verifyPassword(input.current, row?.password_hash)) {
      audit({ actorId: actor.id, action: "user.password_change_failed", entityType: "user", entityId: actor.id, summary: "Password change failed: current password incorrect", ip });
      throw new ValidationError("Current password is incorrect.", { current: "Current password is incorrect." });
    }
    const policy = passwordPolicyError(input.next);
    if (policy) throw new ValidationError(policy, { next: policy });
    if (input.next !== input.confirm) throw new ValidationError("Passwords do not match.", { confirm: "Passwords do not match." });
    if (input.next === input.current) throw new ValidationError("Choose a password different from your current one.", { next: "Must differ from current password." });
    tx(() => {
      update("users", actor.id, { password_hash: hashPassword(input.next), must_change_password: 0, updated_at: now() });
      run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?", now(), actor.id, actor.sessionId ?? "");
      audit({ actorId: actor.id, action: "user.password_changed", entityType: "user", entityId: actor.id, summary: "Password changed by user; other sessions signed out", ip });
    });
    return done("Password changed. Your other sessions were signed out.", "profile");
  });
}

/* ---------------- Notifications ---------------- */

export async function updateNotificationPrefsAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor();
    const enabled = new Set(fd.getAll("enabled").map(String));
    const muted = (Object.keys(NOTIFICATION_KIND_LABELS) as NotificationKind[]).filter((k) => !enabled.has(k));
    const email = fd.get("email") === "on" && config.emailProvider !== "none";
    const sms = fd.get("sms") === "on" && config.smsProvider !== "none";
    update("users", actor.id, { notification_prefs: JSON.stringify({ muted, email, sms }), updated_at: now() });
    audit({ actorId: actor.id, action: "user.notification_prefs_updated", entityType: "user", entityId: actor.id, summary: `Notification preferences updated (${muted.length} muted)` });
    revalidatePath("/", "layout");
    return done("Notification preferences saved.", "notifications");
  });
}

/* ---------------- Station & numbering ---------------- */

export async function updateStationAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.station");
    if (!actor.stationId) throw new ForbiddenError("Your account is not assigned to a station.");
    const input = z
      .object({
        name: zs.required("Station name", 120),
        district: zs.optional(120),
        state: zs.optional(120),
        address: zs.optional(300),
        phone: zs.optional(40),
      })
      .parse(Object.fromEntries(fd));
    update("stations", actor.stationId, { ...input, updated_at: now() });
    audit({ actorId: actor.id, action: "settings.station_updated", entityType: "station", entityId: actor.stationId, summary: "Station profile updated", ip: await requestIp() });
    revalidatePath("/", "layout");
    return done("Station profile saved.", "station");
  });
}

export async function updateNumberingAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.station");
    if (!actor.stationId) throw new ForbiddenError("Your account is not assigned to a station.");
    const input = z
      .object({ case_number_format: zs.required("Format", 60), sequence_reset: z.enum(["yearly", "never"]) })
      .parse(Object.fromEntries(fd));
    const err = validateCaseNumberFormat(input.case_number_format);
    if (err) throw new ValidationError(err, { case_number_format: err });
    const prev = get<{ case_number_format: string; sequence_reset: string }>("SELECT case_number_format, sequence_reset FROM stations WHERE id = ?", actor.stationId);
    update("stations", actor.stationId, { ...input, updated_at: now() });
    audit({
      actorId: actor.id,
      action: "settings.numbering_changed",
      entityType: "station",
      entityId: actor.stationId,
      summary: `Case numbering changed from ${prev?.case_number_format} (${prev?.sequence_reset}) to ${input.case_number_format} (${input.sequence_reset})`,
      ip: await requestIp(),
    });
    return done("Case numbering saved. Existing references are unchanged.", "numbering");
  });
}

/* ---------------- Workflows ---------------- */

const stateSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, "State keys must be lowercase letters, digits or underscores"),
  label: z.string().trim().min(1, "Every state needs a label").max(60),
  category: z.enum(["open", "active", "done"]),
  color: z.enum(["slate", "blue", "amber", "violet", "green", "red", "teal"]),
});
const workflowSchema = z.object({
  name: z.string().trim().min(1, "Workflow name is required").max(80),
  states: z.array(stateSchema).min(2, "A workflow needs at least two states").max(15),
  transitions: z.record(z.string(), z.array(z.string())),
});

export async function saveWorkflowAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.workflow");
    const kind = z.enum(["case", "task"]).parse(fd.get("kind"));
    const wf = workflowSchema.parse(parseJson(String(fd.get("workflow") ?? ""), null));
    const keys = wf.states.map((s) => s.key);
    if (new Set(keys).size !== keys.length) throw new ValidationError("State keys must be unique.");
    if (!wf.states.some((s) => s.category === "done")) throw new ValidationError("At least one state must be in the “done” category.");
    if (wf.states[0].category === "done") throw new ValidationError("The first (initial) state cannot be a done state.");
    const transitions: Record<string, string[]> = {};
    for (const k of keys) transitions[k] = [...new Set((wf.transitions[k] ?? []).filter((t) => t !== k && keys.includes(t)))];
    const dead = wf.states.filter((s) => s.category !== "done" && transitions[s.key].length === 0);
    if (dead.length) throw new ValidationError((await getTr())("These states have no way out: {states}. Allow at least one transition from each.", { states: dead.map((d) => d.label).join(", ") }));
    const unreachable = wf.states.slice(1).filter((s) => !keys.some((k) => transitions[k].includes(s.key)));
    if (unreachable.length) throw new ValidationError((await getTr())("These states cannot be reached: {states}.", { states: unreachable.map((d) => d.label).join(", ") }));

    const current = getWorkflow(kind);
    const removed = current.states.map((s) => s.key).filter((k) => !keys.includes(k));
    for (const k of removed) {
      const n = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${kind === "case" ? "cases" : "tasks"} WHERE status = ?`, k)!.n;
      if (n > 0) throw new ValidationError((await getTr())("State “{state}” is used by {n} record(s) and cannot be removed.", { state: current.states.find((s) => s.key === k)?.label ?? k, n }));
    }
    saveWorkflow(kind, { name: wf.name, states: wf.states, transitions }, actor.id);
    audit({
      actorId: actor.id,
      action: "settings.workflow_changed",
      entityType: "workflow",
      summary: `${kind === "case" ? "Case" : "Task"} workflow updated: ${wf.states.length} states${removed.length ? `, removed ${removed.join(", ")}` : ""}`,
      ip: await requestIp(),
    });
    revalidatePath("/", "layout");
    return done(`${kind === "case" ? "Case" : "Task"} workflow saved.`, "workflow");
  });
}

export async function saveListsAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.workflow");
    const lines = (v: FormDataEntryValue | null) =>
      String(v ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const incident = [...new Set(lines(fd.get("incident_types")))].map((l) => l.slice(0, 60));
    if (incident.length < 1 || incident.length > 60) throw new ValidationError("Enter between 1 and 60 incident types.", { incident_types: "Enter between 1 and 60 incident types." });
    const taskTypes: { key: string; label: string }[] = [];
    for (const l of lines(fd.get("task_types"))) {
      const [rawKey, ...rest] = l.split("|");
      const label = (rest.join("|") || rawKey).trim().slice(0, 60);
      const key = (rest.length ? rawKey : rawKey).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
      if (!key || !label) continue;
      if (!taskTypes.some((t) => t.key === key)) taskTypes.push({ key, label });
    }
    if (taskTypes.length < 1 || taskTypes.length > 30) throw new ValidationError("Enter between 1 and 30 task types.", { task_types: "Enter between 1 and 30 task types." });
    setSetting("incident.types", incident, actor.id);
    setSetting("task.types", taskTypes, actor.id);
    audit({ actorId: actor.id, action: "settings.lists_changed", entityType: "settings", summary: `Incident types (${incident.length}) and task types (${taskTypes.length}) updated`, ip: await requestIp() });
    return done("Lists saved.", "workflow");
  });
}

/* ---------------- Templates ---------------- */

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  label: z.string().trim().min(1, "Every field needs a label").max(120),
  required: z.boolean(),
  kind: z.enum(["text", "longtext", "date", "list"]),
  fill: z.enum(["ai", "manual"]),
  help: z.string().trim().max(300),
});

export async function saveTemplateAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.workflow");
    const input = z
      .object({
        templateId: z.string().uuid(),
        name: z.string().trim().min(1, "Template name is required").max(120),
        jurisdiction: z.string().trim().min(1, "Jurisdiction is required").max(120),
        description: z.string().trim().max(600),
        fields: z.array(fieldSchema).min(1).max(40),
      })
      .parse(parseJson(String(fd.get("template") ?? ""), null));
    const cur = get<{ id: string; version: number; fields: string; is_active: number }>("SELECT id, version, fields, is_active FROM templates WHERE id = ?", input.templateId);
    if (!cur || !cur.is_active) throw new ValidationError("This template is no longer the active version. Reload the page.");
    const keys = input.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) throw new ValidationError("Field keys must be unique.");
    const coreKeys = DEFAULT_TEMPLATE_FIELDS.map((f) => f.key);
    const curFields = parseJson<{ key: string; kind: string }[]>(cur.fields, []);
    const missing = coreKeys.filter((k) => curFields.some((f) => f.key === k) && !keys.includes(k));
    if (missing.length) throw new ValidationError((await getTr())("Core fields cannot be removed: {fields}.", { fields: missing.join(", ") }));
    const fields = input.fields.map((f) => {
      const core = DEFAULT_TEMPLATE_FIELDS.find((c) => c.key === f.key);
      // Core field types are fixed; custom fields and legal provisions are officer-only (no approved legal source).
      return {
        ...f,
        kind: core ? core.kind : f.kind,
        fill: !core || f.key === "legal_provisions" || core.fill === "manual" ? "manual" : f.fill,
      };
    });
    const id = newId();
    const t = now();
    tx(() => {
      run("UPDATE templates SET is_active = 0, updated_at = ? WHERE id = ?", t, cur.id);
      insert("templates", {
        id,
        name: input.name,
        jurisdiction: input.jurisdiction,
        version: cur.version + 1,
        description: input.description,
        fields: JSON.stringify(fields),
        is_active: 1,
        created_by: actor.id,
        created_at: t,
        updated_at: t,
      });
      audit({ actorId: actor.id, action: "settings.template_versioned", entityType: "template", entityId: id, summary: `FIR draft template saved as version ${cur.version + 1} (${fields.length} fields)`, ip: null });
    });
    return done((await getTr())("Template version {n} saved and active for new drafts.", { n: cur.version + 1 }), "templates");
  });
}

/* ---------------- Recording notice & languages ---------------- */

export async function saveRecordingNoticeAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.retention", "settings.workflow");
    const input = z
      .object({ notice_en: z.string().trim().min(40, "The English notice must explain purpose, access, storage and retention").max(4000), notice_hi: z.string().trim().max(4000) })
      .parse({ notice_en: fd.get("notice_en"), notice_hi: fd.get("notice_hi") ?? "" });
    const langs = ["en", ...fd.getAll("languages").map(String).filter((l) => l !== "en" && l in LANGUAGES)];
    if (langs.includes("hi") && input.notice_hi.length < 40) {
      throw new ValidationError("Hindi is enabled, so a Hindi notice is required.", { notice_hi: "Provide the Hindi notice or disable Hindi." });
    }
    const changed = input.notice_en !== getSetting("recording.notice.en") || input.notice_hi !== getSetting("recording.notice.hi");
    const version = changed ? new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" : getSetting("recording.notice_version");
    setSetting("recording.notice.en", input.notice_en, actor.id);
    setSetting("recording.notice.hi", input.notice_hi, actor.id);
    setSetting("recording.notice_version", version, actor.id);
    setSetting("languages.enabled", langs, actor.id);
    audit({
      actorId: actor.id,
      action: "settings.recording_notice_changed",
      entityType: "settings",
      summary: changed ? `Recording notice updated to version ${version}` : `Enabled languages set to ${langs.join(", ")}`,
      ip: await requestIp(),
    });
    return done(changed ? (await getTr())("Recording notice saved as version {n}. Future consent records will reference this version.", { n: version }) : "Language settings saved.", "recording");
  });
}

/* ---------------- Retention ---------------- */

export async function updateRetentionPolicyAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.retention");
    const input = z
      .object({ id: zs.id(), retention_days: z.coerce.number().int("Whole days only").min(1).max(36500), action: z.enum(["flag_for_review", "delete"]) })
      .parse(Object.fromEntries(fd));
    updatePolicy(actor, input.id, input.retention_days, input.action, await requestIp());
    return done("Retention policy saved.", "retention");
  });
}

export async function runRetentionAction(): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("settings.retention");
    if (!can(actor, "data.delete")) throw new ForbiddenError("Running automatic deletion requires the data.delete permission.");
    const result = await runAutomaticRetention(actor.id, await requestIp());
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    audit({ actorId: actor.id, action: "retention.run", entityType: "retention_policy", summary: `Retention run started manually; ${total} record(s) deleted under "delete" policies` });
    return done(total ? (await getTr())("Retention run complete: {n} record(s) deleted under automatic policies.", { n: total }) : "Retention run complete: nothing was due for automatic deletion.", "retention");
  });
}

export async function deleteFlaggedAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("data.delete");
    const input = z
      .object({ type: z.enum(["recording", "attachment"]), id: zs.id(), reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(300) })
      .parse(Object.fromEntries(fd));
    await deleteFlaggedItem(actor, input.type, input.id, input.reason, await requestIp());
    return done(input.type === "recording" ? "Recording deleted. The deletion is recorded in the audit log." : "Attachment deleted. The deletion is recorded in the audit log.", "retention");
  });
}

/* ---------------- Demo reset ---------------- */

export async function demoResetAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("demo.reset");
    if (!config.demoMode) throw new ForbiddenError("Demo reset is only available in demo mode.");
    if (fd.get("phrase") !== RESET_PHRASE) throw new ValidationError((await getTr())("Type {phrase} exactly to confirm.", { phrase: RESET_PHRASE }), { phrase: "Confirmation phrase does not match." });
    const actorName = actor.name;
    tx(() => {
      wipeAll();
      const base = seedBase({ demoUsers: true });
      seedDemoContent(base);
      audit({ actorId: null, action: "demo.reset", entityType: "system", summary: `Demo data reset by ${actorName}; all data replaced with fictional demo content` });
    });
    // Remove stored files belonging to wiped records.
    const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), config.storageDir);
    const entries = await fs.promises.readdir(dir).catch(() => [] as string[]);
    for (const sub of entries) {
      await fs.promises.rm(path.join(dir, sub), { recursive: true, force: true }).catch(() => {});
    }
    (await cookies()).delete(SESSION_COOKIE);
    return { ok: true, message: "Sample data reset. Please sign in again.", redirectTo: "/login" };
  });
}
