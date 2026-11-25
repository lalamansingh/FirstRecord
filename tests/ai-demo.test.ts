import { describe, it, expect } from "vitest";
import { demoProvider } from "@/lib/ai/demo";
import { locateQuote, verifySources } from "@/lib/ai/sources";
import { DEFAULT_TEMPLATE_FIELDS } from "@/lib/seed/base";
import type { DraftInput } from "@/lib/ai/types";

const TRANSCRIPT =
  "My name is Test Example. On Monday at around 8 in the evening I parked my bicycle outside the Sample Library on Example Road. " +
  "When I came back at 9 it was gone. It is a green bicycle with a basket. A guard said he saw a man in a grey jacket near it.";

function input(transcript: string, intake: Partial<DraftInput["intake"]> = {}): DraftInput {
  return {
    transcript,
    transcriptVersion: 1,
    language: "en",
    template: DEFAULT_TEMPLATE_FIELDS,
    intake: { speakerName: null, incidentType: null, incidentDate: null, incidentLocation: null, ...intake },
  };
}

describe("demo AI provider", () => {
  it("is labelled as demo and makes no live calls", () => {
    expect(demoProvider.info.mode).toBe("demo");
    expect(demoProvider.info.name).toBe("demo");
  });

  it("never emits a transcript quote that is absent from the transcript", async () => {
    const out = await demoProvider.generateDraft(input(TRANSCRIPT, { speakerName: "Test Example" }));
    let quotes = 0;
    for (const f of Object.values(out.fields)) {
      for (const s of f.sources) {
        if (s.kind !== "transcript") continue;
        quotes++;
        expect(TRANSCRIPT).toContain(s.quote);
        expect(TRANSCRIPT.slice(s.start, s.end)).toBe(s.quote);
        expect(s.transcriptVersion).toBe(1);
      }
    }
    expect(quotes).toBeGreaterThan(0);
  });

  it("covers template fields, marks gaps, and never fills legal provisions", async () => {
    const out = await demoProvider.generateDraft(input("I lost my umbrella."));
    const statuses = new Set(Object.values(out.fields).map((f) => f.status));
    expect(statuses.has("not_provided") || statuses.has("needs_confirmation")).toBe(true);
    const legal = out.fields.legal_provisions;
    expect(legal).toBeTruthy();
    expect(legal.status).toBe("not_provided");
    expect(Array.isArray(legal.value) ? legal.value.length : legal.value.trim().length).toBe(0);
    expect(out.questions.length).toBeGreaterThan(0);
    for (const f of Object.values(out.fields)) expect(["ai", "demo", "human"]).toContain(f.origin);
    expect(Object.values(out.fields).some((f) => f.origin === "ai")).toBe(false); // demo output is never labelled as AI
  });

  it("abstains on an empty transcript", async () => {
    const out = await demoProvider.generateDraft(input("   "));
    expect(out.abstained).toBe(true);
    expect(out.abstainReason).toBeTruthy();
  });

  it("is deterministic", async () => {
    const a = await demoProvider.generateDraft(input(TRANSCRIPT));
    const b = await demoProvider.generateDraft(input(TRANSCRIPT));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("emits no scoring fields", async () => {
    const out = await demoProvider.generateDraft(input(TRANSCRIPT));
    const json = JSON.stringify(out).toLowerCase();
    for (const w of ["credibility", "guilt", "risk_score", "threat"]) expect(json).not.toContain(w);
  });
});

describe("source verification", () => {
  it("locates exact and whitespace-variant quotes, rejects fabricated ones", () => {
    expect(locateQuote(TRANSCRIPT, "green bicycle with a basket")).not.toBeNull();
    expect(locateQuote(TRANSCRIPT, "green   bicycle\nwith a basket")).not.toBeNull();
    expect(locateQuote(TRANSCRIPT, "red car with a dent")).toBeNull();
  });
  it("drops sources that are no longer in the transcript", () => {
    const kept = verifySources(
      TRANSCRIPT,
      [
        { kind: "transcript", quote: "it was gone", start: 0, end: 0, transcriptVersion: 1 },
        { kind: "transcript", quote: "he confessed", start: 0, end: 0, transcriptVersion: 1 },
        { kind: "intake", field: "incident_type", label: "Incident type" },
      ],
      2,
    );
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ kind: "transcript", quote: "it was gone", transcriptVersion: 2 });
  });
});
