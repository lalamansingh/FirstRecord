/** Legal provision suggestions: matcher behaviour, officer-only selection, draft integration. */
import { describe, it, expect, beforeAll } from "vitest";
import { all, get } from "@/lib/db";
import { matchProvisions, splitSentences, generateSuggestions, listSuggestions, decideSuggestion, addOfficerProvision, applySelectedToDraft, listProvisions } from "@/lib/domain/legal";
import { seedLegalCatalog, STARTER_CATALOG } from "@/lib/seed/legal";
import { createStatement, addTranscriptVersion, confirmTranscript } from "@/lib/domain/statements";
import { generateDraft, getDraftRow, getVersion } from "@/lib/domain/drafts";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { seeded, userByEmail } from "./helpers";

describe("matchProvisions (pure)", () => {
  const catalog = [
    { id: "theft", keywords: ["stolen", "चोरी", "चुरा"] },
    { id: "cyber", keywords: ["link", "upi"] },
    { id: "threat", keywords: ["threatened"] },
  ];

  it("splits English and Hindi sentences", () => {
    expect(splitSentences("One. Two! तीन। चार")).toEqual(["One.", "Two!", "तीन।", "चार"]);
  });

  it("quotes the exact sentence that matched, with the phrase", () => {
    const r = matchProvisions("I went to the market. My phone was stolen near the bus stop. I came home.", catalog);
    expect(r).toEqual([{ provisionId: "theft", reasons: [{ quote: "My phone was stolen near the bus stop.", keyword: "stolen" }] }]);
  });

  it("matches Latin phrases as whole words only", () => {
    expect(matchProvisions("The accounts were linked last year.", catalog)).toEqual([]);
    expect(matchProvisions("He sent me a link on WhatsApp.", catalog).map((m) => m.provisionId)).toEqual(["cyber"]);
    expect(matchProvisions("I paid by UPI.", catalog).map((m) => m.provisionId)).toEqual(["cyber"]);
  });

  it("matches Hindi stems inside words", () => {
    const r = matchProvisions("कल रात मेरा फोन किसी ने चुराया। फिर मैं घर गया।", catalog);
    expect(r[0].provisionId).toBe("theft");
    expect(r[0].reasons[0].quote).toBe("कल रात मेरा फोन किसी ने चुराया।");
  });

  it("returns nothing for empty text and has no scores", () => {
    expect(matchProvisions("   ", catalog)).toEqual([]);
    const r = matchProvisions("He threatened me. Then he threatened my brother.", catalog);
    expect(Object.keys(r[0]).sort()).toEqual(["provisionId", "reasons"]);
    expect(r[0].reasons).toHaveLength(2);
  });

  it("caps quotes per provision", () => {
    const text = Array.from({ length: 6 }, (_, i) => `Item ${i} was stolen.`).join(" ");
    expect(matchProvisions(text, catalog)[0].reasons).toHaveLength(3);
  });

  it("every starter entry has bilingual keywords and a verification note", () => {
    expect(STARTER_CATALOG.length).toBeGreaterThanOrEqual(30);
    expect(new Set(STARTER_CATALOG.map((e) => e.code)).size).toBe(STARTER_CATALOG.length);
    for (const e of STARTER_CATALOG) {
      expect(e.keywords.length).toBeGreaterThan(0);
      expect(e.keywords.some((k) => /[ऀ-ॿ]/.test(k))).toBe(true);
    }
  });

  it("suggests the IT Act for phone-call impersonation fraud, not only cheating", () => {
    const catalog = STARTER_CATALOG.map((e) => ({ id: e.code, keywords: e.keywords }));
    const ids = matchProvisions(
      "Money lost after call claiming to be from a bank. The caller said my KYC was pending and asked for the OTP.",
      catalog,
    ).map((m) => m.provisionId);
    expect(ids).toContain("IT Act 66D");
    expect(ids).toContain("IT Act 66C");
    expect(ids).toContain("BNS 319(2)");
    const hiIds = matchProvisions("एक व्यक्ति ने बैंक अधिकारी बनकर फोन किया और ओटीपी पूछकर पैसे निकाल लिए।", catalog).map((m) => m.provisionId);
    expect(hiIds).toContain("IT Act 66D");
  });
});

describe("suggestions workflow", () => {
  let statementId = "";
  beforeAll(async () => {
    seeded();
    seedLegalCatalog();
    const clerk = userByEmail("clerk@central.example");
    statementId = createStatement(clerk, {
      intakeAt: new Date(Date.now() - 3600000).toISOString(),
      incidentType: "Theft",
      incidentDate: new Date(Date.now() - 86400000).toISOString(),
      incidentLocation: "Example Road, Sampleganj",
      language: "en",
      speakerName: "Test Example",
      speakerContact: "00000-09002",
      speakerAddress: "1 Example Road",
      speakerRole: "complainant",
    });
    addTranscriptVersion(clerk, statementId, {
      text: "My name is Test Example. Last night two men stopped me on Example Road. One of them threatened me with a knife and they snatched my phone. Then they ran away.",
      source: "typed_original", note: null, uncertaintyNote: null, recordingId: null,
    });
    confirmTranscript(clerk, statementId);
    await generateDraft(clerk, statementId);
  });

  it("seeding the catalogue is idempotent", () => {
    const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM legal_provisions")!.n;
    const r = seedLegalCatalog();
    expect(r.inserted).toBe(0);
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM legal_provisions")!.n).toBe(n);
  });

  it("generates rule suggestions with verbatim quotes, all undecided", () => {
    const admin = userByEmail("admin@central.example");
    const { added } = generateSuggestions(admin, statementId);
    expect(added).toBeGreaterThan(0);
    const s = listSuggestions(admin, statementId);
    const codes = s.map((x) => x.code);
    expect(codes).toContain("BNS 304(2)");
    expect(codes).toContain("BNS 351(2)");
    for (const x of s) {
      expect(x.status).toBe("suggested");
      expect(x.origin).toBe("rule");
      for (const r of x.reasons) expect(r.quote.length).toBeGreaterThan(0);
    }
    // Running again adds nothing new.
    expect(generateSuggestions(admin, statementId).added).toBe(0);
  });

  it("only legal.select holders can decide; reviewers cannot even view", () => {
    const clerk = userByEmail("clerk@central.example");
    const reviewer = userByEmail("reviewer@central.example");
    const admin = userByEmail("admin@central.example");
    const sg = listSuggestions(admin, statementId)[0];
    expect(() => decideSuggestion(clerk, sg.id, "selected")).toThrow(ForbiddenError);
    expect(() => listSuggestions(reviewer, statementId)).toThrow(ForbiddenError);
    const other = userByEmail("officer.das@riverside.example");
    expect(() => decideSuggestion(other, sg.id, "selected")).toThrow(NotFoundError);
  });

  it("officer decisions are audited and only selected provisions reach the draft", async () => {
    const admin = userByEmail("admin@central.example");
    const s = listSuggestions(admin, statementId);
    const snatch = s.find((x) => x.code === "BNS 304(2)")!;
    const threat = s.find((x) => x.code === "BNS 351(2)")!;
    decideSuggestion(admin, snatch.id, "selected");
    decideSuggestion(admin, threat.id, "rejected");
    const extra = listProvisions({ activeOnly: true }).find((p) => p.code === "BNS 309(4)")!;
    addOfficerProvision(admin, statementId, extra.id);

    const events = all<{ action: string }>("SELECT action FROM audit_events WHERE entity_id = ? AND action LIKE 'legal.%'", statementId).map((e) => e.action);
    expect(events).toEqual(expect.arrayContaining(["legal.suggestions_generated", "legal.provision_selected", "legal.provision_rejected", "legal.provision_added"]));

    const version = applySelectedToDraft(admin, statementId);
    expect(version).not.toBeNull();
    const draft = all<{ id: string }>("SELECT id FROM drafts WHERE statement_id = ?", statementId)[0];
    const v = getVersion(draft.id, getDraftRow(draft.id)!.current_version)!;
    const text = v.fields.legal_provisions.value as string;
    expect(text).toContain("BNS 304(2)");
    expect(text).toContain("BNS 309(4)");
    expect(text).not.toContain("BNS 351(2)");

    // Regenerating the draft keeps exactly the officer-selected provisions.
    const clerk = userByEmail("clerk@central.example");
    const r = await generateDraft(clerk, statementId);
    const v2 = getVersion(r.draftId, r.version)!;
    expect(v2.fields.legal_provisions.origin).toBe("human");
    expect(v2.fields.legal_provisions.value).toBe(text);
  });
});
