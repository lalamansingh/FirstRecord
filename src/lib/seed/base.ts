/**
 * Base reference data: stations, roles, demo users, workflows, templates,
 * retention policies. ALL PEOPLE, STATIONS AND RECORDS ARE FICTIONAL.
 */
import { insert, newId, now, get, run } from "@/lib/db";
import { DEFAULT_ROLES, type RoleKey } from "@/lib/rbac/permissions";
import { DEFAULT_CASE_WORKFLOW, DEFAULT_TASK_WORKFLOW } from "@/lib/domain/workflow";
import { hashPassword } from "@/lib/auth/password";
import { randomBytes } from "node:crypto";

/**
 * Password for seeded sample accounts: SEED_PASSWORD if set, otherwise a random
 * one generated per seed run (printed once by the seed script, never shown in the UI).
 */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD && process.env.SEED_PASSWORD.length >= 12
  ? process.env.SEED_PASSWORD
  : randomBytes(12).toString("base64url");

export interface TemplateField {
  key: string;
  label: string;
  required: boolean;
  kind: "text" | "longtext" | "date" | "list";
  /** "ai" fields may be pre-filled by the assistant; "manual" fields are officer-only. */
  fill: "ai" | "manual";
  help: string;
}

export const DEFAULT_TEMPLATE_FIELDS: TemplateField[] = [
  { key: "informant", label: "Informant / complainant (as stated)", required: true, kind: "text", fill: "ai", help: "Name and relationship as given by the speaker. Contact details are held in the party record." },
  { key: "incident_datetime", label: "Date and time of occurrence", required: true, kind: "text", fill: "ai", help: "Use exactly what the speaker said; mark approximate times as such." },
  { key: "incident_place", label: "Place of occurrence", required: true, kind: "text", fill: "ai", help: "Location as described by the speaker." },
  { key: "incident_type", label: "Nature of incident (as described)", required: true, kind: "text", fill: "ai", help: "A neutral description — not a legal classification." },
  { key: "account_summary", label: "Summary of the account", required: true, kind: "longtext", fill: "ai", help: "Neutral summary of only what was said. Generated text must be reviewed against the source." },
  { key: "chronology", label: "Chronology of events", required: false, kind: "list", fill: "ai", help: "Events in the order described, each traceable to the statement." },
  { key: "verbatim_extracts", label: "Verbatim extracts", required: false, kind: "list", fill: "ai", help: "Direct quotations from the statement, unaltered." },
  { key: "persons_described", label: "Persons described or named", required: false, kind: "list", fill: "ai", help: "As described by the speaker. Do not infer identity or involvement." },
  { key: "property_details", label: "Property involved", required: false, kind: "list", fill: "ai", help: "Items, values and identifiers as stated." },
  { key: "witnesses", label: "Witnesses mentioned", required: false, kind: "list", fill: "ai", help: "People the speaker says saw or know about the events." },
  { key: "delay_reason", label: "Reason for delay in reporting (if any)", required: false, kind: "longtext", fill: "ai", help: "Only if the speaker addressed it." },
  { key: "legal_provisions", label: "Legal provisions", required: false, kind: "longtext", fill: "manual", help: "To be determined by an authorized officer. No AI suggestion: no approved, maintained legal source is configured." },
  { key: "officer_remarks", label: "Recording officer remarks", required: false, kind: "longtext", fill: "manual", help: "Officer's own notes about the recording of this statement." },
];

const STATIONS = [
  { code: "CNT", name: "Central Police Station", district: "Sample District North", state: "Sample State", address: "1 Fictional Avenue, Sampleganj", phone: "000-000-0001" },
  { code: "RVR", name: "Riverside Police Station", district: "Sample District South", state: "Sample State", address: "22 Example Road, Sampleganj", phone: "000-000-0002" },
];

const USERS: { email: string; name: string; role: RoleKey; station: number | null; badge: string | null }[] = [
  { email: "admin@central.example", name: "Asha Verma", role: "station_admin", station: 0, badge: "D-1001" },
  { email: "officer.rao@central.example", name: "Vikram Rao", role: "officer", station: 0, badge: "D-2041" },
  { email: "officer.khan@central.example", name: "Sana Khan", role: "officer", station: 0, badge: "D-2077" },
  { email: "clerk@central.example", name: "Ravi Menon", role: "records_clerk", station: 0, badge: "D-3010" },
  { email: "reviewer@central.example", name: "Meera Iyer", role: "reviewer", station: 0, badge: null },
  { email: "sysadmin@firstrecord.example", name: "Dev Sharma", role: "system_admin", station: null, badge: null },
  { email: "officer.das@riverside.example", name: "Arjun Das", role: "officer", station: 1, badge: "R-2102" },
  { email: "admin@riverside.example", name: "Kavita Nair", role: "station_admin", station: 1, badge: "R-1001" },
];

export interface BaseSeedResult {
  stationIds: string[];
  roleIds: Record<RoleKey, string>;
  users: Record<string, string>; // email -> id
  templateId: string;
}

export function seedBase(opts: { demoUsers: boolean }): BaseSeedResult {
  const t = now();
  const stationIds = STATIONS.map((s) => {
    const id = newId();
    insert("stations", { id, ...s, case_number_format: "{STATION}/{YYYY}/{SEQ:5}", sequence_reset: "yearly", created_at: t, updated_at: t });
    return id;
  });

  const roleIds = {} as Record<RoleKey, string>;
  for (const [key, r] of Object.entries(DEFAULT_ROLES) as [RoleKey, (typeof DEFAULT_ROLES)[RoleKey]][]) {
    const id = newId();
    roleIds[key] = id;
    insert("roles", { id, key, name: r.name, description: r.description, permissions: JSON.stringify(r.permissions), is_system: 1, created_at: t, updated_at: t });
  }

  const users: Record<string, string> = {};
  if (opts.demoUsers) {
    const hash = hashPassword(DEMO_PASSWORD);
    for (const u of USERS) {
      const id = newId();
      users[u.email] = id;
      insert("users", {
        id,
        email: u.email,
        name: u.name,
        badge_number: u.badge,
        password_hash: hash,
        role_id: roleIds[u.role],
        station_id: u.station === null ? null : stationIds[u.station],
        status: "active",
        preferred_language: "en",
        notification_prefs: "{}",
        is_demo: 1,
        created_at: t,
        updated_at: t,
      });
    }
  }

  for (const wf of [DEFAULT_CASE_WORKFLOW, DEFAULT_TASK_WORKFLOW]) {
    insert("workflow_definitions", { id: newId(), kind: wf.kind, name: wf.name, states: JSON.stringify(wf.states), transitions: JSON.stringify(wf.transitions), is_active: 1, created_at: t, updated_at: t });
  }

  const templateId = newId();
  insert("templates", {
    id: templateId,
    name: "Generic FIR draft — configure for your jurisdiction",
    jurisdiction: "Unconfigured (generic)",
    version: 1,
    description:
      "A neutral starting template. It is NOT an official FIR format. An authorized administrator must align fields with the applicable jurisdiction's requirements before use.",
    fields: JSON.stringify(DEFAULT_TEMPLATE_FIELDS),
    is_active: 1,
    created_at: t,
    updated_at: t,
  });

  const retention: [string, number, "flag_for_review" | "delete", string][] = [
    ["recording", 365 * 3, "flag_for_review", "Audio/video recordings of statements. Flagged for review; deletion requires an authorized user."],
    ["attachment", 365 * 3, "flag_for_review", "Uploaded attachments."],
    ["closed_case", 365 * 7, "flag_for_review", "Closed cases and linked records."],
    ["notification", 90, "delete", "In-app notifications (contain no statement content)."],
    ["session", 30, "delete", "Expired/revoked session records."],
  ];
  for (const [record_type, days, action, description] of retention) {
    insert("retention_policies", { id: newId(), record_type, retention_days: days, action, description, updated_at: t });
  }

  return { stationIds, roleIds, users, templateId };
}

/** Delete all data (demo reset). Audit purge is temporarily unlocked for this operation only. */
export function wipeAll() {
  const tables = [
    "provision_suggestions", "online_complaints", "bulletin_reads", "bulletins", "sos_recipients", "sos_alerts",
    "user_locations", "push_subscriptions",
    "ai_request_metadata", "record_access_events", "notifications", "attachments", "task_activity", "task_comments", "tasks",
    "review_comments", "reviews", "draft_versions", "drafts", "case_notes", "case_links", "case_status_history",
    "case_assignments", "case_parties", "transcript_versions", "recordings", "consent_events",
  ];
  run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('internal.audit_purge_unlocked', '\"1\"', ?)", now());
  try {
    run("DROP TRIGGER IF EXISTS consent_events_no_update");
    for (const tbl of tables) run(`DELETE FROM ${tbl}`);
    run("UPDATE statements SET case_id = NULL");
    run("DELETE FROM cases");
    run("DELETE FROM statements");
    run("DELETE FROM audit_events");
    for (const tbl of ["sessions", "legal_provisions", "users", "roles", "templates", "workflow_definitions", "retention_policies", "case_sequences", "stations", "settings"]) {
      run(`DELETE FROM ${tbl}`);
    }
  } finally {
    run("DELETE FROM settings WHERE key = 'internal.audit_purge_unlocked'");
    run("CREATE TRIGGER IF NOT EXISTS consent_events_no_update BEFORE UPDATE ON consent_events BEGIN SELECT RAISE(ABORT, 'consent_events is append-only'); END;");
  }
}

export function isSeeded() {
  return !!get("SELECT 1 FROM roles LIMIT 1");
}
