import Link from "next/link";
import { all, get, parseJson } from "@/lib/db";
import { localizeWorkflow } from "@/lib/i18n/dynamic";
import { can, type AuthUser } from "@/lib/rbac/access";
import { config, publicConfigStatus } from "@/lib/config";
import { getSetting, getWorkflow, LANGUAGES } from "@/lib/domain/workflow";
import { getPrefs, NOTIFICATION_KIND_LABELS, type NotificationKind } from "@/lib/domain/notifications";
import { listPolicies, findFlagged, RETENTION_TYPES } from "@/lib/domain/retention";
import { DEFAULT_TEMPLATE_FIELDS } from "@/lib/seed/base";
import { formatBytes, formatDate } from "@/lib/format";
import { ActionForm, SubmitButton, FieldError } from "@/components/forms";
import { Badge, Card, EmptyState, KeyValue, Notice, Table, Td, Th, inputClass } from "@/components/ui";
import { getTr, getLang } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import { WorkflowEditor } from "@/components/settings/workflow-editor";
import { TemplateEditor, type EditorField } from "@/components/settings/template-editor";
import { NumberingForm } from "@/components/settings/numbering-form";
import { DemoResetForm } from "@/components/settings/demo-reset-form";
import {
  updateProfileAction,
  changePasswordAction,
  updateNotificationPrefsAction,
  updateStationAction,
  updateNumberingAction,
  saveWorkflowAction,
  saveListsAction,
  saveTemplateAction,
  saveRecordingNoticeAction,
  updateRetentionPolicyAction,
  runRetentionAction,
  deleteFlaggedAction,
  demoResetAction,
} from "./actions";

function TextField({ name, label, defaultValue, type = "text", required, maxLength, autoComplete, hint }: {
  name: string; label: string; defaultValue?: string | null; type?: string; required?: boolean; maxLength?: number; autoComplete?: string; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
        {required && <span className="ml-0.5 text-red-700" aria-hidden>*</span>}
      </label>
      <input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} maxLength={maxLength} autoComplete={autoComplete} className={inputClass} />
      <FieldError name={name} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/* ---------------- Profile ---------------- */

export async function ProfileSection({ user }: { user: AuthUser }) {
  const tr = await getTr();
  const lang = await getLang();
  const row = get<{ must_change_password: number; last_login_at: string | null }>("SELECT must_change_password, last_login_at FROM users WHERE id = ?", user.id);
  return (
    <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
      {row?.must_change_password ? (
        <Notice tone="amber" title={tr("Please change your password")} className="lg:col-span-2">
          {tr("Your password was set by an administrator. Choose a new password that only you know.")}
        </Notice>
      ) : null}
      <Card title={tr("Your account")} description={tr("Contact your station administrator to change your name, role or station.")}>
        <KeyValue
          items={[
            { label: tr("Name"), value: user.name },
            { label: tr("Email"), value: user.email },
            { label: tr("Role"), value: tr(user.roleName as MsgKey) },
            { label: tr("Station"), value: user.stationName ?? "—" },
            { label: tr("Badge number"), value: user.badgeNumber ?? "—" },
            { label: tr("Last sign-in"), value: formatDate(row?.last_login_at, { time: true, lang }) },
          ]}
        />
        <ActionForm action={updateProfileAction} className="mt-6 flex items-end gap-3 border-t border-slate-200 pt-4">
          <div className="flex-1">
            <label htmlFor="preferred_language" className="mb-1 block text-sm font-medium text-slate-800">{tr("Preferred language")}</label>
            <select id="preferred_language" name="preferred_language" defaultValue={user.preferredLanguage} className={inputClass}>
              {Object.entries(LANGUAGES).map(([k, l]) => (
                <option key={k} value={k}>{l.label} ({l.native})</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{tr("Used as the default language for statement intake and speaker-facing screens.")}</p>
          </div>
          <SubmitButton variant="secondary">{tr("Save")}</SubmitButton>
        </ActionForm>
      </Card>
      <Card title={tr("Change password")} description={tr("Changing your password signs out your other sessions.")}>
        <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-4">
          <TextField name="current" label={tr("Current password")} type="password" required autoComplete="current-password" />
          <TextField name="next" label={tr("New password")} type="password" required autoComplete="new-password" hint={tr("At least 12 characters, with letters and numbers.")} />
          <TextField name="confirm" label={tr("Confirm new password")} type="password" required autoComplete="new-password" />
          <div className="flex justify-end">
            <SubmitButton>{tr("Change password")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

/* ---------------- Notifications ---------------- */

export async function NotificationsSection({ user }: { user: AuthUser }) {
  const tr = await getTr();
  const prefs = getPrefs(user.id);
  const emailOff = config.emailProvider === "none";
  const smsOff = config.smsProvider === "none";
  return (
    <div className="max-w-3xl">
      <Card title={tr("Notification preferences")} description={tr("In-app notifications never include statement content — only references and task titles.")}>
        <ActionForm action={updateNotificationPrefsAction} className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">{tr("In-app notifications")}</legend>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.entries(NOTIFICATION_KIND_LABELS) as [NotificationKind, string][]).map(([k, label]) => (
                <li key={k}>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="enabled" value={k} defaultChecked={!prefs.muted.includes(k)} className="h-4 w-4" />
                    {tr(label as MsgKey)}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset className="border-t border-slate-200 pt-4">
            <legend className="mb-2 text-sm font-semibold text-slate-800">{tr("External delivery")}</legend>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 text-sm ${emailOff ? "text-slate-400" : "text-slate-700"}`}>
                <input type="checkbox" name="email" defaultChecked={prefs.email && !emailOff} disabled={emailOff} className="h-4 w-4" />
                {tr("Email copies of notifications")}
              </label>
              <label className={`flex items-center gap-2 text-sm ${smsOff ? "text-slate-400" : "text-slate-700"}`}>
                <input type="checkbox" name="sms" defaultChecked={prefs.sms && !smsOff} disabled={smsOff} className="h-4 w-4" />
                {tr("SMS alerts")}
              </label>
              {(emailOff || smsOff) && (
                <p className="text-xs text-slate-500">
                  {tr(emailOff && smsOff ? "No email or SMS provider is configured for this deployment, so only in-app notifications are delivered. Nothing is sent externally." : emailOff ? "No email provider is configured for this deployment, so only in-app notifications are delivered. Nothing is sent externally." : "No SMS provider is configured for this deployment, so only in-app notifications are delivered. Nothing is sent externally.")}
                </p>
              )}
            </div>
          </fieldset>
          <div className="flex justify-end">
            <SubmitButton>{tr("Save preferences")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

/* ---------------- Station & numbering ---------------- */

interface StationRow {
  id: string; code: string; name: string; district: string | null; state: string | null; address: string | null; phone: string | null;
  case_number_format: string; sequence_reset: "yearly" | "never";
}

function loadStation(id: string) {
  return get<StationRow>("SELECT id, code, name, district, state, address, phone, case_number_format, sequence_reset FROM stations WHERE id = ?", id);
}

export async function StationSection({ user }: { user: AuthUser }) {
  const tr = await getTr();
  const st = loadStation(user.stationId!);
  if (!st) return <EmptyState title={tr("Station not found")} />;
  return (
    <div className="max-w-3xl">
      <Card title={tr("Station profile")} description={tr("Station code {code} — the code is part of case references and cannot be changed here.", { code: st.code })}>
        <ActionForm action={updateStationAction} className="space-y-4" confirmTitle={tr("Update station profile?")} confirm={tr("The station profile is shown to all staff of this station.")} confirmLabel={tr("Save")}>
          <TextField name="name" label={tr("Station name")} defaultValue={st.name} required maxLength={120} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField name="district" label={tr("District")} defaultValue={st.district} maxLength={120} />
            <TextField name="state" label={tr("State")} defaultValue={st.state} maxLength={120} />
          </div>
          <TextField name="address" label={tr("Address")} defaultValue={st.address} maxLength={300} />
          <TextField name="phone" label={tr("Phone")} defaultValue={st.phone} maxLength={40} />
          <div className="flex justify-end">
            <SubmitButton>{tr("Save station profile")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

export async function NumberingSection({ user }: { user: AuthUser }) {
  const tr = await getTr();
  const st = loadStation(user.stationId!);
  if (!st) return <EmptyState title={tr("Station not found")} />;
  const period = st.sequence_reset === "yearly" ? String(new Date().getFullYear()) : "all";
  const last = get<{ last_value: number }>("SELECT last_value FROM case_sequences WHERE station_id = ? AND period = ?", st.id, period)?.last_value ?? 0;
  return (
    <div className="max-w-3xl space-y-4">
      <Card title={tr("Case reference numbering")} description={tr("References are generated atomically when a case is created from a completed intake.")}>
        <NumberingForm action={updateNumberingAction} format={st.case_number_format} reset={st.sequence_reset} stationCode={st.code} nextSeq={last + 1} />
      </Card>
      <Notice tone="slate">
        {tr("Case references are internal FirstRecord identifiers. They are not official FIR numbers unless your organization has approved this format and an authorized integration confirms filing.")}
      </Notice>
    </div>
  );
}

/* ---------------- Workflows ---------------- */

export async function WorkflowSection() {
  const tr = await getTr();
  const caseWf = localizeWorkflow(getWorkflow("case"), tr);
  const taskWf = localizeWorkflow(getWorkflow("task"), tr);
  const usage = (kind: "case" | "task") =>
    Object.fromEntries(all<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM ${kind === "case" ? "cases" : "tasks"} GROUP BY status`).map((r) => [r.status, r.n]));
  const taskTypes = getSetting("task.types");
  const incidentTypes = getSetting("incident.types");
  return (
    <div className="space-y-6">
      <Notice tone="slate">
        {tr("Case workflow states describe internal case-handling progress only. They do not represent official legal filing status.")}
      </Notice>
      <Card title={tr("Case workflow")} description={caseWf.name}>
        <WorkflowEditor action={saveWorkflowAction} kind="case" name={caseWf.name} initialStates={caseWf.states} initialTransitions={caseWf.transitions} usage={usage("case")} />
      </Card>
      <Card title={tr("Task workflow")} description={taskWf.name}>
        <WorkflowEditor action={saveWorkflowAction} kind="task" name={taskWf.name} initialStates={taskWf.states} initialTransitions={taskWf.transitions} usage={usage("task")} />
      </Card>
      <Card title={tr("Lists")} description={tr("Options offered in forms. Removing an option does not change existing records.")}>
        <ActionForm action={saveListsAction} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="incident_types" className="mb-1 block text-sm font-medium text-slate-800">{tr("Incident types (one per line)")}</label>
            <textarea id="incident_types" name="incident_types" rows={12} defaultValue={incidentTypes.join("\n")} className={inputClass} />
            <FieldError name="incident_types" />
            <p className="mt-1 text-xs text-slate-500">{tr("Neutral descriptions used at intake — not legal classifications.")}</p>
          </div>
          <div>
            <label htmlFor="task_types" className="mb-1 block text-sm font-medium text-slate-800">{tr("Task types (key | Label, one per line)")}</label>
            <textarea id="task_types" name="task_types" rows={12} defaultValue={taskTypes.map((t) => `${t.key} | ${t.label}`).join("\n")} className={`${inputClass} font-mono`} />
            <FieldError name="task_types" />
            <p className="mt-1 text-xs text-slate-500">{tr("Keep existing keys unchanged so existing tasks keep their type.")}</p>
          </div>
          <div className="flex justify-end lg:col-span-2">
            <SubmitButton>{tr("Save lists")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

/* ---------------- Templates ---------------- */

export async function TemplatesSection() {
  const tr = await getTr();
  const lang = await getLang();
  const tpl = get<{ id: string; name: string; jurisdiction: string; version: number; description: string; fields: string; updated_at: string }>(
    "SELECT id, name, jurisdiction, version, description, fields, updated_at FROM templates WHERE is_active = 1 ORDER BY version DESC LIMIT 1",
  );
  const history = all<{ id: string; version: number; name: string; created_at: string; creator: string | null; is_active: number }>(
    "SELECT t.id, t.version, t.name, t.created_at, u.name AS creator, t.is_active FROM templates t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.version DESC LIMIT 20",
  );
  if (!tpl) return <EmptyState title={tr("No active FIR draft template")} description={tr("Run the seed script to install the default template.")} />;
  return (
    <div className="space-y-6">
      <Notice tone="amber" title={tr("Not an official FIR format")}>
        {tr("This template structures FirstRecord drafts. It is not an official FIR format until an authorized officer has reviewed it against the applicable jurisdiction's legal requirements. Legal provisions are always officer-entered: no approved, maintained legal source is configured.")}
      </Notice>
      <Card title={tr("Active template — version {version}", { version: tpl.version })} description={tr("Jurisdiction: {jurisdiction} · updated {date}", { jurisdiction: tpl.jurisdiction, date: formatDate(tpl.updated_at, { time: true, lang }) })}>
        <TemplateEditor
          action={saveTemplateAction}
          templateId={tpl.id}
          name={tpl.name}
          jurisdiction={tpl.jurisdiction}
          description={tpl.description}
          fields={parseJson<EditorField[]>(tpl.fields, [])}
          coreKeys={DEFAULT_TEMPLATE_FIELDS.map((f) => f.key)}
          manualOnlyKeys={DEFAULT_TEMPLATE_FIELDS.filter((f) => f.fill === "manual").map((f) => f.key)}
          readOnly={false}
        />
      </Card>
      <Card title={tr("Version history")} padded={false}>
        <Table caption={tr("Template versions")}>
          <thead><tr><Th>{tr("Version")}</Th><Th>{tr("Name")}</Th><Th>{tr("Created")}</Th><Th>{tr("By")}</Th><Th>{tr("Status")}</Th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <Td>v{h.version}</Td>
                <Td>{h.name}</Td>
                <Td className="text-xs">{formatDate(h.created_at, { time: true, lang })}</Td>
                <Td className="text-xs">{h.creator ?? tr("Seed")}</Td>
                <Td>{h.is_active ? <Badge tone="green">{tr("Active")}</Badge> : <Badge>{tr("Superseded")}</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/* ---------------- Recording ---------------- */

export async function RecordingSection() {
  const tr = await getTr();
  const en = getSetting("recording.notice.en");
  const hi = getSetting("recording.notice.hi");
  const version = getSetting("recording.notice_version");
  const langs = getSetting("languages.enabled");
  return (
    <div className="max-w-4xl space-y-4">
      <Notice tone="slate">
        {tr("This notice is shown to the speaker before any audio/video recording. The exact text and version shown are stored with every consent decision. Recording is always optional; declining never prevents a report from being received. Translations should be reviewed by a qualified translator.")}
      </Notice>
      <Card title={tr("Recording consent notice")} description={tr("Current version: {version}", { version })}>
        <ActionForm
          action={saveRecordingNoticeAction}
          className="space-y-4"
          confirmTitle={tr("Save recording notice?")}
          confirm={tr("If the text changes, a new notice version is created. Consent already recorded keeps the text that was shown at the time.")}
          confirmLabel={tr("Save")}
        >
          <div>
            <label htmlFor="notice_en" className="mb-1 block text-sm font-medium text-slate-800">{tr("English notice")}</label>
            <textarea id="notice_en" name="notice_en" rows={10} defaultValue={en} className={inputClass} maxLength={4000} />
            <FieldError name="notice_en" />
          </div>
          <div>
            <label htmlFor="notice_hi" className="mb-1 block text-sm font-medium text-slate-800">{tr("Hindi notice (हिन्दी)")}</label>
            <textarea id="notice_hi" name="notice_hi" rows={10} defaultValue={hi} lang="hi" className={inputClass} maxLength={4000} />
            <FieldError name="notice_hi" />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">{tr("Enabled statement languages")}</legend>
            <div className="flex flex-wrap gap-4">
              {Object.entries(LANGUAGES).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="languages" value={k} defaultChecked={langs.includes(k) || k === "en"} disabled={k === "en"} className="h-4 w-4" />
                  {l.label} ({l.native}){k === "en" && <span className="text-xs text-slate-500">— {tr("always enabled")}</span>}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{tr("Additional languages are added in")} <code>src/lib/domain/workflow.ts</code> (LANGUAGES) {tr("together with a translated notice.")}</p>
          </fieldset>
          <div className="flex justify-end">
            <SubmitButton>{tr("Save")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

/* ---------------- Retention ---------------- */

export async function RetentionSection({ user }: { user: AuthUser }) {
  const tr = await getTr();
  const lang = await getLang();
  const policies = listPolicies();
  const flagged = findFlagged(user);
  const canDelete = can(user, "data.delete");
  return (
    <div className="space-y-6">
      <Notice tone="amber" title={tr("Retention periods are a policy decision")}>
        {tr("FirstRecord applies whatever periods you configure. It does not determine what the law requires. Set periods according to your organization's approved, jurisdiction-specific records policy. Audit events are never deleted by retention.")}
      </Notice>
      <Card title={tr("Retention policies")} padded={false}>
        <Table caption={tr("Retention policies")}>
          <thead><tr><Th>{tr("Record type")}</Th><Th>{tr("Keep for (days)")}</Th><Th>{tr("After the period")}</Th><Th>{tr("Last changed")}</Th><Th><span className="sr-only">{tr("Save")}</span></Th></tr></thead>
          <tbody>
            {policies.map((p) => {
              const meta = RETENTION_TYPES[p.record_type];
              const typeLabel = meta ? tr(meta.label as MsgKey) : p.record_type;
              const formId = `ret-${p.id}`;
              return (
                <tr key={p.id}>
                  <Td>
                    <p className="font-medium text-slate-900">{typeLabel}</p>
                    <p className="text-xs text-slate-500">{tr(p.description as MsgKey)}</p>
                  </Td>
                  <Td>
                    <label htmlFor={`${formId}-days`} className="sr-only">{tr("Retention days for {type}", { type: typeLabel })}</label>
                    <input id={`${formId}-days`} form={formId} name="retention_days" type="number" min={1} max={36500} defaultValue={p.retention_days} className={`${inputClass} w-28`} />
                  </Td>
                  <Td>
                    <label htmlFor={`${formId}-action`} className="sr-only">{tr("Action for {type}", { type: typeLabel })}</label>
                    <select id={`${formId}-action`} form={formId} name="action" defaultValue={p.action} className={inputClass}>
                      <option value="flag_for_review">{tr("Flag for human review")}</option>
                      {meta?.allowDelete && <option value="delete">{tr("Delete automatically")}</option>}
                    </select>
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(p.updated_at, { lang })}{p.updated_by_name ? ` · ${p.updated_by_name}` : ""}</Td>
                  <Td>
                    <ActionForm
                      id={formId}
                      action={updateRetentionPolicyAction}
                      confirmTitle={tr("Change retention for {type}?", { type: typeLabel })}
                      confirm={tr("Automatic deletion is irreversible. Make sure the new period is approved by your records policy.")}
                      confirmLabel={tr("Save policy")}
                    >
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton variant="secondary" size="sm">{tr("Save")}</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card
        title={tr("Retention review")}
        description={tr("Items past their retention period under “flag for review” policies. Nothing here is deleted without an authorized person's decision.")}
        actions={
          canDelete ? (
            <ActionForm
              action={runRetentionAction}
              confirmTitle={tr("Run automatic retention now?")}
              confirm={tr("Records covered by “delete automatically” policies and past their period will be permanently deleted. Flagged items are not affected.")}
              confirmLabel={tr("Run now")}
              danger
            >
              <SubmitButton variant="secondary" size="sm">{tr("Run automatic retention now")}</SubmitButton>
            </ActionForm>
          ) : undefined
        }
        padded={false}
      >
        {flagged.length === 0 ? (
          <div className="p-4"><EmptyState title={tr("Nothing is past its retention period")} description={tr("Items appear here when they exceed a “flag for review” retention period.")} /></div>
        ) : (
          <Table caption={tr("Items flagged for retention review")}>
            <thead><tr><Th>{tr("Item")}</Th><Th>{tr("Case")}</Th><Th>{tr("Date")}</Th><Th>{tr("Size")}</Th><Th>{tr("Decision")}</Th></tr></thead>
            <tbody>
              {flagged.map((f) => (
                <tr key={`${f.type}-${f.id}`}>
                  <Td><p className="font-medium text-slate-900">{f.label}</p><p className="text-xs text-slate-500">{f.type.replace("_", " ")}</p></Td>
                  <Td>{f.caseId ? <Link href={`/cases/${f.caseId}?tab=records`} className="text-[#1F4E9C] hover:underline">{f.caseReference}</Link> : "—"}</Td>
                  <Td className="text-xs">{formatDate(f.date, { lang })}</Td>
                  <Td className="text-xs">{f.sizeBytes ? formatBytes(f.sizeBytes) : "—"}</Td>
                  <Td>
                    {f.type === "closed_case" ? (
                      <p className="max-w-xs text-xs text-slate-500">{tr("Case records are not deleted by FirstRecord. Follow your approved records-destruction procedure.")}</p>
                    ) : canDelete ? (
                      <ActionForm
                        action={deleteFlaggedAction}
                        confirmTitle={tr("Permanently delete this item?")}
                        confirm={tr("The stored file is destroyed and cannot be recovered. The record of its existence, the deletion and your reason remain in the audit log.")}
                        confirmLabel={tr("Delete permanently")}
                        danger
                        className="flex items-start gap-2"
                      >
                        <input type="hidden" name="type" value={f.type} />
                        <input type="hidden" name="id" value={f.id} />
                        <div>
                          <label htmlFor={`reason-${f.id}`} className="sr-only">{tr("Reason for deleting {item}", { item: f.label })}</label>
                          <input id={`reason-${f.id}`} name="reason" placeholder={tr("Reason (required)")} minLength={5} maxLength={300} required className={`${inputClass} w-56`} />
                          <FieldError name="reason" />
                        </div>
                        <SubmitButton variant="danger" size="sm">{tr("Delete")}</SubmitButton>
                      </ActionForm>
                    ) : (
                      <span className="text-xs text-slate-500">{tr("Requires data.delete permission")}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ---------------- System ---------------- */

export async function SystemSection() {
  const tr = await getTr();
  const s = publicConfigStatus();
  const yes = (b: boolean) => (b ? <Badge tone="green">{tr("Yes")}</Badge> : <Badge tone="amber">{tr("No")}</Badge>);
  return (
    <div className="max-w-4xl space-y-6">
      <Notice tone="slate">{tr("Read-only. Deployment configuration is set through environment variables (see .env.example). Secrets are never displayed.")}</Notice>
      <Card title={tr("Environment")}>
        <KeyValue
          items={[
            { label: tr("Environment"), value: s.environment },
            { label: tr("Sample data mode"), value: s.demoMode ? <Badge tone="amber">{tr("On — not for real records")}</Badge> : <Badge tone="green">{tr("Off")}</Badge> },
            { label: tr("Session secret configured"), value: yes(s.sessionSecretConfigured) },
            { label: tr("Identity provider"), value: s.identityProvider },
          ]}
        />
      </Card>
      <Card title={tr("Storage")}>
        <KeyValue
          items={[
            { label: tr("Adapter"), value: s.storageAdapter },
            { label: tr("Encryption at rest"), value: s.storageEncryption.startsWith("NOT") ? <Badge tone="red">{s.storageEncryption}</Badge> : s.storageEncryption },
            { label: tr("Malware scanning"), value: s.malwareScanning },
          ]}
        />
      </Card>
      <Card title={tr("AI assistance")}>
        <KeyValue
          items={[
            { label: tr("Requested provider"), value: s.ai.requestedProvider },
            { label: tr("Effective mode"), value: s.ai.effectiveMode === "live" ? <Badge tone="blue">{tr("Live model")}</Badge> : <Badge>{tr("Rule-based assistant (no external calls)")}</Badge> },
            { label: tr("Model"), value: s.ai.model },
            { label: tr("API key configured"), value: yes(s.ai.apiKeyConfigured) },
            { label: tr("External processing authorized"), value: yes(s.ai.externalProcessingAuthorized) },
          ]}
        />
        <p className="mt-4 text-xs text-slate-500">
          {tr("Statement content is sent to an external model only when the provider is set, a key is configured and AI_EXTERNAL_PROCESSING_AUTHORIZED=true.")}
        </p>
      </Card>
      <Card title={tr("Integrations")}>
        <KeyValue
          items={[
            { label: tr("Email delivery"), value: s.email === "none" ? tr("Not configured") : s.email },
            { label: tr("SMS delivery"), value: s.sms === "none" ? tr("Not configured") : s.sms },
            { label: tr("Official FIR filing system"), value: s.officialFilingIntegration },
          ]}
        />
      </Card>
    </div>
  );
}

/* ---------------- Data ---------------- */

export async function DataSection({ user }: { user: AuthUser }) {
  const tr = await getTr();
  const showReset = config.demoMode && can(user, "demo.reset");
  return (
    <div className="max-w-3xl space-y-6">
      <Card title={tr("Backup, export and recovery")}>
        <div className="space-y-2 text-sm text-slate-700">
          <p>{tr("FirstRecord stores data in a SQLite database (DATABASE_PATH) and encrypted files (STORAGE_DIR). Both must be backed up together, and the storage encryption key must be kept separately and securely — without it, stored recordings and attachments cannot be decrypted.")}</p>
          <p>{tr("Backups, restores and bulk exports are operator procedures performed on the server, not through this screen, so that they follow your organization's approved handling process. Aggregate CSV exports for authorized roles are available under Reports & Analytics.")}</p>
          <p>{tr("See docs/operations.md in the repository for backup, restore and migration steps.")}</p>
        </div>
      </Card>
      {showReset ? (
        <Card title={tr("Reset sample data")} description={tr("Available only because DEMO_MODE is enabled.")}>
          <Notice tone="red" className="mb-4">{tr("This permanently deletes every record in this database and replaces it with fictional sample data.")}</Notice>
          <DemoResetForm action={demoResetAction} />
        </Card>
      ) : config.demoMode ? null : (
        <Notice tone="slate">{tr("Sample data reset is disabled for this deployment.")}</Notice>
      )}
    </div>
  );
}
