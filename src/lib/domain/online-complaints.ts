/**
 * Online complaints: submitted by the public without signing in, then verified by
 * station staff before any case exists. A submission is NOT a registered FIR —
 * nothing here files with an official system. Staff decide every outcome.
 *
 * Privacy: no raw IP address is stored (only a salted hash used for throttling);
 * notification titles and audit summaries never contain complaint content.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { all, get, insert, newId, now, tx, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";
import { assertCan, can, canViewCase, type AuthUser } from "@/lib/rbac/access";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { LANGUAGES } from "@/lib/domain/workflow";
import { notify, type NotificationKind } from "@/lib/domain/notifications";
import { addTranscriptVersion, createStatement, setCaptureMethod } from "@/lib/domain/statements";
import { assignableUsers, createCaseFromStatement } from "@/lib/domain/case-create";

export const ONLINE_STATUSES = ["submitted", "under_verification", "verified", "rejected", "duplicate", "converted"] as const;
export type OnlineStatus = (typeof ONLINE_STATUSES)[number];

/** English labels (also the i18n keys in messages-online.ts). */
export const ONLINE_STATUS_LABELS: Record<OnlineStatus, string> = {
  submitted: "Submitted",
  under_verification: "Under verification",
  verified: "Verified",
  rejected: "Not accepted",
  duplicate: "Duplicate",
  converted: "Case opened",
};

/** Default message shown to the complainant for each status when staff leave none. */
export const DEFAULT_PUBLIC_NOTES: Record<OnlineStatus, string> = {
  submitted: "Your complaint has been received. Police staff will verify it and contact you.",
  under_verification: "Police staff are verifying your complaint. You may be contacted for details.",
  verified: "Your complaint has been verified. Staff will contact you about next steps.",
  rejected: "Your complaint could not be accepted online. Please see the note from the station.",
  duplicate: "Your complaint matches a matter the station is already handling.",
  converted: "The station has opened a case for your complaint. Staff will contact you.",
};

/** Allowed manual status changes (conversion to a case is a separate action). */
const TRANSITIONS: Record<OnlineStatus, OnlineStatus[]> = {
  submitted: ["under_verification", "verified", "rejected", "duplicate"],
  under_verification: ["verified", "rejected", "duplicate"],
  verified: ["under_verification", "rejected", "duplicate"],
  rejected: ["under_verification"],
  duplicate: ["under_verification"],
  converted: [],
};

export function allowedTransitions(status: OnlineStatus): OnlineStatus[] {
  return TRANSITIONS[status] ?? [];
}

export const ONLINE_MARKER = "Submitted online by complainant — not yet confirmed in person";

/** Hourly submission cap per (hashed) source address. */
export const SUBMISSIONS_PER_HOUR = 5;

/* ---------------- Public submission ---------------- */

const digits = (s: string) => s.replace(/\D/g, "");

/** Messages are English i18n keys (translated by the caller). */
export const complaintSchema = z.object({
  complainantName: z.string().trim().min(2, "Enter your full name").max(120, "Name is too long"),
  phone: z
    .string()
    .trim()
    .max(20, "Enter a valid phone number")
    .refine((v) => digits(v).length >= 10 && digits(v).length <= 13 && /^[+\d\s()-]+$/.test(v), "Enter a valid phone number"),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email address"),
  address: z
    .string()
    .trim()
    .max(500, "Address is too long")
    .optional()
    .transform((v) => (v ? v : null)),
  stationId: z.string().uuid("Choose a police station"),
  incidentType: z.string().trim().min(1, "Choose the type of incident").max(60),
  incidentDate: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Enter a valid date")
    .refine((v) => v === null || Date.parse(v) <= Date.now() + 86_400_000, "The date cannot be in the future"),
  incidentLocation: z.string().trim().min(3, "Enter where it happened").max(300, "Location is too long"),
  description: z
    .string()
    .trim()
    .min(30, "Describe what happened (at least 30 characters)")
    .max(8000, "Description is too long (8,000 characters max)"),
  language: z.string().max(10).default("en"),
  consent: z.literal(true, { message: "Please confirm the declaration to submit" }),
});
export type ComplaintInput = z.input<typeof complaintSchema>;

/** Salted hash of the submitter's address. The raw address is never stored. */
export function hashSubmitter(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`online-complaint:${config.sessionSecret}:${ip}`).digest("hex");
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
export function newTrackingCode(): string {
  const bytes = randomBytes(10);
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `FR-ON-${s}`;
}

export function normalizeTrackingCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export class RateLimitedError extends ValidationError {
  constructor() {
    super("Too many complaints have been submitted from this connection. Please try again later.");
    this.name = "RateLimitedError";
  }
}

function staffToNotify(stationId: string) {
  return all<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.station_id = ? AND u.status = 'active' AND r.permissions LIKE '%"online.view"%'`,
    stationId,
  );
}

const NOTIFY_KIND = "online_complaint" as NotificationKind;

/** Accept a public submission. Throws ZodError / ValidationError / RateLimitedError. */
export function submitComplaint(raw: unknown, meta: { ip: string | null }): { trackingCode: string; id: string } {
  const input = complaintSchema.parse(raw);
  const station = get<{ id: string; code: string }>("SELECT id, code FROM stations WHERE id = ?", input.stationId);
  if (!station) throw new ValidationError("Choose a police station", { stationId: "Choose a police station" });

  const submitterHash = hashSubmitter(meta.ip);
  if (submitterHash) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM online_complaints WHERE submitter_hash = ? AND created_at > ?", submitterHash, since)?.n ?? 0;
    if (n >= SUBMISSIONS_PER_HOUR) throw new RateLimitedError();
  }

  const id = newId();
  const t = now();
  let trackingCode = newTrackingCode();
  while (get("SELECT 1 FROM online_complaints WHERE tracking_code = ?", trackingCode)) trackingCode = newTrackingCode();

  tx(() => {
    insert("online_complaints", {
      id,
      tracking_code: trackingCode,
      station_id: station.id,
      complainant_name: input.complainantName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      incident_type: input.incidentType,
      incident_date: input.incidentDate ? new Date(input.incidentDate).toISOString() : null,
      incident_location: input.incidentLocation,
      description: input.description.replace(/\r\n/g, "\n"),
      language: input.language in LANGUAGES ? input.language : "en",
      status: "submitted",
      public_note: null,
      submitter_hash: submitterHash,
      created_at: t,
      updated_at: t,
    });
    audit({
      actorId: null,
      action: "online_complaint.submitted",
      entityType: "online_complaint",
      entityId: id,
      summary: `Online complaint ${trackingCode} submitted for station ${station.code}`,
      metadata: { stationId: station.id, incidentType: input.incidentType },
    });
  });

  for (const u of staffToNotify(station.id)) {
    notify({ userId: u.id, kind: NOTIFY_KIND, title: `New online complaint ${trackingCode} awaiting verification`, link: `/online-complaints/${id}`, entityType: "online_complaint", entityId: id });
  }
  return { trackingCode, id };
}

export interface PublicStatus {
  trackingCode: string;
  status: OnlineStatus;
  publicNote: string;
  stationName: string | null;
  submittedAt: string;
  updatedAt: string;
}

/** Public status lookup. Requires the phone number used at submission; returns null on any mismatch. */
export function trackComplaint(code: string, phone: string): PublicStatus | null {
  const c = get<{ tracking_code: string; status: OnlineStatus; public_note: string | null; phone: string; station_name: string | null; created_at: string; updated_at: string }>(
    `SELECT o.tracking_code, o.status, o.public_note, o.phone, s.name AS station_name, o.created_at, o.updated_at
       FROM online_complaints o LEFT JOIN stations s ON s.id = o.station_id WHERE o.tracking_code = ?`,
    normalizeTrackingCode(code),
  );
  const p = digits(phone);
  if (!c || p.length < 10) return null;
  const stored = digits(c.phone);
  // Compare the last 10 digits so "+91 …" and a local number match.
  if (stored.slice(-10) !== p.slice(-10)) return null;
  return {
    trackingCode: c.tracking_code,
    status: c.status,
    publicNote: c.public_note || DEFAULT_PUBLIC_NOTES[c.status],
    stationName: c.station_name,
    submittedAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

/* ---------------- Staff side ---------------- */

export interface OnlineComplaintRow {
  id: string;
  tracking_code: string;
  station_id: string | null;
  complainant_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  incident_type: string | null;
  incident_date: string | null;
  incident_location: string | null;
  description: string;
  language: string;
  status: OnlineStatus;
  public_note: string | null;
  verification_notes: string | null;
  assigned_to: string | null;
  verified_by: string | null;
  verified_at: string | null;
  statement_id: string | null;
  case_id: string | null;
  created_at: string;
  updated_at: string;
  station_name?: string | null;
  station_code?: string | null;
  assignee_name?: string | null;
  verifier_name?: string | null;
  case_reference?: string | null;
}

function scope(user: AuthUser): { sql: string; params: string[] } {
  if (can(user, "case.view.all")) return { sql: "1=1", params: [] };
  if (!user.stationId) return { sql: "0=1", params: [] };
  return { sql: "o.station_id = ?", params: [user.stationId] };
}

export function listOnlineComplaints(user: AuthUser, opts: { status?: string | null; q?: string | null; page?: number; pageSize?: number } = {}) {
  assertCan(user, "online.view");
  const s = scope(user);
  const where = [s.sql];
  const params: (string | number)[] = [...s.params];
  if (opts.status === "open") where.push("o.status IN ('submitted','under_verification','verified')");
  else if (opts.status && (ONLINE_STATUSES as readonly string[]).includes(opts.status)) {
    where.push("o.status = ?");
    params.push(opts.status);
  }
  if (opts.q) {
    where.push("(o.tracking_code LIKE ? OR o.complainant_name LIKE ?)");
    params.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM online_complaints o WHERE ${where.join(" AND ")}`, ...params)?.n ?? 0;
  const rows = all<OnlineComplaintRow>(
    `SELECT o.id, o.tracking_code, o.station_id, o.complainant_name, o.incident_type, o.incident_date, o.incident_location, o.status,
            o.assigned_to, o.case_id, o.created_at, o.updated_at,
            st.name AS station_name, st.code AS station_code, a.name AS assignee_name, c.reference AS case_reference
       FROM online_complaints o
       LEFT JOIN stations st ON st.id = o.station_id
       LEFT JOIN users a ON a.id = o.assigned_to
       LEFT JOIN cases c ON c.id = o.case_id
      WHERE ${where.join(" AND ")}
      ORDER BY CASE o.status WHEN 'submitted' THEN 0 WHEN 'under_verification' THEN 1 WHEN 'verified' THEN 2 ELSE 3 END, o.created_at DESC
      LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );
  return { rows, total, page, pageSize };
}

export function onlineStatusCounts(user: AuthUser): Record<OnlineStatus | "open" | "all", number> {
  assertCan(user, "online.view");
  const s = scope(user);
  const rows = all<{ status: OnlineStatus; n: number }>(`SELECT o.status, COUNT(*) AS n FROM online_complaints o WHERE ${s.sql} GROUP BY o.status`, ...s.params);
  const out = Object.fromEntries([...ONLINE_STATUSES, "open", "all"].map((k) => [k, 0])) as Record<OnlineStatus | "open" | "all", number>;
  for (const r of rows) {
    out[r.status] = r.n;
    out.all += r.n;
    if (r.status === "submitted" || r.status === "under_verification" || r.status === "verified") out.open += r.n;
  }
  return out;
}

/** Load a complaint the user may see (NotFound otherwise, to avoid disclosing existence). */
export function getOnlineComplaint(user: AuthUser, id: string): OnlineComplaintRow {
  assertCan(user, "online.view");
  const s = scope(user);
  const c = get<OnlineComplaintRow>(
    `SELECT o.*, st.name AS station_name, st.code AS station_code, a.name AS assignee_name, v.name AS verifier_name, c.reference AS case_reference
       FROM online_complaints o
       LEFT JOIN stations st ON st.id = o.station_id
       LEFT JOIN users a ON a.id = o.assigned_to
       LEFT JOIN users v ON v.id = o.verified_by
       LEFT JOIN cases c ON c.id = o.case_id
      WHERE o.id = ? AND ${s.sql}`,
    id,
    ...s.params,
  );
  if (!c) throw new NotFoundError();
  return c;
}

function assertOpen(c: OnlineComplaintRow) {
  if (c.status === "converted") throw new ConflictError("A case has already been opened from this complaint.");
}

export function saveVerificationNotes(user: AuthUser, id: string, notes: string) {
  assertCan(user, "online.verify");
  const c = getOnlineComplaint(user, id);
  update("online_complaints", id, { verification_notes: notes.trim().slice(0, 8000) || null, updated_at: now() });
  audit({ actorId: user.id, action: "online_complaint.notes_updated", entityType: "online_complaint", entityId: id, caseId: c.case_id, summary: `Verification notes updated on ${c.tracking_code}` });
}

export function assignOnlineComplaint(user: AuthUser, id: string, assigneeId: string | null) {
  assertCan(user, "online.verify");
  const c = getOnlineComplaint(user, id);
  assertOpen(c);
  if (assigneeId) {
    if (!c.station_id || !assignableUsers(c.station_id).some((u) => u.id === assigneeId)) {
      throw new ValidationError("Choose an officer from this station.", { assigneeId: "Choose an officer from this station" });
    }
  }
  update("online_complaints", id, { assigned_to: assigneeId, updated_at: now() });
  audit({
    actorId: user.id,
    action: "online_complaint.assigned",
    entityType: "online_complaint",
    entityId: id,
    summary: assigneeId ? `Online complaint ${c.tracking_code} assigned for verification` : `Online complaint ${c.tracking_code} unassigned`,
    metadata: { assigneeId },
  });
  if (assigneeId) {
    notify({ userId: assigneeId, kind: NOTIFY_KIND, title: `Online complaint ${c.tracking_code} assigned to you for verification`, link: `/online-complaints/${id}`, entityType: "online_complaint", entityId: id, actorId: user.id });
  }
}

export function setOnlineComplaintStatus(
  user: AuthUser,
  id: string,
  status: Exclude<OnlineStatus, "converted" | "submitted">,
  opts: { publicNote?: string | null; duplicateCaseId?: string | null } = {},
) {
  assertCan(user, "online.verify");
  const c = getOnlineComplaint(user, id);
  assertOpen(c);
  if (!allowedTransitions(c.status).includes(status)) {
    throw new ConflictError(`This complaint cannot move from "${ONLINE_STATUS_LABELS[c.status]}" to "${ONLINE_STATUS_LABELS[status]}".`);
  }
  const publicNote = (opts.publicNote ?? "").trim().slice(0, 1000) || null;
  if (status === "rejected" && (!publicNote || publicNote.length < 10)) {
    throw new ValidationError("Explain to the complainant why the complaint was not accepted.", { publicNote: "Write a short note for the complainant (at least 10 characters)" });
  }
  let caseId: string | null = c.case_id;
  if (status === "duplicate") {
    if (!opts.duplicateCaseId || !canViewCase(user, opts.duplicateCaseId)) {
      throw new ValidationError("Choose the existing case this complaint duplicates.", { duplicateCaseId: "Choose an existing case you can access" });
    }
    caseId = opts.duplicateCaseId;
  } else if (c.status === "duplicate") {
    caseId = null;
  }
  const t = now();
  update("online_complaints", id, {
    status,
    public_note: publicNote,
    case_id: caseId,
    ...(status === "verified" ? { verified_by: user.id, verified_at: t } : {}),
    updated_at: t,
  });
  audit({
    actorId: user.id,
    action: `online_complaint.${status}`,
    entityType: "online_complaint",
    entityId: id,
    caseId: status === "duplicate" ? caseId : null,
    summary: `Online complaint ${c.tracking_code}: ${ONLINE_STATUS_LABELS[c.status]} → ${ONLINE_STATUS_LABELS[status]}`,
    metadata: { from: c.status, to: status, duplicateCaseId: status === "duplicate" ? caseId : null },
  });
}

export interface ConvertInput {
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  assignedTo: string | null;
}

/**
 * Open a local case from a verified complaint: creates a typed statement (marked
 * as submitted online, not yet confirmed in person) and a case through the normal
 * intake/case domain, so every existing rule and audit entry applies.
 */
export function convertOnlineComplaint(user: AuthUser, id: string, input: ConvertInput): { caseId: string; reference: string; statementId: string } {
  assertCan(user, "online.verify");
  assertCan(user, "case.create");
  const c = getOnlineComplaint(user, id);
  assertOpen(c);
  if (c.status !== "verified") throw new ConflictError("Verify the complaint before opening a case.");
  if (!user.stationId || c.station_id !== user.stationId) {
    throw new ForbiddenError("Only staff of the station the complaint was sent to can open a case from it.");
  }

  return tx(() => {
    const statementId = createStatement(user, {
      intakeAt: c.created_at,
      incidentType: c.incident_type,
      incidentDate: c.incident_date,
      incidentLocation: c.incident_location,
      language: c.language in LANGUAGES ? c.language : "en",
      speakerName: c.complainant_name,
      speakerContact: c.phone,
      speakerAddress: c.address,
      speakerRole: "complainant",
    });
    setCaptureMethod(user, statementId, "typed", { accessibilityNotes: null, interpreterName: null });
    addTranscriptVersion(user, statementId, {
      text: `[${ONLINE_MARKER}. Online complaint ${c.tracking_code}.]\n\n${c.description}`,
      source: "typed_original",
      note: `${ONLINE_MARKER} (online complaint ${c.tracking_code}).`,
      uncertaintyNote: `${ONLINE_MARKER}. Read it back to the complainant and record any corrections before relying on it.`,
      recordingId: null,
    });
    const { caseId, reference } = createCaseFromStatement(user, statementId, {
      title: input.title,
      priority: input.priority,
      assignedTo: input.assignedTo,
      incidentType: c.incident_type || "Other",
      summary: `Opened from online complaint ${c.tracking_code}. ${ONLINE_MARKER}.`,
    });
    const t = now();
    update("online_complaints", id, {
      status: "converted",
      case_id: caseId,
      statement_id: statementId,
      public_note: DEFAULT_PUBLIC_NOTES.converted,
      updated_at: t,
    });
    audit({
      actorId: user.id,
      action: "online_complaint.converted",
      entityType: "online_complaint",
      entityId: id,
      caseId,
      summary: `Online complaint ${c.tracking_code} converted into case ${reference}`,
      metadata: { statementId, reference },
    });
    return { caseId, reference, statementId };
  });
}

/** Cases the user can pick as the "duplicate of" target (recent, visible, same station). */
export function duplicateCandidates(user: AuthUser, stationId: string | null) {
  if (!stationId) return [];
  return all<{ id: string; reference: string; title: string }>(
    "SELECT id, reference, title FROM cases WHERE station_id = ? ORDER BY created_at DESC LIMIT 200",
    stationId,
  ).filter((c) => canViewCase(user, c.id));
}
