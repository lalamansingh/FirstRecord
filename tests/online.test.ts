/** Online complaints: public validation, throttling, tracking lookup, staff verification and conversion. */
import { describe, it, expect, beforeAll } from "vitest";
import { ZodError } from "zod";
import { get, all } from "@/lib/db";
import {
  submitComplaint,
  trackComplaint,
  listOnlineComplaints,
  getOnlineComplaint,
  setOnlineComplaintStatus,
  convertOnlineComplaint,
  assignOnlineComplaint,
  hashSubmitter,
  newTrackingCode,
  RateLimitedError,
  SUBMISSIONS_PER_HOUR,
  ONLINE_MARKER,
} from "@/lib/domain/online-complaints";
import { seedOnlineComplaints } from "@/lib/seed/online";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { seeded, userByEmail } from "./helpers";

let centralId = "";
const valid = () => ({
  complainantName: "Test Complainant",
  phone: "00000-07999",
  email: "",
  address: "5 Example Road",
  stationId: centralId,
  incidentType: "Theft",
  incidentDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  incidentLocation: "Example Market, Sampleganj",
  description: "My bicycle was taken from outside the Example Market while I was inside buying groceries for about twenty minutes.",
  language: "en",
  consent: true as const,
});

describe("online complaints", () => {
  beforeAll(() => {
    const base = seeded();
    centralId = get<{ station_id: string }>("SELECT station_id FROM users WHERE id = ?", base.users["admin@central.example"])!.station_id;
  });

  it("validates input and requires the declaration", () => {
    expect(() => submitComplaint({ ...valid(), consent: false }, { ip: null })).toThrow(ZodError);
    expect(() => submitComplaint({ ...valid(), phone: "123" }, { ip: null })).toThrow(ZodError);
    expect(() => submitComplaint({ ...valid(), description: "too short" }, { ip: null })).toThrow(ZodError);
    expect(() => submitComplaint({ ...valid(), stationId: "00000000-0000-4000-8000-000000000000" }, { ip: null })).toThrow(ValidationError);
    expect(() => submitComplaint({ ...valid(), description: "x".repeat(8001) }, { ip: null })).toThrow(ZodError);
  });

  it("issues unguessable tracking codes and stores no raw IP", () => {
    const codes = new Set(Array.from({ length: 200 }, () => newTrackingCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^FR-ON-[A-Z2-9]{10}$/);
    const { id } = submitComplaint(valid(), { ip: "203.0.113.7" });
    const row = get<{ submitter_hash: string; status: string }>("SELECT * FROM online_complaints WHERE id = ?", id)!;
    expect(row.status).toBe("submitted");
    expect(row.submitter_hash).toBe(hashSubmitter("203.0.113.7"));
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
    // Staff are notified without complaint content in the title.
    const n = all<{ title: string }>("SELECT title FROM notifications WHERE entity_id = ?", id);
    expect(n.length).toBeGreaterThan(0);
    for (const x of n) expect(x.title).not.toContain("bicycle");
  });

  it("throttles repeated submissions from one address", () => {
    const ip = "198.51.100.23";
    for (let i = 0; i < SUBMISSIONS_PER_HOUR; i++) submitComplaint(valid(), { ip });
    expect(() => submitComplaint(valid(), { ip })).toThrow(RateLimitedError);
  });

  it("tracking lookup needs the matching phone number", () => {
    const { trackingCode } = submitComplaint({ ...valid(), phone: "+91 00000 07888" }, { ip: null });
    expect(trackComplaint(trackingCode, "00000-07888")?.status).toBe("submitted");
    expect(trackComplaint(trackingCode.toLowerCase(), "0000007888")).not.toBeNull();
    expect(trackComplaint(trackingCode, "00000-07887")).toBeNull();
    expect(trackComplaint("FR-ON-NOPE000000", "00000-07888")).toBeNull();
    const pub = trackComplaint(trackingCode, "00000-07888")!;
    expect(Object.keys(pub)).not.toContain("description");
  });

  it("scopes the staff queue to the station", () => {
    const das = userByEmail("officer.das@riverside.example");
    const { id } = submitComplaint(valid(), { ip: null });
    expect(listOnlineComplaints(das).rows.some((r) => r.id === id)).toBe(false);
    expect(() => getOnlineComplaint(das, id)).toThrow(NotFoundError);
    const reviewer = userByEmail("reviewer@central.example");
    expect(() => setOnlineComplaintStatus(reviewer, id, "verified")).toThrow(ForbiddenError);
  });

  it("rejection requires a note for the complainant", () => {
    const rao = userByEmail("officer.rao@central.example");
    const { id, trackingCode } = submitComplaint(valid(), { ip: null });
    expect(() => setOnlineComplaintStatus(rao, id, "rejected", { publicNote: "" })).toThrow(ValidationError);
    setOnlineComplaintStatus(rao, id, "rejected", { publicNote: "Please visit the station with your documents." });
    expect(trackComplaint(trackingCode, "00000-07999")?.publicNote).toContain("visit the station");
  });

  it("converts a verified complaint into a case with a marked statement", () => {
    const rao = userByEmail("officer.rao@central.example");
    const { id, trackingCode } = submitComplaint(valid(), { ip: null });
    expect(() => convertOnlineComplaint(rao, id, { title: "Bicycle theft at market", priority: "medium", assignedTo: rao.id })).toThrow(ConflictError);
    assignOnlineComplaint(rao, id, rao.id);
    setOnlineComplaintStatus(rao, id, "under_verification");
    setOnlineComplaintStatus(rao, id, "verified");
    const r = convertOnlineComplaint(rao, id, { title: "Bicycle theft at market", priority: "medium", assignedTo: rao.id });
    const c = get<{ status: string; case_id: string; statement_id: string }>("SELECT * FROM online_complaints WHERE id = ?", id)!;
    expect(c.status).toBe("converted");
    expect(c.case_id).toBe(r.caseId);
    const cs = get<{ reference: string; official_status: string; assigned_to: string }>("SELECT * FROM cases WHERE id = ?", r.caseId)!;
    expect(cs.official_status).toBe("local");
    expect(cs.assigned_to).toBe(rao.id);
    const tv = get<{ text: string; source: string; uncertainty_note: string }>("SELECT * FROM transcript_versions WHERE statement_id = ?", r.statementId)!;
    expect(tv.source).toBe("typed_original");
    expect(tv.text).toContain(ONLINE_MARKER);
    expect(tv.text).toContain("bicycle was taken");
    expect(tv.uncertainty_note).toContain(ONLINE_MARKER);
    expect(trackComplaint(trackingCode, "00000-07999")?.status).toBe("converted");
    expect(() => convertOnlineComplaint(rao, id, { title: "Again", priority: "low", assignedTo: null })).toThrow(ConflictError);
    expect(get("SELECT 1 FROM audit_events WHERE action = 'online_complaint.converted' AND entity_id = ?", id)).toBeTruthy();
  });

  it("seeds fictional complaints idempotently", () => {
    const first = seedOnlineComplaints();
    expect(first).toBeGreaterThan(0);
    expect(seedOnlineComplaints()).toBe(0);
    expect(trackComplaint("FR-ON-DEMO0001", "00000-07001")).not.toBeNull();
  });
});
