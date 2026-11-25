/**
 * Speaker-facing strings (consent, capture instructions, read-back). Staff UI is
 * English. To add a language: add an entry to LANGUAGES (domain/workflow.ts),
 * add a dictionary here, and add a `recording.notice.<code>` setting.
 * Hindi text should be reviewed by a qualified translator before deployment.
 */
const en = {
  "consent.title": "Recording consent",
  "consent.lead": "Please read this to the person (or let them read it) before any recording starts.",
  "consent.question": "Do you agree to this recording?",
  "consent.grant": "Yes, I agree to the recording",
  "consent.decline": "No, do not record",
  "consent.declined_note": "Recording declined. The statement will be taken in writing or with staff help. The report is accepted either way.",
  "consent.withdraw": "Stop — consent withdrawn",
  "capture.audio_instructions": "Speak clearly in your own words. You can ask to pause or stop at any time.",
  "capture.video_instructions": "The camera and microphone will record. You can ask to pause or stop at any time.",
  "capture.typed_instructions": "Write the account in the speaker's own words. Do not summarize or correct what they say.",
  "capture.assisted_instructions": "Staff are writing down the account on the speaker's behalf. Read it back to them before confirming.",
  "readback.title": "Read-back to the speaker",
  "readback.lead": "Read the transcript aloud to the speaker (or let them read it). Ask whether it records what they said. Make any corrections they ask for.",
  "readback.confirm_prompt": "The speaker has heard or read the transcript and confirmed it records what they said.",
  "readback.uncertainty": "This transcript was written down by staff and may contain errors. Please listen carefully and tell us anything that is wrong or missing.",
};

type Dict = Record<keyof typeof en, string>;

const hi: Dict = {
  "consent.title": "रिकॉर्डिंग के लिए सहमति",
  "consent.lead": "कोई भी रिकॉर्डिंग शुरू करने से पहले व्यक्ति को यह पढ़कर सुनाएँ (या उन्हें पढ़ने दें)।",
  "consent.question": "क्या आप इस रिकॉर्डिंग के लिए सहमत हैं?",
  "consent.grant": "हाँ, मैं रिकॉर्डिंग के लिए सहमत हूँ",
  "consent.decline": "नहीं, रिकॉर्ड न करें",
  "consent.declined_note": "रिकॉर्डिंग से इनकार किया गया। बयान लिखकर या कर्मचारियों की सहायता से लिया जाएगा। शिकायत दोनों ही स्थितियों में स्वीकार की जाती है।",
  "consent.withdraw": "रोकें — सहमति वापस ली गई",
  "capture.audio_instructions": "अपने शब्दों में साफ़-साफ़ बोलें। आप किसी भी समय रुकने या बंद करने के लिए कह सकते हैं।",
  "capture.video_instructions": "कैमरा और माइक्रोफ़ोन रिकॉर्ड करेंगे। आप किसी भी समय रुकने या बंद करने के लिए कह सकते हैं।",
  "capture.typed_instructions": "बयान को बोलने वाले के अपने शब्दों में लिखें। उनकी बात का सार न बनाएँ और न ही उसे बदलें।",
  "capture.assisted_instructions": "कर्मचारी आपकी ओर से बयान लिख रहे हैं। पुष्टि करने से पहले इसे आपको पढ़कर सुनाया जाएगा।",
  "readback.title": "बयान पढ़कर सुनाना",
  "readback.lead": "लिखित बयान बोलने वाले को पढ़कर सुनाएँ (या उन्हें पढ़ने दें)। पूछें कि क्या इसमें वही लिखा है जो उन्होंने कहा। वे जो सुधार कहें, वे करें।",
  "readback.confirm_prompt": "बोलने वाले ने लिखित बयान सुन या पढ़ लिया है और पुष्टि की है कि इसमें वही लिखा है जो उन्होंने कहा।",
  "readback.uncertainty": "यह बयान कर्मचारियों द्वारा लिखा गया है और इसमें गलतियाँ हो सकती हैं। कृपया ध्यान से सुनें और जो भी गलत या छूटा हुआ हो, हमें बताएँ।",
};

export type I18nKey = keyof typeof en;
const DICTS: Record<string, Dict> = { en, hi };

export function t(lang: string, key: I18nKey): string {
  return (DICTS[lang] ?? en)[key] ?? en[key];
}

export function hasDictionary(lang: string) {
  return lang in DICTS;
}

/** BCP-47 tag for the lang attribute. */
export function langTag(lang: string) {
  return lang === "hi" ? "hi" : "en";
}
