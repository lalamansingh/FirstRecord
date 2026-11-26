import { describe, expect, it } from "vitest";
import { createDialog, matchIncidentType, parseCaseQuery, parseDate, parseDigits } from "@/components/voice/dialog";
import type { VoiceAction } from "@/components/voice/types";

const NOW = new Date(2026, 10, 26, 10, 0); // 26 Nov 2026
const mk = (name = "Hackathon Judges", path = "/") => createDialog({ userName: name, pathname: () => path }, { now: () => NOW });
/** Session that is already in English (e.g. the user asked for English, or ctx.lang = "en"). */
const mkEn = () => createDialog({ userName: "Hackathon Judges", pathname: () => "/", lang: "en" }, { now: () => NOW });
const types = (a: VoiceAction[]) => a.map((x) => x.type);
const fills = (a: VoiceAction[]) => a.filter((x): x is Extract<VoiceAction, { type: "fill" }> => x.type === "fill").map((x) => [x.field, x.value]);

describe("voice dialog: greeting", () => {
  it("greets judges in Hindi", () => {
    const g = mk().greet();
    expect(g.say).toContain("नमस्ते हैकाथॉन जजेस");
    expect(g.say).toContain("FirstRecord साथी");
    expect(g.expectReply).toBe(true);
  });
  it("uses the user's own name otherwise", () => {
    expect(mk("Asha Verma").greet().say).toContain("नमस्ते Asha Verma");
  });
});

describe("voice dialog: navigation", () => {
  const cases: [string, string][] = [
    ["cases पर जाओ", "/cases"],
    ["केस खोलो", "/cases"],
    ["SOS पर जाओ", "/sos"],
    ["डैशबोर्ड दिखाओ", "/"],
    ["go to updates", "/updates"],
    ["टास्क", "/tasks"],
    ["ऑनलाइन शिकायत दिखाओ", "/online-complaints"],
    ["legal पेज खोलो", "/legal"],
    ["settings", "/settings"],
  ];
  it.each(cases)("%s → %s", (utterance, href) => {
    const d = mk();
    const t = d.handle(utterance);
    expect(t.actions).toContainEqual({ type: "navigate", href });
    expect(t.actions[0]).toEqual({ type: "fly", to: { kind: "nav", href } });
  });
});

describe("voice dialog: open case", () => {
  it.each([
    ["केस नंबर 15 खोलो", "00015"],
    ["केस नंबर पंद्रह खोलो", "00015"],
    ["CNT 2026 00015 खोलो", "00015"],
    ["मुझे case 9 के बारे में बताओ", "00009"],
    ["मोबाइल चोरी वाला case खोलो", "मोबाइल चोरी"],
  ])("%s", (u, q) => {
    const t = mk().handle(u);
    expect(t.actions).toContainEqual({ type: "openCase", query: q });
  });
  it("asks for a number when none is given, then opens", () => {
    const d = mk();
    expect(d.handle("मुझे किसी case के बारे में जानना है").say).toContain("case नंबर");
    expect(d.handle("बाईस").actions).toContainEqual({ type: "openCase", query: "00022" });
  });
  it("reports not found via onActionResult", () => {
    const d = mk();
    const r = d.onActionResult({ action: { type: "openCase", query: "00999" }, ok: false });
    expect(r?.say).toContain("नहीं मिला");
  });
  it("parses references", () => {
    expect(parseCaseQuery("cnt/2026/00007")).toBe("00007");
  });
});

describe("voice dialog: FIR flow", () => {
  it("fills step by step and submits only after confirmation", () => {
    const d = mk();
    const start = d.handle("मुझे नई FIR दर्ज करनी है");
    expect(start.actions).toContainEqual({ type: "navigate", href: "/intake/new" });

    let t = d.handle("मेरा नाम रमेश कुमार है");
    expect(fills(t.actions)).toEqual([["report.speakerName", "रमेश कुमार"]]);

    t = d.handle("नौ आठ सात छह पांच चार तीन दो एक शून्य");
    expect(fills(t.actions)).toEqual([["report.speakerContact", "9876543210"]]);

    t = d.handle("मेरा मोबाइल चोरी हो गया");
    expect(fills(t.actions)).toEqual([["report.incidentType", "Theft"]]);

    t = d.handle("कल");
    expect(fills(t.actions)).toEqual([["report.incidentDate", "2026-11-25"]]);

    t = d.handle("सदर बाजार");
    expect(fills(t.actions)).toEqual([["report.incidentLocation", "सदर बाजार"]]);

    t = d.handle("शाम को भीड़ में किसी ने मेरी जेब से फोन निकाल लिया");
    expect(t.say).toContain("क्या मैं रिपोर्ट आगे बढ़ा दूँ");
    expect(types(t.actions)).not.toContain("submit");

    // correction goes back to summary
    t = d.handle("नाम गलत है");
    t = d.handle("रमेश शर्मा");
    expect(fills(t.actions)).toEqual([["report.speakerName", "रमेश शर्मा"]]);
    expect(t.say).toContain("सार");
    expect(types(t.actions)).not.toContain("submit");

    t = d.handle("हाँ");
    expect(t.actions).toContainEqual({ type: "submit", form: "report" });
    expect(fills(t.actions)).toEqual([["report.statement", "शाम को भीड़ में किसी ने मेरी जेब से फोन निकाल लिया"]]);
  });

  it("re-asks an unclear phone number and allows skipping", () => {
    const d = mk();
    d.handle("FIR दर्ज करनी है");
    d.handle("सीता देवी");
    expect(d.handle("नौ आठ").say).toContain("दोबारा");
    const t = d.handle("नहीं है");
    expect(fills(t.actions)).toEqual([]);
    expect(t.say).toContain("घटना किस तरह");
  });

  it("can be cancelled", () => {
    const d = mk();
    d.handle("नई रिपोर्ट लिखनी है");
    expect(d.handle("रुको").say).toContain("रोक दिया");
  });

  it("maps incident types to real intake values", () => {
    expect(matchIncidentType("ऑनलाइन फ्रॉड हुआ")).toBe("Cyber fraud");
    expect(matchIncidentType("बाइक चोरी")).toBe("Vehicle theft");
    expect(matchIncidentType("मारपीट हुई")).toBe("Assault");
    expect(matchIncidentType("पर्स गुम हो गया")).toBe("Lost property");
    expect(matchIncidentType("छेड़छाड़")).toBe("Harassment");
  });
});

describe("voice dialog: SOS flow", () => {
  it("needs an explicit yes before submitting", () => {
    const d = mk();
    expect(d.handle("एक SOS भेजना है").actions).toContainEqual({ type: "navigate", href: "/sos" });
    let t = d.handle("सदर बाजार में भीड़ बेकाबू है तुरंत फोर्स भेजो");
    expect(fills(t.actions).map(([f]) => f)).toEqual(["sos.title", "sos.message"]);
    t = d.handle("छोड़ दो");
    expect(t.say).toContain("SOS भेज दूँ");
    expect(types(t.actions)).not.toContain("submit");
    t = d.handle("ठीक है");
    expect(types(t.actions)).not.toContain("submit");
    t = d.handle("हाँ भेज दो");
    expect(t.actions).toContainEqual({ type: "submit", form: "sos" });
  });
});

describe("voice dialog: cancelling at confirmation steps", () => {
  const toSosLocation = () => {
    const d = mk();
    d.handle("एक SOS भेजना है");
    d.handle("सदर बाजार में भीड़ बेकाबू है");
    return d;
  };
  const toSosConfirm = () => {
    const d = toSosLocation();
    d.handle("छोड़ दो");
    return d;
  };
  it("'नहीं, अभी मत भेजो' at the location step cancels the SOS", () => {
    const d = toSosLocation();
    const t = d.handle("नहीं, अभी मत भेजो");
    expect(t.say).toContain("SOS रद्द");
    expect(types(t.actions)).not.toContain("submit");
    // flow is over: a later "हाँ" must not send anything
    expect(types(d.handle("हाँ").actions)).not.toContain("submit");
  });
  it.each(["रद्द करो", "cancel", "नहीं भेजना", "रहने दो"])("'%s' at the location step cancels", (u) => {
    expect(toSosLocation().handle(u).say).toContain("SOS रद्द");
  });
  it.each(["नहीं", "रहने दो", "cancel", "बस", "ठीक है बस"])("'%s' at SOS confirmation cancels without sending", (u) => {
    const t = toSosConfirm().handle(u);
    expect(t.say).toContain("SOS रद्द");
    expect(types(t.actions)).not.toContain("submit");
    expect(t.expectReply).toBe(true);
  });
  it.each(["बस, हो गया", "हो गया", "धन्यवाद"])("'%s' at SOS confirmation cancels and ends the call", (u) => {
    const t = toSosConfirm().handle(u);
    expect(t.say).toContain("SOS रद्द");
    expect(types(t.actions)).toEqual(["fly", "end"]);
    expect(t.expectReply).toBe(false);
  });
  const toFirConfirm = () => {
    const d = mk();
    d.handle("FIR दर्ज करनी है");
    d.handle("रमेश");
    d.handle("नहीं है");
    d.handle("चोरी");
    d.handle("आज");
    d.handle("सदर बाजार");
    d.handle("भीड़ में किसी ने फोन निकाल लिया");
    return d;
  };
  it.each(["नहीं", "रहने दो", "cancel", "ठीक है बस"])("'%s' at FIR confirmation cancels without submitting", (u) => {
    const t = toFirConfirm().handle(u);
    expect(t.say).toContain("रिपोर्ट आगे नहीं बढ़ाई");
    expect(types(t.actions)).not.toContain("submit");
  });
  it("'बस, हो गया' at FIR confirmation cancels and ends the call", () => {
    const t = toFirConfirm().handle("बस, हो गया");
    expect(t.say).toContain("रिपोर्ट रद्द");
    expect(t.expectReply).toBe(false);
    expect(types(t.actions)).not.toContain("submit");
  });
  it("'नहीं, नाम गलत है' still goes to correction", () => {
    expect(toFirConfirm().handle("नहीं, नाम गलत है").say).toContain("नाम");
  });
});

describe("voice dialog: ending", () => {
  it.each(["बस", "हो गया", "धन्यवाद", "बाय", "नहीं कुछ नहीं", "call cut करो"])("%s ends the session", (u) => {
    const t = mk().handle(u);
    expect(t.expectReply).toBe(false);
    expect(t.actions).toEqual([{ type: "fly", to: { kind: "home" } }, { type: "end" }]);
  });
  it("does not end on 'बायीं' while dictating a location", () => {
    const d = mk();
    d.handle("FIR दर्ज करनी है");
    d.handle("रमेश");
    d.handle("नहीं है");
    d.handle("चोरी");
    d.handle("आज");
    const t = d.handle("स्टेशन के बायीं तरफ");
    expect(t.expectReply).toBe(true);
  });
});

describe("voice dialog: parsers", () => {
  it("dates", () => {
    expect(parseDate("आज", NOW)?.iso).toBe("2026-11-26");
    expect(parseDate("परसों", NOW)?.iso).toBe("2026-11-24");
    expect(parseDate("15 नवंबर", NOW)?.iso).toBe("2026-11-15");
    expect(parseDate("पंद्रह नवंबर", NOW)?.iso).toBe("2026-11-15");
    expect(parseDate("20 दिसंबर", NOW)?.iso).toBe("2025-12-20");
    expect(parseDate("तीन दिन पहले", NOW)?.iso).toBe("2026-11-23");
  });
  it("digits", () => {
    expect(parseDigits("98765 43210")).toBe("9876543210");
    expect(parseDigits("डबल नौ आठ")).toBe("998");
  });
  it("falls back to help on unknown input", () => {
    const d = mk();
    expect(d.handle("आसमान नीला है").say).toContain("आप कह सकते हैं");
    expect(d.handle("कुछ भी").say).toContain("आप ये कर सकते हैं");
  });
});

describe("voice dialog: English end phrases", () => {
  it.each(["cut the call", "cut call", "end the call", "end call", "hang up", "stop", "bye", "goodbye", "thank you", "that's all", "I'm done", "close"])(
    "'%s' ends the session",
    (u) => {
      const t = mk().handle(u);
      expect(t.expectReply).toBe(false);
      expect(t.actions).toEqual([{ type: "fly", to: { kind: "home" } }, { type: "end" }]);
    },
  );
  it("strong English phrases end even while dictating; soft ones don't", () => {
    const d = mk();
    d.handle("I want to file an FIR");
    d.handle("Ramesh Kumar");
    d.handle("no number");
    d.handle("theft");
    d.handle("today");
    // dictating the location: "stop" alone is just text, "end the call" ends
    expect(d.handle("stop").expectReply).toBe(true);
    const d2 = mk();
    d2.handle("I want to file an FIR");
    expect(d2.handle("end the call").expectReply).toBe(false);
  });
});

describe("voice dialog: English flows", () => {
  it("navigation and case lookups in English", () => {
    expect(mkEn().handle("go to SOS").actions).toContainEqual({ type: "navigate", href: "/sos" });
    expect(mkEn().handle("open cases").actions).toContainEqual({ type: "navigate", href: "/cases" });
    expect(mkEn().handle("take me to the dashboard").actions).toContainEqual({ type: "navigate", href: "/" });
    expect(mkEn().handle("open case 15").actions).toContainEqual({ type: "openCase", query: "00015" });
    expect(mkEn().handle("open case fifteen").actions).toContainEqual({ type: "openCase", query: "00015" });
    const status = mkEn().handle("what's the status of case 15");
    expect(status.actions).toContainEqual({ type: "openCase", query: "00015" });
    expect(status.lang).toBe("en");
    expect(status.say).toMatch(/^Opening case 15/);
  });

  it("files an FIR fully in English and submits only after yes", () => {
    const d = mkEn();
    let t = d.handle("I want to register a complaint");
    expect(t.actions).toContainEqual({ type: "navigate", href: "/intake/new" });
    expect(t.lang).toBe("en");
    expect(t.say).toContain("complainant's full name");
    t = d.handle("My name is Ramesh Kumar");
    expect(fills(t.actions)).toEqual([["report.speakerName", "Ramesh Kumar"]]);
    expect(t.say).toContain("mobile number");
    t = d.handle("nine eight seven six five four three two one zero");
    expect(fills(t.actions)).toEqual([["report.speakerContact", "9876543210"]]);
    t = d.handle("my phone was stolen");
    expect(fills(t.actions)).toEqual([["report.incidentType", "Theft"]]);
    expect(t.say).toContain("Recorded as theft");
    t = d.handle("yesterday");
    expect(fills(t.actions)).toEqual([["report.incidentDate", "2026-11-25"]]);
    t = d.handle("at Sadar Bazaar");
    expect(fills(t.actions)).toEqual([["report.incidentLocation", "Sadar Bazaar"]]);
    t = d.handle("someone took my phone from my pocket in the crowd");
    expect(t.say).toContain("Shall I submit the report");
    expect(types(t.actions)).not.toContain("submit");
    t = d.handle("yes go ahead");
    expect(t.actions).toContainEqual({ type: "submit", form: "report" });
    expect(t.say).toContain("submitted");
  });

  it("sends an SOS in English only after explicit confirmation", () => {
    const d = mkEn();
    let t = d.handle("send an SOS");
    expect(t.actions).toContainEqual({ type: "navigate", href: "/sos" });
    expect(t.say).toContain("What should the SOS say");
    t = d.handle("crowd out of control at the main market please send backup");
    expect(fills(t.actions).map(([f]) => f)).toEqual(["sos.title", "sos.message"]);
    t = d.handle("skip");
    expect(t.say).toContain("Shall I send the SOS");
    expect(types(d.handle("maybe").actions)).not.toContain("submit");
    t = d.handle("yes send it");
    expect(t.actions).toContainEqual({ type: "submit", form: "sos" });
  });

  it("'don't send' cancels the SOS in English", () => {
    const d = mkEn();
    d.handle("send an SOS");
    d.handle("fight near the bus stand");
    expect(d.handle("no, don't send it").say).toContain("SOS is cancelled");
  });

  it("English help on unknown input", () => {
    expect(mkEn().handle("the sky is blue today").say).toContain("You can say");
  });
});

describe("voice dialog: reply language (round 5)", () => {
  it("greets in Hindi by default and English when ctx.lang is en", () => {
    expect(mk().greet().lang).toBe("hi");
    const en = mkEn().greet();
    expect(en.lang).toBe("en");
    expect(en.say).toContain("Hello Hackathon Judges");
  });

  it.each(["cases पर जाओ", "मेरा phone चोरी हो गया है", "report submit कर दो", "updates पर जाओ", "SOS पर जाओ please"])(
    "code-mixed Hindi '%s' stays Hindi",
    (u) => {
      const d = mk();
      expect(d.handle(u, { language: "hi-IN" }).lang).toBe("hi");
      expect(d.handle(u).lang).toBe("hi");
    },
  );

  it("STT language decides; one English utterance is not enough to switch, two are", () => {
    const d = mk();
    expect(d.handle("please open the case list", { language: "en-IN" }).lang).toBe("hi");
    expect(d.handle("take me to the dashboard", { language: "en-IN" }).lang).toBe("en");
    // short replies never switch back
    expect(d.handle("हाँ", { language: "hi-IN" }).lang).toBe("en");
    expect(d.handle("नहीं", { language: "hi-IN" }).lang).toBe("en");
    // two Hindi sentences in a row switch back
    expect(d.handle("मुझे डैशबोर्ड पर ले चलो", { language: "hi-IN" }).lang).toBe("en");
    expect(d.handle("केस नंबर पंद्रह खोलो", { language: "hi-IN" }).lang).toBe("hi");
  });

  it("a Hindi utterance in between resets the English streak", () => {
    const d = mk();
    d.handle("please open the case list", { language: "en-IN" });
    d.handle("मुझे डैशबोर्ड पर ले चलो", { language: "hi-IN" });
    expect(d.handle("take me to the dashboard", { language: "en-IN" }).lang).toBe("hi");
  });

  it("explicit requests switch immediately", () => {
    const d = mk();
    let t = d.handle("English में बोलो");
    expect(t.lang).toBe("en");
    expect(t.say).toContain("speak in English");
    t = d.handle("talk in Hindi");
    expect(t.lang).toBe("hi");
    expect(t.say).toContain("हिंदी में");
    // request + command: switch and do the command
    t = d.handle("speak in English and go to updates");
    expect(t.lang).toBe("en");
    expect(t.actions).toContainEqual({ type: "navigate", href: "/updates" });
  });

  it("without STT language, only ≥75% Latin counts as English", () => {
    const d = mk();
    d.handle("please open the case list");
    expect(d.handle("take me to the dashboard").lang).toBe("en");
  });

  it("does not switch language while giving a name or phone number", () => {
    const d = mkEn();
    d.handle("I want to file an FIR");
    expect(d.handle("रमेश कुमार शर्मा जी", { language: "hi-IN" }).lang).toBe("en");
  });

  it("detectReplyLang", async () => {
    const { detectReplyLang } = await import("@/components/voice/dialog");
    expect(detectReplyLang("मुझे नई FIR दर्ज करनी है", "hi-IN")).toBe("hi");
    expect(detectReplyLang("please open case 15", "hi-IN")).toBe("hi"); // STT wins
    expect(detectReplyLang("मेरा mobile चोरी हो गया")).toBe("hi");
    expect(detectReplyLang("cases पर जाओ")).toBe("hi");
    expect(detectReplyLang("report submit कर दो")).toBe("hi");
    expect(detectReplyLang("open case 15")).toBe("en");
    expect(detectReplyLang("kuch bhi", "en-IN")).toBe("en");
  });
});

describe("voice dialog: round 4 — FIR form model", () => {
  /** Dialog with a controllable pathname (simulates the page the user is on). */
  const mkp = () => {
    let path = "/";
    const d = createDialog({ userName: "Hackathon Judges", pathname: () => path }, { now: () => NOW });
    return { d, go: (p: string) => { path = p; } };
  };
  const startAt = (slot: "name" | "phone" | "type" | "location" | "description" | "confirm") => {
    const h = mkp();
    h.d.handle("मुझे नई FIR दर्ज करनी है");
    h.go("/intake/new");
    const steps: [string, string][] = [
      ["name", "रमेश कुमार"],
      ["phone", "9876543210"],
      ["type", "मोबाइल चोरी"],
      ["date", "कल"],
      ["location", "सदर बाजार"],
      ["description", "भीड़ में किसी ने जेब से फोन निकाल लिया"],
    ];
    for (const [s, answer] of steps) {
      if (s === slot) break;
      h.d.handle(answer);
    }
    return h;
  };

  describe("navigation wins, even mid-dictation", () => {
    it.each([
      ["records पे जाओ", "/records"],
      ["records पर जाओ", "/records"],
      ["go to records", "/records"],
      ["SOS पर जाओ", "/sos"],
      ["cases खोलो", "/cases"],
      ["dashboard पे चलो", "/"],
      ["take me to updates", "/updates"],
    ])("while dictating the name: '%s' navigates to %s", (u, href) => {
      const { d } = startAt("name");
      const t = d.handle(u);
      expect(t.actions).toContainEqual({ type: "navigate", href });
      expect(fills(t.actions)).toEqual([]);
    });
    it("also while dictating location / description, with a pause line", () => {
      const a = startAt("location").d.handle("records पर जाओ");
      expect(a.actions).toContainEqual({ type: "navigate", href: "/records" });
      expect(a.say).toMatch(/FIR बाद में जारी|continue the FIR later/);
      const b = startAt("description").d.handle("go to SOS");
      expect(b.actions).toContainEqual({ type: "navigate", href: "/sos" });
      expect(fills(b.actions)).toEqual([]);
    });
    it("a free-text answer without a command is still dictation", () => {
      const { d } = startAt("location");
      const t = d.handle("records room के पास वाली गली");
      expect(fills(t.actions)).toEqual([["report.incidentLocation", "records room के पास वाली गली"]]);
    });
  });

  describe("slot filling targets only the asked field", () => {
    it("each answer fills exactly the slot being asked", () => {
      const h = mkp();
      h.d.handle("FIR दर्ज करनी है");
      h.go("/intake/new");
      expect(fills(h.d.handle("सीता देवी").actions)).toEqual([["report.speakerName", "सीता देवी"]]);
      expect(fills(h.d.handle("98765 43210").actions)).toEqual([["report.speakerContact", "9876543210"]]);
      expect(fills(h.d.handle("धोखाधड़ी").actions)).toEqual([["report.incidentType", "Cheating / Fraud"]]);
      expect(fills(h.d.handle("आज").actions)).toEqual([["report.incidentDate", "2026-11-26"]]);
      expect(fills(h.d.handle("मॉडल टाउन").actions)).toEqual([["report.incidentLocation", "मॉडल टाउन"]]);
    });
  });

  describe("corrections", () => {
    it("'नहीं नाम गलत हो गया है' mid-flow re-asks only the name and keeps everything else", () => {
      const { d } = startAt("type");
      let t = d.handle("नहीं नाम गलत हो गया है");
      expect(t.say).toContain("सही नाम बताइए");
      expect(fills(t.actions)).toEqual([]);
      t = d.handle("रमेश शर्मा");
      expect(fills(t.actions)).toEqual([["report.speakerName", "रमेश शर्मा"]]);
      // resumes at the slot we were on (type), not from the start
      expect(t.say).toContain("घटना किस तरह");
      expect(fills(d.handle("चोरी").actions)).toEqual([["report.incidentType", "Theft"]]);
    });
    it.each([
      ["फोन नंबर गलत है", "मोबाइल नंबर", "98765 11111", "report.speakerContact", "9876511111"],
      ["तारीख बदलो", "तारीख", "परसों", "report.incidentDate", "2026-11-24"],
      ["जगह गलत है", "जगह", "चांदनी चौक", "report.incidentLocation", "चांदनी चौक"],
      ["प्रकार बदलो", "घटना का प्रकार", "मारपीट", "report.incidentType", "Assault"],
      ["पता बदलो", "पता", "12 गांधी नगर", "report.speakerAddress", "12 गांधी नगर"],
    ])("at the summary: '%s' → asks %s and returns to summary", (u, labelHi, answer, field, value) => {
      const { d } = startAt("confirm");
      expect(d.handle(u).say).toContain(labelHi);
      const t = d.handle(answer);
      expect(fills(t.actions)).toEqual([[field, value]]);
      expect(t.say).toContain("सार");
      expect(types(t.actions)).not.toContain("submit");
    });
    it("English corrections: 'the name is wrong' / 'change the location'", () => {
      const { d } = startAt("confirm");
      expect(d.handle("the name is wrong").say).toMatch(/correct|सही/);
      const t = d.handle("Ramesh Sharma");
      expect(fills(t.actions)).toEqual([["report.speakerName", "Ramesh Sharma"]]);
    });
    it("description correction updates the statement that will be filled after submit", () => {
      const { d } = startAt("confirm");
      d.handle("विवरण बदलो");
      d.handle("बस स्टैंड पर किसी ने बैग छीन लिया");
      const t = d.handle("हाँ");
      expect(fills(t.actions)).toContainEqual(["report.statement", "बस स्टैंड पर किसी ने बैग छीन लिया"]);
    });
  });

  describe("direct value statements", () => {
    it("fills the stated field and continues with the next missing slot", () => {
      const h = mkp();
      h.d.handle("FIR दर्ज करनी है");
      h.go("/intake/new");
      let t = h.d.handle("नाम रमेश कुमार है");
      expect(fills(t.actions)).toEqual([["report.speakerName", "रमेश कुमार"]]);
      expect(t.say).toContain("मोबाइल नंबर");
      t = h.d.handle("जगह सदर बाज़ार है");
      expect(fills(t.actions)).toEqual([["report.incidentLocation", "सदर बाज़ार"]]);
      expect(t.say).toContain("मोबाइल नंबर"); // phone still missing
      t = h.d.handle("फोन नंबर 98765 43210 है");
      expect(fills(t.actions)).toEqual([["report.speakerContact", "9876543210"]]);
      t = h.d.handle("तारीख कल की है");
      expect(fills(t.actions)).toEqual([["report.incidentDate", "2026-11-25"]]);
      expect(t.say).toContain("घटना किस तरह"); // type still missing
    });
    it("English: 'my name is Ramesh' and 'address is 5 MG Road'", () => {
      const h = mkp();
      h.d.handle("I want to file an FIR");
      expect(fills(h.d.handle("my name is Ramesh").actions)).toEqual([["report.speakerName", "Ramesh"]]);
      expect(fills(h.d.handle("address is 5 MG Road").actions)).toEqual([["report.speakerAddress", "5 MG Road"]]);
    });
    it("never re-emits fills for unchanged slots", () => {
      const { d } = startAt("type");
      expect(fills(d.handle("नाम रमेश कुमार है").actions)).toEqual([]);
    });
    it("'मेरा फोन चोरी हो गया' as the incident type is not mistaken for a phone number", () => {
      const { d } = startAt("type");
      expect(fills(d.handle("मेरा फोन चोरी हो गया").actions)).toEqual([["report.incidentType", "Theft"]]);
    });
  });

  describe("previous slot", () => {
    it("'पिछला बदलो' re-asks only the previous slot", () => {
      const { d } = startAt("type");
      expect(d.handle("पिछला बदलो").say).toContain("मोबाइल नंबर दोबारा");
      const t = d.handle("98765 00000");
      expect(fills(t.actions)).toEqual([["report.speakerContact", "9876500000"]]);
      expect(t.say).toContain("घटना किस तरह");
    });
    it("'वापस' goes back instead of cancelling", () => {
      const { d } = startAt("location");
      expect(d.handle("वापस").say).toContain("तारीख दोबारा");
    });
  });

  describe("pause & resume", () => {
    it("navigating away pauses; coming back resumes and refills collected fields once", () => {
      const h = startAt("location");
      h.d.handle("records पर जाओ");
      h.go("/records");
      let t = h.d.handle("FIR जारी रखो");
      expect(t.actions).toContainEqual({ type: "navigate", href: "/intake/new" });
      expect(fills(t.actions)).toEqual([
        ["report.speakerName", "रमेश कुमार"],
        ["report.speakerContact", "9876543210"],
        ["report.incidentType", "Theft"],
        ["report.incidentDate", "2026-11-25"],
      ]);
      expect(t.say).toContain("घटना कहाँ हुई");
      h.go("/intake/new");
      t = h.d.handle("सदर बाजार");
      expect(fills(t.actions)).toEqual([["report.incidentLocation", "सदर बाजार"]]); // no duplicate refill
    });
    it("re-entering /intake/new by any means refills before handling the answer", () => {
      const h = startAt("location");
      h.go("/cases"); // user wandered off (e.g. clicked a link)
      h.d.handle("कुछ नहीं समझ आया"); // any utterance while away
      h.go("/intake/new");
      const t = h.d.handle("सदर बाजार");
      expect(fills(t.actions)).toEqual([
        ["report.speakerName", "रमेश कुमार"],
        ["report.speakerContact", "9876543210"],
        ["report.incidentType", "Theft"],
        ["report.incidentDate", "2026-11-25"],
        ["report.incidentLocation", "सदर बाजार"],
      ]);
    });
    it("'new report पर जाओ' while paused resumes instead of starting over", () => {
      const h = startAt("location");
      h.d.handle("go to records");
      h.go("/records");
      const t = h.d.handle("new report पर जाओ");
      expect(t.say).toMatch(/जारी|continue/);
      expect(fills(t.actions).length).toBe(4);
    });
  });
});

describe("voice dialog: round 5 — intake wizard", () => {
  const mkw = () => {
    let path = "/";
    let step: string | null = null;
    const d = createDialog(
      { userName: "Hackathon Judges", pathname: () => path, intakeStep: () => step },
      { now: () => NOW },
    );
    return { d, at: (p: string, st: string | null) => { path = p; step = st; } };
  };
  const adv = (a: VoiceAction[]) => a.filter((x) => x.type === "advanceIntake");

  const submitFir = () => {
    const h = mkw();
    h.d.handle("मुझे नई FIR दर्ज करनी है");
    h.at("/intake/new", "intake");
    for (const a of ["रमेश कुमार", "9876543210", "चोरी", "कल", "सदर बाजार", "भीड़ में किसी ने जेब से फोन निकाल लिया"]) h.d.handle(a);
    const t = h.d.handle("हाँ");
    expect(t.actions).toContainEqual({ type: "submit", form: "report" });
    return h;
  };

  it("walks through every step after the report is submitted", () => {
    const h = submitFir();
    const { d } = h;

    h.at("/intake/s1", "method");
    expect(d.onIntakeStep!("method")?.say).toContain("लिखित बयान");
    expect(adv(d.handle("हाँ").actions)).toEqual([{ type: "advanceIntake", step: "method" }]);

    h.at("/intake/s1", "capture");
    expect(d.onIntakeStep!("capture")?.say).toContain("transcript review");
    expect(adv(d.handle("हाँ").actions)).toEqual([{ type: "advanceIntake", step: "capture" }]);

    h.at("/intake/s1", "capture:saved");
    expect(d.onIntakeStep!("capture:saved")?.say).toContain("बयान सेव हो गया");
    expect(adv(d.handle("हाँ जी").actions)).toEqual([{ type: "advanceIntake", step: "capture" }]);

    h.at("/intake/s1", "transcript");
    expect(d.onIntakeStep!("transcript")?.say).toContain("पढ़कर सुनाऊँ");
    const rb = d.handle("हाँ");
    expect(rb.say).toContain("भीड़ में किसी ने जेब से फोन निकाल लिया");
    expect(adv(rb.actions)).toEqual([]);
    // confirming the transcript needs an explicit yes — "ठीक है" is not enough
    expect(adv(d.handle("ठीक है").actions)).toEqual([]);
    expect(adv(d.handle("हाँ").actions)).toEqual([{ type: "advanceIntake", step: "transcript" }]);

    h.at("/intake/s1", "draft");
    expect(d.onIntakeStep!("draft")?.say).toContain("ड्राफ्ट");
    expect(adv(d.handle("ठीक है बना दो").actions)).toEqual([{ type: "advanceIntake", step: "draft" }]);

    h.at("/intake/s1", "review");
    expect(d.onIntakeStep!("review")?.say).toContain("अधिकारी");
    expect(d.handle("ठीक है").say).toContain("साफ़ 'हाँ'");
    expect(adv(d.handle("हाँ").actions)).toEqual([{ type: "advanceIntake", step: "review" }]);

    h.at("/intake/s1", "case");
    expect(d.onIntakeStep!("case")?.say).toContain("case बना दूँ");
    expect(d.handle("नहीं").say).toContain("यहीं रुकते");
    // "आगे बढ़ो" on a consequential step asks for confirmation instead of pressing
    const nx = d.handle("आगे बढ़ो");
    expect(adv(nx.actions)).toEqual([]);
    expect(adv(d.handle("हाँ").actions)).toEqual([{ type: "advanceIntake", step: "case" }]);

    h.at("/intake/s1", "complete");
    expect(d.onIntakeStep!("complete")?.say).toContain("case बन गया");
  });

  it("read-back can be declined", () => {
    const h = submitFir();
    h.at("/intake/s1", "transcript");
    h.d.onIntakeStep!("transcript");
    expect(h.d.handle("नहीं").say).toContain("पुष्टि करके आगे बढ़ें");
  });

  it("'next / आगे बढ़ो' advances non-consequential steps directly", () => {
    const h = submitFir();
    h.at("/intake/s1", "method");
    expect(adv(h.d.handle("next").actions)).toEqual([{ type: "advanceIntake", step: "method" }]);
    h.at("/intake/s1", "draft");
    expect(adv(h.d.handle("आगे बढ़ो").actions)).toEqual([{ type: "advanceIntake", step: "draft" }]);
  });

  it("resumes from whatever step the page is on (fresh dialog)", () => {
    const h = mkw();
    h.at("/intake/abc", "draft");
    expect(adv(h.d.handle("आगे बढ़ो").actions)).toEqual([{ type: "advanceIntake", step: "draft" }]);
    const h2 = mkw();
    h2.at("/intake/abc", "transcript");
    expect(h2.d.onIntakeStep!("transcript")?.say).toContain("पढ़कर सुनाऊँ");
    // no statement known → asks the officer to read from the screen
    expect(h2.d.handle("हाँ").say).toContain("स्क्रीन पर बयान");
  });

  it("consent is never auto-advanced", () => {
    const h = mkw();
    h.at("/intake/abc", "consent");
    expect(h.d.onIntakeStep!("consent")?.say).toContain("सहमति");
    const t = h.d.handle("आगे बढ़ो");
    expect(adv(t.actions)).toEqual([]);
    expect(t.say).toContain("सहमति");
  });

  it("navigation still wins on wizard pages and English works", () => {
    const h = mkw();
    h.at("/intake/abc", "draft");
    expect(h.d.handle("cases पर जाओ").actions).toContainEqual({ type: "navigate", href: "/cases" });
    const en = createDialog({ userName: "J", pathname: () => "/intake/x", intakeStep: () => "case", lang: "en" }, { now: () => NOW });
    expect(en.onIntakeStep!("case")?.say).toContain("create the case");
    expect(adv(en.handle("okay").actions)).toEqual([]);
    expect(adv(en.handle("yes").actions)).toEqual([{ type: "advanceIntake", step: "case" }]);
  });

  it("does not hijack the report form step or an active FIR", () => {
    const h = mkw();
    h.d.handle("FIR दर्ज करनी है");
    h.at("/intake/new", "intake");
    expect(h.d.onIntakeStep!("intake")).toBeNull();
    expect(fills(h.d.handle("सीता देवी").actions)).toEqual([["report.speakerName", "सीता देवी"]]);
  });

  it("reports a failed advance", () => {
    const h = mkw();
    expect(h.d.onActionResult({ action: { type: "advanceIntake", step: "draft" }, ok: false })?.say).toContain("दिक्कत");
  });
});
