/** Sign-in page strings. Only the selected language is rendered. */
export interface LoginStrings {
  wordmarkTagline: string;
  language: string;
  apply: string;
  heroTitle: string;
  heroBody: string;
  points: { title: string; body: string }[];
  aiNote: string;
  notice: string;
  reviewTitle?: string;
  reviewId?: string;
  reviewPassword?: string;
  reviewUpdate?: string;
  signInTitle: string;
  signInSubtitle: string;
  email: string;
  password: string;
  submit: string;
  submitting: string;
  ssoNote: string;
  footerLine: string;
  footerAffiliation: string;
}

export const loginStrings: { en: LoginStrings; hi: LoginStrings } & Partial<Record<string, LoginStrings>> = {
  en: {
    wordmarkTagline: "Police station case & statement records",
    language: "Language",
    apply: "Apply",
    heroTitle: "Case and statement records for police stations",
    heroBody:
      "FirstRecord helps station staff record a person's account accurately, prepare FIR drafts for officer review, and keep every case traceable from the first report onwards.",
    points: [
      { title: "Accurate statements", body: "Typed, staff-assisted or recorded with consent, with automatic transcription." },
      { title: "Human-reviewed drafts", body: "Every FIR draft is checked and approved by an authorized officer." },
      { title: "Full accountability", body: "Role-based access, and a complete history of every view and change." },
    ],
    aiNote: "AI assistance only prepares drafts. It never files an FIR or makes a legal decision.",
    notice: "Hackathon prototype — not an official police system. All data is fictional.",
    reviewTitle: "For hackathon review",
    reviewId: "Demo ID",
    reviewPassword: "Password",
    reviewUpdate: "All features will be updated on the Grand Finale day.",
    signInTitle: "Sign in",
    signInSubtitle: "For authorized station staff. All access is logged.",
    email: "Email address",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    ssoNote: "Need access? Contact your station administrator.",
    footerLine: "FirstRecord · Internal records system. Drafts and reviews are not official FIR filings.",
    footerAffiliation: "Prototype — not affiliated with or endorsed by any government department.",
  },
  hi: {
    wordmarkTagline: "थाना केस एवं बयान अभिलेख",
    language: "भाषा",
    apply: "लागू करें",
    heroTitle: "पुलिस थानों के लिए केस एवं बयान अभिलेख",
    heroBody:
      "FirstRecord थाना कर्मियों को किसी व्यक्ति का बयान सही-सही दर्ज करने, अधिकारी की समीक्षा के लिए एफ़आईआर ड्राफ़्ट तैयार करने और पहली शिकायत से ही हर मामले का पूरा रिकॉर्ड रखने में मदद करता है।",
    points: [
      { title: "सटीक बयान", body: "टाइप करके, कर्मचारी की सहायता से, या सहमति के साथ रिकॉर्ड करके — स्वचालित ट्रांसक्रिप्शन सहित।" },
      { title: "मानव-समीक्षित ड्राफ़्ट", body: "हर एफ़आईआर ड्राफ़्ट की जाँच और स्वीकृति अधिकृत अधिकारी द्वारा की जाती है।" },
      { title: "पूरी जवाबदेही", body: "भूमिका-आधारित पहुँच, और हर बार देखे जाने व हर बदलाव का पूरा इतिहास।" },
    ],
    aiNote: "AI सहायता केवल ड्राफ़्ट तैयार करती है। यह कभी एफ़आईआर दर्ज नहीं करती और न ही कोई कानूनी निर्णय लेती है।",
    notice: "हैकाथॉन प्रोटोटाइप — यह आधिकारिक पुलिस प्रणाली नहीं है। सभी डेटा काल्पनिक है।",
    reviewTitle: "हैकाथॉन समीक्षा के लिए",
    reviewId: "डेमो आईडी",
    reviewPassword: "पासवर्ड",
    reviewUpdate: "सभी सुविधाएँ ग्रैंड फ़िनाले के दिन अपडेट की जाएँगी।",
    signInTitle: "साइन इन करें",
    signInSubtitle: "केवल अधिकृत थाना कर्मियों के लिए। हर पहुँच का रिकॉर्ड रखा जाता है।",
    email: "ईमेल पता",
    password: "पासवर्ड",
    submit: "साइन इन करें",
    submitting: "साइन इन हो रहा है…",
    ssoNote: "पहुँच चाहिए? अपने थाना प्रशासक से संपर्क करें।",
    footerLine: "FirstRecord · आंतरिक अभिलेख प्रणाली। ड्राफ़्ट और समीक्षाएँ आधिकारिक एफ़आईआर नहीं हैं।",
    footerAffiliation: "प्रोटोटाइप — किसी भी सरकारी विभाग से संबद्ध या उसके द्वारा समर्थित नहीं।",
  },
};
