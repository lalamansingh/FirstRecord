/** Polish-pass strings (UxA). Hindi in hiUxA; other languages in uxaExtra. Keys are the English text. */
export const hiUxA = {
  "1 case": "1 मामला",
  "{n} cases": "{n} मामले",
  "{n} selected": "{n} चयनित",
} as const;

export const uxaExtra: Record<"bn" | "mr" | "te" | "ta" | "gu" | "kn" | "ml" | "pa", Partial<Record<string, string>>> = {
  bn: { "1 case": "১টি কেস", "{n} cases": "{n}টি কেস", "{n} selected": "{n}টি নির্বাচিত" },
  mr: { "1 case": "1 प्रकरण", "{n} cases": "{n} प्रकरणे", "{n} selected": "{n} निवडले" },
  te: { "1 case": "1 కేసు", "{n} cases": "{n} కేసులు", "{n} selected": "{n} ఎంపిక చేయబడ్డాయి" },
  ta: { "1 case": "1 வழக்கு", "{n} cases": "{n} வழக்குகள்", "{n} selected": "{n} தேர்ந்தெடுக்கப்பட்டன" },
  gu: { "1 case": "1 કેસ", "{n} cases": "{n} કેસ", "{n} selected": "{n} પસંદ કર્યા" },
  kn: { "1 case": "1 ಪ್ರಕರಣ", "{n} cases": "{n} ಪ್ರಕರಣಗಳು", "{n} selected": "{n} ಆಯ್ಕೆಮಾಡಲಾಗಿದೆ" },
  ml: { "1 case": "1 കേസ്", "{n} cases": "{n} കേസുകൾ", "{n} selected": "{n} തിരഞ്ഞെടുത്തു" },
  pa: { "1 case": "1 ਕੇਸ", "{n} cases": "{n} ਕੇਸ", "{n} selected": "{n} ਚੁਣੇ ਗਏ" },
};
