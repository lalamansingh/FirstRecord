/**
 * Versioned schema migrations. Each migration runs once, inside a transaction,
 * and is recorded in `schema_migrations`. Never edit a released migration —
 * add a new one.
 *
 * Conventions:
 *  - ids are TEXT (random UUIDs) unless noted
 *  - timestamps are ISO-8601 UTC strings (TEXT)
 *  - JSON columns are TEXT containing JSON
 */
export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: "0001_initial",
    sql: /* sql */ `
CREATE TABLE stations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  district TEXT,
  state TEXT,
  address TEXT,
  phone TEXT,
  case_number_format TEXT NOT NULL DEFAULT '{STATION}/{YYYY}/{SEQ:5}',
  sequence_reset TEXT NOT NULL DEFAULT 'yearly' CHECK (sequence_reset IN ('yearly','never')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE case_sequences (
  station_id TEXT NOT NULL REFERENCES stations(id),
  period TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, period)
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  badge_number TEXT,
  password_hash TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id),
  station_id TEXT REFERENCES stations(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deactivated')),
  preferred_language TEXT NOT NULL DEFAULT 'en',
  notification_prefs TEXT NOT NULL DEFAULT '{}',
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_users_station ON users(station_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- sha256 hash of the session token
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  user_agent TEXT,
  auth_method TEXT NOT NULL DEFAULT 'password'
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE workflow_definitions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('case','task')),
  name TEXT NOT NULL,
  states TEXT NOT NULL,               -- JSON: [{key,label,category:'open'|'active'|'done',color}]
  transitions TEXT NOT NULL,          -- JSON: {fromKey:[toKey,...]}
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL,               -- JSON: [{key,label,required,kind:'text'|'longtext'|'date'|'list',help}]
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE retention_policies (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL UNIQUE,   -- recording | attachment | closed_case | audit_event | notification | session
  retention_days INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('flag_for_review','delete')),
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE statements (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations(id),
  case_id TEXT REFERENCES cases(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  current_step TEXT NOT NULL DEFAULT 'intake',
  intake_at TEXT NOT NULL,
  incident_type TEXT,
  incident_date TEXT,
  incident_location TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  capture_method TEXT CHECK (capture_method IN ('typed','audio','video','assisted','accessible')),
  accessibility_notes TEXT,
  interpreter_name TEXT,
  speaker_name TEXT,
  speaker_contact TEXT,
  speaker_address TEXT,
  speaker_role TEXT NOT NULL DEFAULT 'complainant',
  transcript_confirmed_at TEXT,
  transcript_confirmed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_statements_station ON statements(station_id, status);
CREATE INDEX idx_statements_case ON statements(case_id);

CREATE TABLE consent_events (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  scope TEXT NOT NULL CHECK (scope IN ('audio','video')),
  decision TEXT NOT NULL CHECK (decision IN ('granted','declined','withdrawn')),
  notice_version TEXT NOT NULL,
  notice_language TEXT NOT NULL,
  notice_text TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_consent_statement ON consent_events(statement_id);

CREATE TABLE recordings (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  consent_event_id TEXT NOT NULL REFERENCES consent_events(id),
  kind TEXT NOT NULL CHECK (kind IN ('audio','video')),
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_ms INTEGER,
  storage_key TEXT,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored','deleted')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id),
  deletion_reason TEXT
);
CREATE INDEX idx_recordings_statement ON recordings(statement_id);

CREATE TABLE transcript_versions (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('typed_original','manual_transcription','automatic_transcription','assisted_entry','correction')),
  text TEXT NOT NULL,
  segments TEXT NOT NULL DEFAULT '[]', -- JSON: [{start,end,text,recordingId,offsetMs}]
  language TEXT NOT NULL,
  note TEXT,
  uncertainty_note TEXT,
  recording_id TEXT REFERENCES recordings(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (statement_id, version)
);

CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  station_id TEXT NOT NULL REFERENCES stations(id),
  title TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  incident_date TEXT,
  incident_location TEXT,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_to TEXT REFERENCES users(id),
  next_action TEXT,
  next_action_due TEXT,
  official_status TEXT NOT NULL DEFAULT 'local' CHECK (official_status IN ('local','submitted','filed')),
  official_reference TEXT,
  official_confirmed_at TEXT,
  official_system TEXT,
  received_at TEXT NOT NULL,
  closed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_cases_station_status ON cases(station_id, status);
CREATE INDEX idx_cases_assigned ON cases(assigned_to);
CREATE INDEX idx_cases_updated ON cases(updated_at);
CREATE INDEX idx_cases_received ON cases(received_at);

CREATE TABLE case_parties (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  party_role TEXT NOT NULL CHECK (party_role IN ('complainant','witness','involved','other')),
  name TEXT NOT NULL,
  age TEXT,
  gender TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  statement_id TEXT REFERENCES statements(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_parties_case ON case_parties(case_id);

CREATE TABLE case_assignments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  assignment_role TEXT NOT NULL DEFAULT 'lead' CHECK (assignment_role IN ('lead','support')),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX idx_assignments_case ON case_assignments(case_id);
CREATE INDEX idx_assignments_user ON case_assignments(user_id, ended_at);

CREATE TABLE case_status_history (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_status_history_case ON case_status_history(case_id);

CREATE TABLE case_links (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  linked_case_id TEXT NOT NULL REFERENCES cases(id),
  link_type TEXT NOT NULL CHECK (link_type IN ('related','possible_duplicate')),
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (case_id, linked_case_id)
);

CREATE TABLE case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notes_case ON case_notes(case_id);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  case_id TEXT REFERENCES cases(id),
  template_id TEXT NOT NULL REFERENCES templates(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','clarification_requested','reviewed')),
  current_version INTEGER NOT NULL DEFAULT 1,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  reviewed_version INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_drafts_statement ON drafts(statement_id);
CREATE INDEX idx_drafts_case ON drafts(case_id);

CREATE TABLE draft_versions (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  version INTEGER NOT NULL,
  fields TEXT NOT NULL,               -- JSON: Record<fieldKey, DraftField>
  questions TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL CHECK (origin IN ('ai','demo','human')),
  provider TEXT,
  model TEXT,
  based_on_transcript_version INTEGER,
  change_summary TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (draft_id, version)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  draft_version INTEGER NOT NULL,
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('clarification_requested','reviewed')),
  comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_reviews_draft ON reviews(draft_id);

CREATE TABLE review_comments (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  draft_version INTEGER NOT NULL,
  field_key TEXT,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_review_comments_draft ON review_comments(draft_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations(id),
  case_id TEXT REFERENCES cases(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL DEFAULT 'follow_up',
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_id TEXT REFERENCES users(id),
  due_at TEXT,
  remind_at TEXT,
  reminder_sent_at TEXT,
  completed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX idx_tasks_case ON tasks(case_id);
CREATE INDEX idx_tasks_due ON tasks(due_at);

CREATE TABLE task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);

CREATE TABLE task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_task_activity_task ON task_activity(task_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,                -- must never contain statement content
  link TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id),
  statement_id TEXT REFERENCES statements(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT,
  description TEXT,
  scan_status TEXT NOT NULL DEFAULT 'not_scanned' CHECK (scan_status IN ('not_scanned','clean','infected')),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id),
  deletion_reason TEXT
);
CREATE INDEX idx_attachments_case ON attachments(case_id);

CREATE TABLE record_access_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  case_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('view','download','export','play')),
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_access_entity ON record_access_events(entity_type, entity_id);
CREATE INDEX idx_access_case ON record_access_events(case_id);

CREATE TABLE audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  case_id TEXT,
  summary TEXT NOT NULL,              -- human readable, never contains statement content
  metadata TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_case ON audit_events(case_id);
CREATE INDEX idx_audit_actor ON audit_events(actor_id);
CREATE INDEX idx_audit_action ON audit_events(action);
CREATE INDEX idx_audit_created ON audit_events(created_at);

-- Application-level append-only protection. This blocks UPDATE/DELETE through
-- the application; it is NOT a tamper-proof or certified evidence mechanism
-- (anyone with direct file access can bypass it).
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
WHEN (SELECT value FROM settings WHERE key = 'internal.audit_purge_unlocked') IS NOT '"1"'
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER consent_events_no_update BEFORE UPDATE ON consent_events
BEGIN SELECT RAISE(ABORT, 'consent_events is append-only'); END;
CREATE TRIGGER transcript_versions_no_update BEFORE UPDATE ON transcript_versions
BEGIN SELECT RAISE(ABORT, 'transcript_versions are immutable; add a new version'); END;
CREATE TRIGGER draft_versions_no_update BEFORE UPDATE ON draft_versions
BEGIN SELECT RAISE(ABORT, 'draft_versions are immutable; add a new version'); END;

CREATE TABLE ai_request_metadata (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('demo','live')),
  statement_id TEXT,
  draft_id TEXT,
  input_chars INTEGER NOT NULL DEFAULT 0,
  output_chars INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success','error','abstained')),
  error TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);
`,
  },
  {
    id: "0002_legal_online_bulletins_sos",
    sql: /* sql */ `
-- Reference catalog of legal provisions (admin-maintained). Suggestions are only
-- ever drawn from this catalog and must be selected by an authorized officer.
CREATE TABLE legal_provisions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- e.g. "BNS 303(2)"
  act TEXT NOT NULL,                  -- e.g. "Bharatiya Nyaya Sanhita, 2023"
  section TEXT NOT NULL,              -- e.g. "303(2)"
  title TEXT NOT NULL,                -- short heading, e.g. "Theft"
  summary TEXT NOT NULL,              -- plain-language summary (not the statutory text)
  keywords TEXT NOT NULL DEFAULT '[]',-- JSON: trigger phrases (en/hi) for rule-based matching
  category TEXT NOT NULL DEFAULT 'general',
  is_active INTEGER NOT NULL DEFAULT 1,
  source_note TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Suggested / officer-selected provisions for a statement (and its case).
CREATE TABLE provision_suggestions (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES statements(id),
  case_id TEXT REFERENCES cases(id),
  provision_id TEXT NOT NULL REFERENCES legal_provisions(id),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','selected','rejected')),
  origin TEXT NOT NULL CHECK (origin IN ('rule','ai','officer')),
  reasons TEXT NOT NULL DEFAULT '[]', -- JSON: [{quote, keyword}] verbatim source facts that triggered it
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (statement_id, provision_id)
);
CREATE INDEX idx_prov_sugg_case ON provision_suggestions(case_id);

-- Complaints submitted online by the public, verified by staff before becoming cases.
CREATE TABLE online_complaints (
  id TEXT PRIMARY KEY,
  tracking_code TEXT NOT NULL UNIQUE,
  station_id TEXT REFERENCES stations(id),
  complainant_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  incident_type TEXT,
  incident_date TEXT,
  incident_location TEXT,
  description TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_verification','verified','rejected','duplicate','converted')),
  public_note TEXT,                   -- status message visible to the complainant
  verification_notes TEXT,            -- internal
  assigned_to TEXT REFERENCES users(id),
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  statement_id TEXT REFERENCES statements(id),
  case_id TEXT REFERENCES cases(id),
  submitter_hash TEXT,                -- salted hash of IP for abuse throttling (no raw IP stored)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_online_status ON online_complaints(station_id, status);

-- Updates: new rules, circulars, advisories, system updates.
CREATE TABLE bulletins (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('new_rule','circular','advisory','system_update')),
  station_id TEXT REFERENCES stations(id), -- NULL = all stations
  effective_date TEXT,
  reference TEXT,                     -- e.g. gazette / circular number or URL
  is_pinned INTEGER NOT NULL DEFAULT 0,
  requires_ack INTEGER NOT NULL DEFAULT 0,
  published_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_bulletins_created ON bulletins(created_at);
CREATE TABLE bulletin_reads (
  bulletin_id TEXT NOT NULL REFERENCES bulletins(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  read_at TEXT NOT NULL,
  acknowledged_at TEXT,
  PRIMARY KEY (bulletin_id, user_id)
);

-- SOS alerts and their recipients.
CREATE TABLE sos_alerts (
  id TEXT PRIMARY KEY,
  station_id TEXT REFERENCES stations(id),
  raised_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('critical','high')),
  lat REAL,
  lng REAL,
  radius_km REAL NOT NULL DEFAULT 5,
  location_text TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved','cancelled')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id),
  resolution_note TEXT
);
CREATE INDEX idx_sos_status ON sos_alerts(status, created_at);
CREATE TABLE sos_recipients (
  alert_id TEXT NOT NULL REFERENCES sos_alerts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  distance_km REAL,                   -- NULL when location unknown (station-wide delivery)
  delivered_at TEXT,
  response TEXT CHECK (response IN ('acknowledged','en_route','unavailable')),
  responded_at TEXT,
  PRIMARY KEY (alert_id, user_id)
);

-- Voluntary on-duty location sharing (used only to target SOS alerts).
CREATE TABLE user_locations (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  sharing_enabled INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  accuracy_m REAL,
  updated_at TEXT NOT NULL
);

-- Web Push subscriptions (optional; used when VAPID keys are configured).
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);

-- Grant the new permissions to the built-in roles in existing databases.
UPDATE roles SET permissions = (SELECT json_group_array(value) FROM (SELECT value FROM json_each(roles.permissions) UNION SELECT value FROM json_each('["legal.suggest","legal.select","legal.manage","online.view","online.verify","bulletin.publish","sos.raise","sos.manage"]'))) WHERE key = 'station_admin';
UPDATE roles SET permissions = (SELECT json_group_array(value) FROM (SELECT value FROM json_each(roles.permissions) UNION SELECT value FROM json_each('["legal.suggest","legal.select","online.view","online.verify"]'))) WHERE key = 'officer';
UPDATE roles SET permissions = (SELECT json_group_array(value) FROM (SELECT value FROM json_each(roles.permissions) UNION SELECT value FROM json_each('["legal.suggest","online.view"]'))) WHERE key = 'records_clerk';
UPDATE roles SET permissions = (SELECT json_group_array(value) FROM (SELECT value FROM json_each(roles.permissions) UNION SELECT value FROM json_each('["online.view"]'))) WHERE key = 'reviewer';
UPDATE roles SET permissions = (SELECT json_group_array(value) FROM (SELECT value FROM json_each(roles.permissions) UNION SELECT value FROM json_each('["legal.manage","bulletin.publish"]'))) WHERE key = 'system_admin';
`,
  },
];
