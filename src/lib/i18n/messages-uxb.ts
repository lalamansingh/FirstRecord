/** Polish-pass strings (UxB). Hindi in hiUxB; other languages in uxbExtra. Keys are the English text. */
export const hiUxB = {
  "Verbatim — speaker's own words": "शब्दशः — वक्ता के अपने शब्द",
} as const;

export const uxbExtra: Record<"bn" | "mr" | "te" | "ta" | "gu" | "kn" | "ml" | "pa", Partial<Record<string, string>>> = {
  bn: { "Verbatim — speaker's own words": "হুবহু — বক্তার নিজের কথা" }, mr: { "Verbatim — speaker's own words": "शब्दशः — बोलणाऱ्याचे स्वतःचे शब्द" }, te: { "Verbatim — speaker's own words": "యథాతథంగా — వక్త సొంత మాటలు" }, ta: { "Verbatim — speaker's own words": "சொல்லுக்குச் சொல் — பேசியவரின் சொந்த வார்த்தைகள்" }, gu: { "Verbatim — speaker's own words": "શબ્દશઃ — વક્તાના પોતાના શબ્દો" }, kn: { "Verbatim — speaker's own words": "ಯಥಾವತ್ತಾಗಿ — ಮಾತನಾಡಿದವರ ಸ್ವಂತ ಮಾತುಗಳು" }, ml: { "Verbatim — speaker's own words": "പദാനുപദം — സംസാരിച്ചയാളുടെ സ്വന്തം വാക്കുകൾ" }, pa: { "Verbatim — speaker's own words": "ਸ਼ਬਦ-ਬ-ਸ਼ਬਦ — ਬੋਲਣ ਵਾਲੇ ਦੇ ਆਪਣੇ ਸ਼ਬਦ" },
};
