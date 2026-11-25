/** Display-time translation of stored English audit summaries. */
import { describe, it, expect } from "vitest";
import { translator } from "@/lib/i18n/messages";
import { localizeAuditSummary } from "@/lib/i18n/audit-summary";
import { hiAudit, auditExtra } from "@/lib/i18n/messages-audit";

describe("localizeAuditSummary", () => {
  const hi = translator("hi");
  const en = translator("en");

  it("translates templates and re-inserts variables", () => {
    expect(localizeAuditSummary("Draft version 3 saved (2 field(s) edited)", hi)).toBe("ड्राफ्ट संस्करण 3 सहेजा गया (2 फ़ील्ड संपादित)");
    expect(localizeAuditSummary("Legal provision BNS 303(2) selected by officer", hi)).toBe("अधिकारी ने कानूनी प्रावधान BNS 303(2) चुना");
    expect(localizeAuditSummary("Task created", hi)).toBe("कार्य बनाया गया");
  });

  it("prefers the most specific template", () => {
    expect(localizeAuditSummary('Status changed from "Report Received" to "Closed" (reason given)', hi)).toContain("(कारण दिया गया)");
    expect(localizeAuditSummary("Legal provision BNS 303(2) added and selected by officer", hi)).toBe("अधिकारी ने कानूनी प्रावधान BNS 303(2) जोड़ा और चुना");
  });

  it("translates captured values that are known labels, keeps names as stored", () => {
    const out = localizeAuditSummary("Assigned to Vikram Rao", hi);
    expect(out).toBe("Vikram Rao को सौंपा गया");
    expect(localizeAuditSummary("Recording consent (audio) granted; notice v1 shown in Hindi", hi)).toContain("दी गई");
  });

  it("leaves unknown summaries and English unchanged", () => {
    expect(localizeAuditSummary("Something entirely custom", hi)).toBe("Something entirely custom");
    expect(localizeAuditSummary("Draft version 3 saved (2 field(s) edited)", en)).toBe("Draft version 3 saved (2 field(s) edited)");
    expect(localizeAuditSummary(null, hi)).toBe("");
  });

  it("every template has all 8 extra languages with matching placeholders", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const key of Object.keys(hiAudit) as (keyof typeof hiAudit)[]) {
      expect(ph(hiAudit[key])).toBe(ph(key));
      for (const [code, m] of Object.entries(auditExtra)) {
        const v = m[key];
        expect(v, `${code}: ${key}`).toBeTruthy();
        expect(ph(v!), `${code}: ${key}`).toBe(ph(key));
      }
    }
  });
});
