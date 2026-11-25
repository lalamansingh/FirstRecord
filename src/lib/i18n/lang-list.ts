/**
 * Every interface language the app knows about. `enabled` languages appear in the
 * language selector. Hindi is complete; other languages fall back to English for
 * any string without a translation. Translations should be reviewed by a
 * qualified translator before deployment.
 */
export const LANG_LIST = [
  { code: "en", label: "English", native: "English", enabled: true },
  { code: "hi", label: "Hindi", native: "हिन्दी", enabled: true },
  { code: "bn", label: "Bengali", native: "বাংলা", enabled: true },
  { code: "mr", label: "Marathi", native: "मराठी", enabled: true },
  { code: "te", label: "Telugu", native: "తెలుగు", enabled: true },
  { code: "ta", label: "Tamil", native: "தமிழ்", enabled: true },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", enabled: true },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", enabled: true },
  { code: "ml", label: "Malayalam", native: "മലയാളം", enabled: true },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", enabled: true },
] as const;

export type LangCode = (typeof LANG_LIST)[number]["code"];
