/**
 * Permission catalog. Roles are stored in the database with a configurable list
 * of these keys; anything not explicitly granted is denied.
 */
export const PERMISSIONS = {
  // Cases — visibility scope (record-level access)
  "case.view.assigned": "View cases assigned to me",
  "case.view.station": "View all cases in my station",
  "case.view.all": "View cases in all stations",
  "case.create": "Create cases (complete intake)",
  "case.edit": "Edit case details and add notes",
  "case.assign": "Assign or reassign cases",
  "case.status": "Change case workflow status",
  "case.bulk": "Perform bulk actions on cases",
  "case.link": "Link related/duplicate cases",
  "case.official_status": "Record official filing status from an authorized system",

  // Statements & recordings
  "statement.create": "Start report intake and capture statements",
  "statement.view": "View statement content and transcripts",
  "statement.edit": "Correct transcripts and edit in-progress statements",
  "recording.create": "Make audio/video recordings (with consent)",
  "recording.view": "Play or download recordings",
  "party.view_pii": "View contact details of complainants, witnesses and parties",

  // Drafts & review
  "draft.generate": "Generate AI/demo FIR drafts",
  "draft.edit": "Edit FIR drafts",
  "draft.review": "Mark drafts reviewed or request clarification",

  // Tasks
  "task.view": "View tasks on accessible cases and my tasks",
  "task.view.station": "View all tasks in my station",
  "task.manage": "Create, edit, assign and complete tasks",

  // Records
  "record.view": "Browse records (statements, drafts, attachments metadata)",
  "attachment.upload": "Upload attachments",
  "attachment.download": "Download attachments",
  "attachment.delete": "Delete attachments (subject to retention policy)",
  "audit.view": "View audit history",

  // Analytics
  "analytics.view": "View aggregate reports",
  "analytics.export": "Export aggregate reports as CSV",

  // Legal provisions (suggestions only — an officer always decides)
  "legal.suggest": "See suggested legal provisions for a statement",
  "legal.select": "Select or reject suggested legal provisions",
  "legal.manage": "Maintain the legal provisions catalog",

  // Online complaints
  "online.view": "View online complaints submitted by the public",
  "online.verify": "Verify online complaints and convert them into cases",

  // Updates & SOS
  "bulletin.publish": "Publish updates (new rules, circulars, advisories)",
  "sos.raise": "Raise SOS alerts to nearby staff",
  "sos.manage": "Resolve or cancel SOS alerts",

  // Administration
  "user.manage": "Create, edit, suspend users",
  "role.manage": "Edit roles and permissions",
  "settings.station": "Edit station profile and case numbering",
  "settings.workflow": "Edit workflows and FIR templates",
  "settings.retention": "Edit retention policies and run retention review",
  "settings.system": "View technical configuration (AI, storage, integrations)",
  "data.delete": "Delete records under retention policy",
  "demo.reset": "Reset demo data (demo mode only)",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; prefix: string[] }[] = [
  { label: "Cases", prefix: ["case."] },
  { label: "Statements & recordings", prefix: ["statement.", "recording.", "party."] },
  { label: "Drafts & review", prefix: ["draft."] },
  { label: "Tasks", prefix: ["task."] },
  { label: "Records & audit", prefix: ["record.", "attachment.", "audit."] },
  { label: "Analytics", prefix: ["analytics."] },
  { label: "Legal provisions", prefix: ["legal."] },
  { label: "Online complaints", prefix: ["online."] },
  { label: "Updates & SOS", prefix: ["bulletin.", "sos."] },
  { label: "Administration", prefix: ["user.", "role.", "settings.", "data.", "demo."] },
];

export type RoleKey = "station_admin" | "officer" | "records_clerk" | "reviewer" | "system_admin";

/** Default role definitions (seeded; editable by role.manage holders). */
export const DEFAULT_ROLES: Record<
  RoleKey,
  { name: string; description: string; permissions: Permission[] }
> = {
  station_admin: {
    name: "Station Administrator",
    description: "Manages users, settings, retention and all station records.",
    permissions: [
      "legal.suggest", "legal.select", "legal.manage", "online.view", "online.verify", "bulletin.publish", "sos.raise", "sos.manage",
      "case.view.assigned", "case.view.station", "case.create", "case.edit", "case.assign", "case.status", "case.bulk",
      "case.link", "case.official_status",
      "statement.create", "statement.view", "statement.edit", "recording.create", "recording.view",
      "party.view_pii", "draft.generate", "draft.edit", "draft.review",
      "task.view", "task.view.station", "task.manage",
      "record.view", "attachment.upload", "attachment.download", "attachment.delete", "audit.view",
      "analytics.view", "analytics.export",
      "user.manage", "role.manage", "settings.station", "settings.workflow", "settings.retention",
      "data.delete", "demo.reset",
    ],
  },
  officer: {
    name: "Officer",
    description: "Works assigned cases: statements, drafts, reviews and tasks.",
    permissions: [
      "legal.suggest", "legal.select", "online.view", "online.verify",
      "case.view.assigned", "case.create", "case.edit", "case.status", "case.link",
      "statement.create", "statement.view", "statement.edit", "recording.create", "recording.view",
      "party.view_pii", "draft.generate", "draft.edit", "draft.review",
      "task.view", "task.manage",
      "record.view", "attachment.upload", "attachment.download",
      "analytics.view",
    ],
  },
  records_clerk: {
    name: "Records Clerk",
    description: "Captures reports and prepares drafts. Cannot complete reviews.",
    permissions: [
      "legal.suggest", "online.view",
      "case.view.station", "case.create",
      "statement.create", "statement.view", "statement.edit", "recording.create", "recording.view",
      "party.view_pii", "draft.generate", "draft.edit",
      "task.view", "task.manage",
      "record.view", "attachment.upload",
    ],
  },
  reviewer: {
    name: "Read-only Reviewer",
    description: "Inspects permitted cases and audit records without editing.",
    permissions: [
      "online.view",
      "case.view.station", "statement.view", "task.view", "task.view.station", "record.view",
      "audit.view", "analytics.view",
    ],
  },
  system_admin: {
    name: "System Administrator",
    description:
      "Technical configuration and account lifecycle. No access to statement content by default.",
    permissions: ["user.manage", "settings.system", "audit.view", "analytics.view", "legal.manage", "bulletin.publish"],
  },
};

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
