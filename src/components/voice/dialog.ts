/**
 * FirstRecord साथी — deterministic Hindi / English dialog manager.
 * No network, no LLM tool calls: intent rules + slot filling, so replies are instant.
 * Reply language follows the user per utterance (pure Hindi → Hindi; English or Hinglish → English)
 * and stays sticky until the user clearly switches. All spoken strings live in SAY / SAY_EN.
 */
import type { Dialog, DialogContext, DialogTurn, VoiceAction, VoiceField } from "./types";

export type ReplyLang = "hi" | "en";

/* ------------------------------------------------------------------ strings */

const SAY_HI = {
  greet: (name: string) =>
    `नमस्ते ${name}, मैं आपका FirstRecord साथी हूँ। आप क्या करना चाहते हैं? नई FIR दर्ज करनी है, किसी case के बारे में जानना है, या SOS भेजना है?`,
  navigate: (label: string) => `ठीक है, ${label} खोल रहे हैं।`,
  openCase: (q: string) => `ठीक है, case ${q} खोल रहे हैं।`,
  openCaseInfo: (q: string) => `case ${q} की पूरी जानकारी स्क्रीन पर खुल रही है।`,
  askCase: "कौन सा case? कृपया case नंबर बताइए, जैसे 'केस नंबर 15'।",
  caseNotFound: "यह case नहीं मिला। कृपया दूसरा case नंबर बताइए।",
  submitFailed: "फॉर्म भेजने में दिक्कत आई। कृपया स्क्रीन पर देखिए।",
  cancelled: "ठीक है, रोक दिया। और कुछ करना है?",
  anythingElse: "और कुछ?",
  notUnderstood: "माफ़ कीजिए, यह समझ में नहीं आया।",
  help: "आप कह सकते हैं — 'नई FIR दर्ज करनी है', 'केस नंबर 15 खोलो', या 'SOS भेजना है'।",
  helpOptions:
    "आप ये कर सकते हैं: FIR दर्ज करना, कोई case खोलना, SOS भेजना, या किसी पेज पर जाना — जैसे 'cases पर जाओ'।",
  goodbye: "ठीक है, धन्यवाद! ज़रूरत हो तो मुझे फिर बुलाइए।",
  // FIR flow
  firStart: "ठीक है, नई FIR शुरू करते हैं। फॉर्म साथ-साथ भरा जाएगा। शिकायतकर्ता का पूरा नाम बताइए।",
  askName: "शिकायतकर्ता का पूरा नाम बताइए।",
  askPhone: (name: string) => `धन्यवाद ${name}। अब मोबाइल नंबर बताइए, या 'नहीं है' कहिए।`,
  phoneAgain: "नंबर साफ़ सुनाई नहीं दिया। कृपया दस अंकों का मोबाइल नंबर दोबारा बताइए।",
  askType: (prefix: string) => `${prefix} घटना किस तरह की है — जैसे चोरी, धोखाधड़ी, मारपीट, या कुछ गुम हुआ है?`,
  phoneSaved: (digits: string) => `नंबर ${digits} दर्ज किया।`,
  phoneSkipped: "ठीक है, नंबर छोड़ दिया।",
  askDate: (type: string) => `${type} दर्ज किया। घटना कब हुई? जैसे आज, कल, या तारीख बताइए।`,
  dateAgain: "तारीख समझ नहीं आई। कृपया 'आज', 'कल' या '15 नवंबर' जैसा बताइए।",
  askLocation: (date: string) => `${date} दर्ज किया। घटना कहाँ हुई?`,
  askDescription: "ठीक है। अब संक्षेप में बताइए कि क्या हुआ था।",
  descriptionAgain: "कृपया थोड़ा और विस्तार से बताइए कि क्या हुआ था।",
  firSummary: (s: { name: string; type: string; date: string; location: string }) =>
    `सार: शिकायतकर्ता ${s.name}, घटना ${s.type}, ${s.date}, जगह ${s.location}। क्या मैं रिपोर्ट आगे बढ़ा दूँ?`,
  firSubmitted: "रिपोर्ट आगे बढ़ा दी गई है। अगले चरण में आपका विवरण बयान में भरा जा रहा है। और कुछ?",
  firWhatToChange: "क्या बदलना है — नाम, नंबर, घटना का प्रकार, तारीख, जगह या विवरण?",
  firConfirmAgain: "कृपया 'हाँ' कहिए तो रिपोर्ट आगे बढ़ा दूँ, या बताइए क्या बदलना है।",
  fixName: "शिकायतकर्ता का पूरा नाम बताइए।",
  fixPhone: "सही मोबाइल नंबर बताइए।",
  fixType: "घटना किस तरह की है?",
  fixDate: "घटना कब हुई?",
  fixLocation: "घटना कहाँ हुई?",
  fixDescription: "बताइए क्या हुआ था।",
  // SOS flow
  sosStart: "SOS में क्या लिखूँ? संदेश बोलिए।",
  sosMessageAgain: "कृपया SOS का संदेश बोलिए।",
  sosAskLocation: "संदेश लिख दिया। जगह बताइए, या 'छोड़ दो' कहिए।",
  sosConfirm: "SOS भेज दूँ? यह पास के सभी staff को alert करेगा।",
  sosMessageChanged: "संदेश बदल दिया।",
  sosConfirmAgain: "SOS भेजने के लिए साफ़ 'हाँ' या 'भेजो' कहिए, या 'नहीं' कहिए।",
  sosSent: "SOS भेज दिया गया है। staff को सूचना जा रही है। और कुछ?",
  sosCancelled: "ठीक है, SOS रद्द कर दिया, कुछ नहीं भेजा गया। और कुछ करना है?",
  firCancelled: "ठीक है, रिपोर्ट आगे नहीं बढ़ाई। भरी हुई जानकारी स्क्रीन पर है। और कुछ करना है?",
  cancelledAndBye: (what: "sos" | "report") =>
    `ठीक है, ${what === "sos" ? "SOS" : "रिपोर्ट"} रद्द कर दिया। धन्यवाद! ज़रूरत हो तो मुझे फिर बुलाइए।`,
  // FIR form model (questions, acknowledgements, corrections, pause/resume)
  fieldLabel: {
    name: "नाम", phone: "मोबाइल नंबर", address: "पता", type: "घटना का प्रकार", date: "तारीख", location: "जगह", description: "विवरण",
  } as Record<string, string>,
  qName: "शिकायतकर्ता का पूरा नाम बताइए।",
  qPhone: "अब मोबाइल नंबर बताइए, या 'नहीं है' कहिए।",
  qAddress: "पता बताइए, या 'छोड़ दो' कहिए।",
  qType: "घटना किस तरह की है — जैसे चोरी, धोखाधड़ी, मारपीट, या कुछ गुम हुआ है?",
  qDate: "घटना कब हुई? जैसे आज, कल, या तारीख बताइए।",
  qLocation: "घटना कहाँ हुई?",
  qDescription: "अब संक्षेप में बताइए कि क्या हुआ था।",
  ackName: (name: string) => `धन्यवाद ${name}।`,
  ackAddress: "पता दर्ज किया।",
  ackAddressSkipped: "ठीक है, पता छोड़ दिया।",
  ackType: (type: string) => `${type} दर्ज किया।`,
  ackDate: (date: string) => `${date} दर्ज किया।`,
  ackLocation: "ठीक है।",
  ackDescription: "विवरण दर्ज किया।",
  correctAsk: (label: string) => `ठीक है, सही ${label} बताइए।`,
  againAsk: (label: string) => `ठीक है, ${label} दोबारा बताइए।`,
  navPausedFir: (label: string) => `ठीक है, ${label} खोल रहे हैं। FIR बाद में जारी रख सकते हैं।`,
  navAbandonSos: (label: string) => `ठीक है, ${label} खोल रहे हैं। SOS नहीं भेजा गया।`,
  resumeFir: (q: string) => `ठीक है, FIR वहीं से जारी रखते हैं। ${q}`,
  firReadyForSummary: "सारी जानकारी मिल गई।",
  // Intake wizard (after the report form is submitted)
  wizMethod: "रिपोर्ट सेव हो गई। अब बयान दर्ज करना है — लिखित बयान के साथ आगे बढ़ें?",
  wizConsent: "ऑडियो या वीडियो रिकॉर्डिंग के लिए व्यक्ति की सहमति ज़रूरी है। कृपया उनसे पूछकर स्क्रीन पर सहमति दर्ज करें।",
  wizCapture: "बयान भर दिया गया है। सेव करके transcript review पर चलें?",
  wizCaptureSaved: "बयान सेव हो गया। अब transcript review पर चलें?",
  wizTranscriptAsk: "क्या मैं बयान पढ़कर सुनाऊँ?",
  wizReadback: (text: string) => `बयान है: ${text}। क्या यह सही है? पुष्टि करके आगे बढ़ें?`,
  wizTranscriptConfirm: "ठीक है। बयान की पुष्टि करके आगे बढ़ें?",
  wizTranscriptNoText: "कृपया स्क्रीन पर बयान पढ़कर व्यक्ति को सुनाइए। पुष्टि करके आगे बढ़ें?",
  wizDraft: "अब FIR का ड्राफ्ट बना दूँ? यह सिर्फ़ ड्राफ्ट होगा — अधिकारी इसकी समीक्षा करेंगे।",
  wizReview: "ड्राफ्ट तैयार है। समीक्षा अधिकृत अधिकारी ही करेंगे। समीक्षा खोलूँ? साफ़ 'हाँ' कहिए।",
  wizCase: "क्या case बना दूँ? यह स्थायी रिकॉर्ड बनेगा। साफ़ 'हाँ' कहिए।",
  wizComplete: "रिपोर्ट पूरी हो गई, case बन गया। और कुछ?",
  wizAdvancing: "ठीक है, आगे बढ़ रहे हैं।",
  wizStay: "ठीक है, यहीं रुकते हैं। जब चाहें 'आगे बढ़ो' कहिए।",
  wizAdvanceFailed: "आगे बढ़ने में दिक्कत आई। कृपया स्क्रीन पर देखिए।",
  wizNeedExplicit: "यह ज़रूरी कदम है — आगे बढ़ने के लिए साफ़ 'हाँ' कहिए, या 'नहीं' कहिए।",
  langSwitched: "ठीक है, अब हिंदी में बात करते हैं। बताइए क्या करना है?",
};

export type Phrases = typeof SAY_HI;

/** Hindi phrases (default). */
export const SAY: Phrases = SAY_HI;

/** English phrases — natural, concise, police-desk tone. */
export const SAY_EN: Phrases = {
  greet: (name: string) =>
    `Hello ${name}, I'm your FirstRecord assistant. What would you like to do? File a new FIR, look up a case, or send an SOS?`,
  navigate: (label: string) => `Sure, opening ${label}.`,
  openCase: (q: string) => `Sure, opening case ${q}.`,
  openCaseInfo: (q: string) => `Opening case ${q}. The full details will be on your screen.`,
  askCase: "Which case? Please tell me the case number, for example 'case 15'.",
  caseNotFound: "I couldn't find that case. Please tell me another case number.",
  submitFailed: "There was a problem submitting the form. Please check the screen.",
  cancelled: "Okay, stopped. Anything else?",
  anythingElse: "Anything else?",
  notUnderstood: "Sorry, I didn't catch that.",
  help: "You can say: 'file a new FIR', 'open case 15', or 'send an SOS'.",
  helpOptions: "I can help you file an FIR, open a case, send an SOS, or go to a page — for example, 'go to cases'.",
  goodbye: "Okay, thank you! Call me anytime you need help.",
  firStart: "Okay, let's file a new FIR. I'll fill in the form as we go. What is the complainant's full name?",
  askName: "What is the complainant's full name?",
  askPhone: (name: string) => `Thank you, ${name}. What's the mobile number? Or say 'no number'.`,
  phoneAgain: "I didn't catch the number clearly. Please repeat the ten-digit mobile number.",
  askType: (prefix: string) => `${prefix} What kind of incident was it — theft, fraud, assault, or something lost?`,
  phoneSaved: (digits: string) => `Number ${digits} saved.`,
  phoneSkipped: "Okay, skipping the number.",
  askDate: (type: string) => `Recorded as ${type}. When did it happen? Today, yesterday, or a date?`,
  dateAgain: "I didn't get the date. Please say something like 'today', 'yesterday', or '15 November'.",
  askLocation: (date: string) => `Got it, ${date}. Where did it happen?`,
  askDescription: "Okay. Now briefly tell me what happened.",
  descriptionAgain: "Please tell me a little more about what happened.",
  firSummary: (s: { name: string; type: string; date: string; location: string }) =>
    `Summary: complainant ${s.name}, ${s.type}, ${s.date}, at ${s.location}. Shall I submit the report?`,
  firSubmitted: "The report has been submitted. Your description is being added as the statement in the next step. Anything else?",
  firWhatToChange: "What should I change — the name, number, incident type, date, location, or description?",
  firConfirmAgain: "Say 'yes' to submit the report, or tell me what to change.",
  fixName: "What is the complainant's full name?",
  fixPhone: "What's the correct mobile number?",
  fixType: "What kind of incident was it?",
  fixDate: "When did it happen?",
  fixLocation: "Where did it happen?",
  fixDescription: "Tell me what happened.",
  sosStart: "What should the SOS say? Please speak your message.",
  sosMessageAgain: "Please speak the SOS message.",
  sosAskLocation: "Message added. Tell me the location, or say 'skip'.",
  sosConfirm: "Shall I send the SOS? It will alert all nearby staff.",
  sosMessageChanged: "Message updated.",
  sosConfirmAgain: "To send the SOS, clearly say 'yes' or 'send it' — or say 'no'.",
  sosSent: "The SOS has been sent. Nearby staff are being alerted. Anything else?",
  sosCancelled: "Okay, the SOS is cancelled — nothing was sent. Anything else?",
  firCancelled: "Okay, I haven't submitted the report. The details are still on the screen. Anything else?",
  cancelledAndBye: (what: "sos" | "report") =>
    `Okay, the ${what === "sos" ? "SOS" : "report"} is cancelled. Thank you! Call me anytime you need help.`,
  fieldLabel: {
    name: "name", phone: "mobile number", address: "address", type: "incident type", date: "date", location: "location", description: "description",
  },
  qName: "What is the complainant's full name?",
  qPhone: "What's the mobile number? Or say 'no number'.",
  qAddress: "What's the address? Or say 'skip'.",
  qType: "What kind of incident was it — theft, fraud, assault, or something lost?",
  qDate: "When did it happen? Today, yesterday, or a date?",
  qLocation: "Where did it happen?",
  qDescription: "Now briefly tell me what happened.",
  ackName: (name: string) => `Thank you, ${name}.`,
  ackAddress: "Address saved.",
  ackAddressSkipped: "Okay, skipping the address.",
  ackType: (type: string) => `Recorded as ${type}.`,
  ackDate: (date: string) => `Got it, ${date}.`,
  ackLocation: "Okay.",
  ackDescription: "Description saved.",
  correctAsk: (label: string) => `Okay, tell me the correct ${label}.`,
  againAsk: (label: string) => `Okay, please tell me the ${label} again.`,
  navPausedFir: (label: string) => `Sure, opening ${label}. You can continue the FIR later.`,
  navAbandonSos: (label: string) => `Sure, opening ${label}. The SOS was not sent.`,
  resumeFir: (q: string) => `Okay, let's continue the FIR where we left off. ${q}`,
  firReadyForSummary: "I have everything.",
  wizMethod: "The report is saved. Next is the statement — shall we continue with a written statement?",
  wizConsent: "Audio or video recording needs the person's consent. Please ask them and record the consent on screen.",
  wizCapture: "The statement is filled in. Shall I save it and go to transcript review?",
  wizCaptureSaved: "The statement is saved. Shall we go to transcript review?",
  wizTranscriptAsk: "Shall I read the statement back?",
  wizReadback: (text: string) => `The statement reads: ${text}. Is that correct? Shall I confirm and continue?`,
  wizTranscriptConfirm: "Okay. Shall I confirm the statement and continue?",
  wizTranscriptNoText: "Please read the statement on screen back to the person. Shall I confirm and continue?",
  wizDraft: "Shall I prepare the FIR draft? It will only be a draft — an officer will review it.",
  wizReview: "The draft is ready. Only an authorised officer can review it. Shall I open the review? Please say a clear 'yes'.",
  wizCase: "Shall I create the case? This creates a permanent record. Please say a clear 'yes'.",
  wizComplete: "The report is complete and the case has been created. Anything else?",
  wizAdvancing: "Okay, moving ahead.",
  wizStay: "Okay, we'll stay here. Say 'next' whenever you're ready.",
  wizAdvanceFailed: "I couldn't move to the next step. Please check the screen.",
  wizNeedExplicit: "This is an important step — please say a clear 'yes' to continue, or 'no'.",
  langSwitched: "Sure, I'll speak in English now. What would you like to do?",
};

const phrases = (lang: ReplyLang): Phrases => (lang === "en" ? SAY_EN : SAY_HI);

/* ------------------------------------------------------------ vocabularies */

/** Real intake incident-type values (src/lib/domain/workflow.ts → "incident.types"). */
export const INCIDENT_TYPES = [
  "Theft",
  "Burglary",
  "Vehicle theft",
  "Assault",
  "Cheating / Fraud",
  "Cyber fraud",
  "Missing person",
  "Lost property",
  "Harassment",
  "Property damage",
  "Other",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_TYPE_HI: Record<IncidentType, string> = {
  Theft: "चोरी",
  Burglary: "घर में सेंधमारी",
  "Vehicle theft": "वाहन चोरी",
  Assault: "मारपीट",
  "Cheating / Fraud": "धोखाधड़ी",
  "Cyber fraud": "साइबर धोखाधड़ी",
  "Missing person": "गुमशुदा व्यक्ति",
  "Lost property": "सामान गुम होना",
  Harassment: "उत्पीड़न",
  "Property damage": "संपत्ति का नुकसान",
  Other: "अन्य",
};

export const INCIDENT_TYPE_EN: Record<IncidentType, string> = {
  Theft: "theft",
  Burglary: "burglary",
  "Vehicle theft": "vehicle theft",
  Assault: "assault",
  "Cheating / Fraud": "cheating or fraud",
  "Cyber fraud": "cyber fraud",
  "Missing person": "a missing person",
  "Lost property": "lost property",
  Harassment: "harassment",
  "Property damage": "property damage",
  Other: "other",
};

/** Ordered: more specific patterns first. */
export const INCIDENT_TYPE_PATTERNS: [RegExp, IncidentType][] = [
  [/(साइबर|cyber|online|ऑनलाइन|upi|यूपीआई|otp|ओटीपी|लिंक|link|फ्रॉड कॉल|bank call|बैंक|bank|कार्ड|card|phishing)/, "Cyber fraud"],
  [/(वाहन|गाड़ी|गाडी|बाइक|bike|scooter|स्कूटर|(^|\s)car(\s|$)|कार|motorcycle|vehicle|साइकिल|cycle)/, "Vehicle theft"],
  [/(सेंध|सेंधमारी|burglary|घर में चोरी|ताला तोड़|break ?in|broke into|house theft)/, "Burglary"],
  [/(धोखा|धोखाधड़ी|fraud|फ्रॉड|cheat|ठगी|ठग|scam)/, "Cheating / Fraud"],
  [/(गुमशुदा|लापता|missing person|person missing|child missing|son missing|daughter missing|बच्चा गुम|आदमी गुम|व्यक्ति गुम)/, "Missing person"],
  [/(गुम|खो गया|खो गई|खोया|lost|misplaced|missing|मिल नहीं रहा)/, "Lost property"],
  [/(छीन|snatch|स्नैच|चोरी|theft|चुरा|चोर|पर्स|मोबाइल|फोन|phone|mobile|stolen|steal|robbed|robbery|pickpocket|wallet)/, "Theft"],
  [/(मारपीट|मार पीट|पीटा|मारा|assault|हमला|attack|झगड़ा|लड़ाई|beaten|beat up|(^|\s)hit(\s|$)|fight)/, "Assault"],
  [/(छेड़छाड़|छेड़खानी|उत्पीड़न|harass|परेशान|stalk|पीछा|eve teasing)/, "Harassment"],
  [/(तोड़फोड़|नुकसान|damage|तोड़ दिया|आग|vandal|fire)/, "Property damage"],
];

const NAV_TARGETS: { href: string; hi: string; en: string; words: RegExp }[] = [
  { href: "/online-complaints", hi: "ऑनलाइन शिकायतें", en: "online complaints", words: /(online|ऑनलाइन)\s*(complaints?|कंप्लेंट|कम्प्लेंट|शिकायत)/ },
  { href: "/intake/new", hi: "नई रिपोर्ट", en: "a new report", words: /(new report|नई रिपोर्ट|नया रिपोर्ट|नई report|new रिपोर्ट)/ },
  { href: "/analytics", hi: "रिपोर्ट और विश्लेषण", en: "reports and analytics", words: /(analytics|एनालिटिक्स|विश्लेषण|आंकड़े|आँकड़े|reports? and analytics|रिपोर्ट्स|statistics|stats)/ },
  { href: "/sos", hi: "SOS पेज", en: "the SOS page", words: /(sos|एसओएस|एस ओ एस|emergency page|आपातकाल)/ },
  { href: "/legal", hi: "कानूनी धाराएँ", en: "legal provisions", words: /(legal|लीगल|धारा|धाराएं|धाराएँ|कानून|provisions?|sections? catalogue)/ },
  { href: "/records", hi: "अभिलेख", en: "records", words: /(records?|रिकॉर्ड|रिकार्ड|अभिलेख)/ },
  { href: "/updates", hi: "अपडेट", en: "updates", words: /(updates?|अपडेट|नियम|circulars?|सर्कुलर|सूचना|new rules?)/ },
  { href: "/settings", hi: "सेटिंग्स", en: "settings", words: /(settings?|सेटिंग|सेटिंग्स)/ },
  { href: "/tasks", hi: "कार्य", en: "tasks", words: /(tasks?|टास्क|कार्य|काम की सूची|to ?do)/ },
  { href: "/cases", hi: "cases की सूची", en: "the case list", words: /(cases?|केस|केसेस|मामले|मामलों|मामला)/ },
  { href: "/", hi: "डैशबोर्ड", en: "the dashboard", words: /(dashboard|डैशबोर्ड|डेशबोर्ड|home|होम|overview|ओवरव्यू|मुख्य पेज|मुख्य पृष्ठ|main page)/ },
];

const NAV_VERB = /(जाओ|जाइए|जाएं|चलो|चलिए|ले चलो|खोलो|खोलिए|खोल दो|दिखाओ|दिखाइए|open|go to|go|show|take me|navigate|पर ले|पेज|page)/;

const HINDI_NUMBERS: Record<string, number> = {
  शून्य: 0, ज़ीरो: 0, जीरो: 0, zero: 0, oh: 0,
  एक: 1, one: 1, दो: 2, two: 2, तीन: 3, three: 3, चार: 4, four: 4,
  पांच: 5, पाँच: 5, five: 5, छह: 6, छः: 6, छे: 6, six: 6, सात: 7, seven: 7,
  आठ: 8, eight: 8, नौ: 9, nine: 9, दस: 10, ten: 10,
  ग्यारह: 11, eleven: 11, बारह: 12, twelve: 12, तेरह: 13, thirteen: 13, चौदह: 14, fourteen: 14,
  पंद्रह: 15, पन्द्रह: 15, fifteen: 15, सोलह: 16, sixteen: 16, सत्रह: 17, seventeen: 17,
  अठारह: 18, eighteen: 18, उन्नीस: 19, nineteen: 19, बीस: 20, twenty: 20,
  इक्कीस: 21, बाईस: 22, तेईस: 23, चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27,
  अट्ठाईस: 28, अठ्ठाईस: 28, उनतीस: 29, तीस: 30, thirty: 30, इकतीस: 31, इकत्तीस: 31, बत्तीस: 32,
  तैंतीस: 33, चौंतीस: 34, पैंतीस: 35, छत्तीस: 36, सैंतीस: 37, अड़तीस: 38, उनतालीस: 39,
  चालीस: 40, forty: 40, इकतालीस: 41, बयालीस: 42, तैंतालीस: 43, चवालीस: 44, चौवालीस: 44,
  पैंतालीस: 45, छियालीस: 46, सैंतालीस: 47, अड़तालीस: 48, उनचास: 49, पचास: 50, fifty: 50,
};

const DIGIT_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries(HINDI_NUMBERS).filter(([, n]) => n <= 9).map(([w, n]) => [w, String(n)]),
);

const mon = (alts: string) => new RegExp(`(^|\\s)(${alts})(\\s|$)`);
const MONTHS: [RegExp, number][] = [
  [mon("जनवरी|january|jan"), 1], [mon("फरवरी|फ़रवरी|february|feb"), 2], [mon("मार्च|march|mar"), 3],
  [mon("अप्रैल|अप्रेल|april|apr"), 4], [mon("मई|may"), 5], [mon("जून|june|jun"), 6], [mon("जुलाई|july|jul"), 7],
  [mon("अगस्त|august|aug"), 8], [mon("सितंबर|सितम्बर|september|sept|sep"), 9], [mon("अक्टूबर|अक्तूबर|october|oct"), 10],
  [mon("नवंबर|नवम्बर|november|nov"), 11], [mon("दिसंबर|दिसम्बर|december|dec"), 12],
];
const MONTH_HI = ["", "जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const MONTH_EN = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ---------------------------------------------------------------- helpers */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/(\w)['’](\w)/g, "$1$2") // that's → thats, i'm → im
    .replace(/[।,.?!;:"'“”‘’()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const b = (alts: string) => new RegExp(`(^|\\s)(${alts})(\\s|$)`);

const YES = b(
  "हाँ|हां|हा|हाँजी|हांजी|जी हाँ|जी हां|हाँ जी|हां जी|yes|yeah|yep|ok|okay|ओके|ठीक है|बिल्कुल|बिलकुल|कर दो|आगे बढ़ाओ|आगे बढ़ा दो|बढ़ा दो|भेजो|भेज दो|भेज दीजिए|submit|सबमिट|confirm|कन्फर्म|sure|go ahead|proceed|do it|yes please",
);
const SOS_YES = b("हाँ|हां|हाँजी|हांजी|जी हाँ|जी हां|हाँ जी|हां जी|yes|yeah|भेजो|भेज दो|भेज दीजिए|send|send it|सेंड|confirm|कन्फर्म|go ahead");
const NO = b("नहीं|नही|नहि|no|nope|मत|ना|गलत|ग़लत|wrong|dont|do not|not now");
const CANCEL = b("रुको|रुकिए|रुक जाओ|वापस|cancel|कैंसल|रद्द|रद्द करो|छोड़ो यह|बंद करो यह|never mind|nevermind|go back");
/** "Don't send" anywhere in the SOS flow → cancel the SOS. */
const SOS_ABORT = /(मत भेज|ना भेज|नहीं भेज|भेजना नहीं|भेजो मत|मत करो|रद्द|cancel|कैंसल|रहने दो|रहने दीजिए|नहीं चाहिए|dont send|do not send|never mind|nevermind|(^|\s)stop(\s|$))/;
/** At a yes/no confirmation step these mean NO → cancel the flow. */
const CONFIRM_NO = b("बस|हो गया|नहीं|नही|नहि|no|nope|ना|मत|रहने दो|रहने दीजिए|cancel|कैंसल|रद्द|छोड़ो|छोड़ दो|नहीं चाहिए|stop|dont|do not|never mind|nevermind|not now|no thanks");
/** At a confirmation step these also end the call (after cancelling). */
const CONFIRM_END = b("बस हो गया|हो गया|धन्यवाद|शुक्रिया|thank you|thanks|बस इतना|thats all|im done|i am done|bye|goodbye");
const SKIP = /(छोड़ दो|छोड़ दीजिए|छोड़ो|skip|स्किप|पता नहीं|नहीं पता|नहीं है|नहीं हैं|कोई नहीं|नहीं मालूम|no number|dont have|do not have|not available|none|no phone|dont know|do not know)/;

/** Strong end phrases — honoured even while dictating free text. */
const END_STRONG = new RegExp(
  "(call cut|कॉल कट|कॉल काट|बातचीत बंद)|(^|\\s)(बाय|बाय बाय|bye|bye bye|good ?bye|गुड बाय|अलविदा|cut the call|cut call|end the call|end call|hang up|disconnect)(\\s|$)",
);
/** Soft end phrases — only when the whole utterance is short and we're not dictating. */
const END_SOFT = new RegExp(
  "^(बस|बस इतना|बस इतना ही|बस हो गया|हो गया|हो गया बस|धन्यवाद|शुक्रिया|थैंक यू|thank you|thanks|नहीं कुछ नहीं|कुछ नहीं|नहीं धन्यवाद|नहीं बस|ठीक है धन्यवाद|ठीक है बस|बंद करो|thats all|thats it|done|im done|i am done|no thanks|stop|close|nothing|nothing else|thats all thanks|ok thanks|okay thanks)( जी)?( धन्यवाद)?( so much| very much| bye)?$",
);

/**
 * Decide the language of one utterance.
 * STT's detected_language_code wins (hi-IN → hi, en-IN → en). Only without it do we fall back to script:
 * English if ≥ 75% of letters are Latin (Hindi STT output is often code-mixed, e.g. "मेरा phone चोरी हो गया").
 */
export function detectReplyLang(transcript: string, sttLang?: string): ReplyLang {
  if (sttLang) {
    if (/^en/i.test(sttLang)) return "en";
    if (/^hi/i.test(sttLang)) return "hi";
  }
  // Word-based ratio (Devanagari vowel signs make letter counts unfair). SOS / FIR / case are not a signal.
  const words = transcript
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !/^(sos|fir|cases?|cnt)$/.test(w.replace(/[^a-z]/g, "")));
  const latin = words.filter((w) => /[a-z]/.test(w) && !/[\u0900-\u097F]/.test(w)).length;
  const deva = words.filter((w) => /[\u0900-\u097F]/.test(w)).length;
  return latin + deva > 0 && latin / (latin + deva) >= 0.75 ? "en" : "hi";
}

const EXPLICIT_EN = /(english में|इंग्लिश में|अंग्रेज़ी में|अंग्रेजी में|in english|speak english|english please|talk in english|english bolo|english mein)/;
const EXPLICIT_HI = /(हिंदी में|हिन्दी में|in hindi|speak hindi|hindi please|talk in hindi|hindi mein|hindi me)/;

function displayName(name: string, lang: ReplyLang): string {
  if (lang === "hi" && /hackathon\s*judges?/i.test(name)) return "हैकाथॉन जजेस";
  return name;
}

/** Extract a number (digits or Hindi/English number words, 0–50). */
export function parseNumber(t: string): number | null {
  const digits = t.match(/\d+/g);
  if (digits) return Number(digits[digits.length - 1]);
  for (const w of t.split(" ")) if (w in HINDI_NUMBERS && w !== "oh") return HINDI_NUMBERS[w];
  return null;
}

/** Turn spoken phone digits into a digit string ("नौ आठ 7 6..." / "nine eight seven..." → "9876..."). */
export function parseDigits(t: string): string {
  return t
    .split(" ")
    .map((w) => (/^\d+$/.test(w) ? w : DIGIT_WORDS[w] ?? (w === "डबल" || w === "double" ? "×2" : w === "ट्रिपल" || w === "triple" ? "×3" : "")))
    .join(" ")
    .replace(/×(\d)\s*(\d)/g, (_, n: string, d: string) => d.repeat(Number(n)))
    .replace(/[^\d]/g, "");
}

const CASE_STOP = new Set([
  "केस", "case", "cases", "मामला", "मामले", "fir", "एफआईआर", "वाला", "वाली", "वाले", "खोलो", "खोलिए", "खोल", "दो", "open", "के", "की", "का",
  "बारे", "में", "बताओ", "बताइए", "मुझे", "दिखाओ", "दिखाइए", "show", "नंबर", "number", "जानकारी", "details", "about", "the", "please",
  "प्लीज़", "प्लीज", "जरा", "ज़रा", "उस", "इस", "पर", "जाओ", "एक", "कौन", "सा", "वो", "यह", "ये", "है", "कोई", "चाहिए", "जानना", "देखना",
  "what", "whats", "is", "of", "status", "tell", "me", "about", "info", "information", "i", "want", "to", "see", "a", "an", "for", "can", "you",
  "pull", "up", "bring", "find", "check", "on", "that", "this", "one", "go", "need", "know", "regarding",
]);

/** Case reference query from an utterance: number → 5-digit fragment; else keywords; null if nothing usable. */
export function parseCaseQuery(t: string): string | null {
  const ref = t.match(/(?:cnt|सीएनटी)\s*\/?\s*(\d{4})\s*\/?\s*(\d{1,5})/);
  if (ref) return ref[2].padStart(5, "0");
  const n = parseNumber(t);
  if (n !== null && !/(^|\s)(2026|2025|2027)(\s|$)/.test(String(n))) return String(n).padStart(5, "0");
  const words = t.split(" ").filter((w) => w.length > 1 && !CASE_STOP.has(w));
  return words.length ? words.join(" ") : null;
}

export interface SpokenDate {
  iso: string;
  hi: string;
  en: string;
}

/** Parse a spoken date relative to `now` → { iso: YYYY-MM-DD, hi, en }. */
export function parseDate(t: string, now: Date): SpokenDate | null {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = day(now);
  const minus = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  if (/(परसों|day before yesterday)/.test(t)) return { iso: iso(minus(2)), hi: "परसों", en: "the day before yesterday" };
  if (/(^|\s)(आज|today|अभी|this morning|tonight|this evening)(\s|$)/.test(t)) return { iso: iso(today), hi: "आज", en: "today" };
  if (/(^|\s)(कल|yesterday|बीती रात|कल रात|last night)(\s|$)/.test(t)) return { iso: iso(minus(1)), hi: "कल", en: "yesterday" };
  const ago = t.match(/(\S+)\s*(दिन|days?)\s*(पहले|ago)/);
  if (ago) {
    const n = parseNumber(ago[1]);
    if (n !== null && n <= 365) return { iso: iso(minus(n)), hi: `${n} दिन पहले`, en: `${n} day${n === 1 ? "" : "s"} ago` };
  }
  if (/(पिछले हफ्ते|पिछले हफ़्ते|last week)/.test(t)) return { iso: iso(minus(7)), hi: "पिछले हफ्ते", en: "last week" };
  const slash = t.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?/);
  let d: number | null = null;
  let m: number | null = null;
  let y: number | null = null;
  if (slash) {
    d = Number(slash[1]); m = Number(slash[2]); y = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : null;
  } else {
    for (const [re, mm] of MONTHS) if (re.test(t)) { m = mm; break; }
    if (m !== null) {
      const year = t.match(/(20\d{2})/);
      if (year) y = Number(year[1]);
      const rest = t.replace(/20\d{2}/, " ").replace(/(\d+)(st|nd|rd|th)/g, "$1");
      d = parseNumber(rest);
    }
  }
  if (d === null || m === null || d < 1 || d > 31 || m < 1 || m > 12) return null;
  let date = new Date(y ?? today.getFullYear(), m - 1, d);
  if (y === null && date > today) date = new Date(today.getFullYear() - 1, m - 1, d);
  const dd = date.getDate();
  const mm = date.getMonth() + 1;
  return { iso: iso(date), hi: `${dd} ${MONTH_HI[mm]} ${date.getFullYear()}`, en: `${dd} ${MONTH_EN[mm]} ${date.getFullYear()}` };
}

export function matchIncidentType(t: string): IncidentType | null {
  for (const [re, type] of INCIDENT_TYPE_PATTERNS) if (re.test(t)) return type;
  return null;
}

const NAME_FILLER = new Set([
  "मेरा", "मेरी", "नाम", "है", "हूँ", "हूं", "जी", "उनका", "इनका", "शिकायतकर्ता", "का", "की",
  "my", "name", "is", "i", "am", "im", "its", "it", "this", "the", "complainants", "complainant", "his", "her", "full",
]);
function cleanName(raw: string): string {
  return raw
    .replace(/['’]/g, "")
    .replace(/[।,.?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => !NAME_FILLER.has(w.toLowerCase()))
    .map((w) => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function cleanFree(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function cleanLocation(raw: string): string {
  return cleanFree(
    raw
      .replace(/^(घटना|यह|ये)?\s*(जगह|स्थान)?\s*/i, "")
      .replace(/^(it\s+)?(happened\s+|was\s+|took place\s+)?(at|in)\s+/i, "")
      .replace(/\s*(पर|में)?\s*(हुई|हुआ|हुई थी|हुआ था)\s*$/, ""),
  );
}

const fill = (field: VoiceField, value: string): VoiceAction => ({ type: "fill", field, value });

/* ---------------------------------------------------------------- state */

/**
 * The real new-report form (src/components/intake/intake-form.tsx), modelled as an ordered field list.
 * `ask: false` fields are optional and only filled when the user states them (e.g. "पता … है").
 * The statement/description lives on the next page, so it is filled right after submit.
 */
type FirSlot = "name" | "phone" | "address" | "type" | "date" | "location" | "description";
export const FIR_FIELDS: { slot: FirSlot; field: VoiceField; ask: boolean; alias: RegExp }[] = [
  { slot: "name", field: "report.speakerName", ask: true, alias: /(नाम|name|complainant|शिकायतकर्ता)/ },
  { slot: "phone", field: "report.speakerContact", ask: true, alias: /(फोन|फ़ोन|मोबाइल|नंबर|contact|phone|mobile|number)/ },
  { slot: "address", field: "report.speakerAddress", ask: false, alias: /(पता|address)/ },
  { slot: "type", field: "report.incidentType", ask: true, alias: /(प्रकार|type|category|किस्म|किस तरह|kind)/ },
  { slot: "date", field: "report.incidentDate", ask: true, alias: /(तारीख|तिथि|date|कब|when)/ },
  { slot: "location", field: "report.incidentLocation", ask: true, alias: /(जगह|स्थान|location|कहाँ|कहां|where|place)/ },
  { slot: "description", field: "report.statement", ask: true, alias: /(क्या हुआ|बयान|description|विवरण|statement|what happened)/ },
];
const fieldOf = (slot: FirSlot) => FIR_FIELDS.find((f) => f.slot === slot)!;

type SosSlot = "message" | "location" | "confirm";

interface FirState {
  mode: "fir";
  slot: FirSlot | "confirm";
  /** Collected values. phone/address "" = explicitly skipped. type = IncidentType value, date = ISO. */
  data: Partial<Record<FirSlot, string>>;
  spokenDate?: SpokenDate;
  /** Slots in the order they were answered (for "पिछला बदलो / go back"). */
  history: FirSlot[];
  /** True once the user has been seen on /intake/new during this FIR (enables auto-pause when they leave). */
  seenForm?: boolean;
}

type State =
  | { mode: "idle" }
  | { mode: "awaitCase"; info: boolean }
  | FirState
  | { mode: "sos"; slot: SosSlot; correcting: boolean; data: { message?: string; location?: string } }
  | WizardState;

/** The intake wizard after the report form: method → (consent) → capture → transcript → draft → review → case → complete. */
interface WizardState {
  mode: "wizard";
  /** Statement text collected in the FIR flow (for read-back), if known. */
  statement?: string;
  step?: string;
  awaiting: "advance" | "readback" | null;
}

const FREE_TEXT_SLOTS = new Set<string>(["name", "address", "location", "description", "message"]);
/** Slots where we never switch reply language (names/numbers are not language signals). */
const NO_LANG_SWITCH_SLOTS = new Set<string>(["name", "phone", "address"]);

const WRONG = /(गलत|ग़लत|बदलो|बदलिए|बदल दो|बदलना|change|wrong|incorrect|सही करो|ठीक करो|fix|correct|update)/;
const BACK = /(^|\s)(वापस|पिछला|पिछली|पिछले|previous|go back|back)(\s|$)/;
const RESUME = /((fir|एफआईआर|रिपोर्ट|report|form|फॉर्म).*(जारी|continue|resume|आगे))|((जारी|continue|resume).*(fir|एफआईआर|रिपोर्ट|report|form|फॉर्म))|^(continue|resume|जारी रखो|जारी रखिए)$/;
const NEXT = /(^|\s)(आगे बढ़ो|आगे बढ़िए|आगे बढ़ाओ|आगे चलो|अगला|अगले|अगला स्टेप|next|continue|proceed|move on)(\s|$)/;
const STRICT_YES = /(^|\s)(हाँ|हां|हाँजी|हांजी|जी हाँ|जी हां|हाँ जी|हां जी|yes|yeah|yes please|confirm|कन्फर्म|बिल्कुल|बिलकुल|definitely)(\s|$)/;
/** Wizard steps that record a confirmation or create records — need an explicit "हाँ / yes". */
const CONSEQUENTIAL_STEPS = new Set(["transcript", "review", "case"]);
const STRICT_NAV_VERB = /(^|\s)(जाओ|जाइए|जाएं|चलो|चलिए|ले चलो|खोलो|खोलिए|खोल दो|open|go to|go|take me to|take me|navigate to|show me)(\s|$)/;

/* ---------------------------------------------------------------- dialog */

export function createDialog(ctx: DialogContext, opts: { now?: () => Date } = {}): Dialog {
  const now = opts.now ?? (() => new Date());
  let state: State = { mode: "idle" };
  let paused: FirState | null = null;
  let needsRefill = false;
  let misses = 0;
  let lang: ReplyLang = ctx.lang === "en" ? "en" : "hi";

  const S = () => phrases(lang);
  const turn = (say: string, actions: VoiceAction[] = [], expectReply = true): DialogTurn => ({ say, actions, expectReply, lang });

  let otherLangStreak = 0;
  /** Returns true when the utterance was an explicit language request. */
  const updateLang = (raw: string, t: string, sttLang?: string): boolean => {
    if (EXPLICIT_EN.test(t)) { lang = "en"; otherLangStreak = 0; return true; }
    if (EXPLICIT_HI.test(t)) { lang = "hi"; otherLangStreak = 0; return true; }
    const slot = state.mode === "fir" || state.mode === "sos" ? state.slot : "";
    if (NO_LANG_SWITCH_SLOTS.has(slot)) return false;
    // Never switch on short replies (हाँ / नहीं / yes / no / ok / numbers / names).
    if (raw.trim().split(/\s+/).length < 3 || !/[a-z\u0900-\u097F]{2,}/i.test(raw)) return false;
    const detected = detectReplyLang(raw, sttLang);
    if (detected === lang) { otherLangStreak = 0; return false; }
    otherLangStreak++;
    if (otherLangStreak >= 2) { lang = detected; otherLangStreak = 0; }
    return false;
  };

  const navTo = (href: string, label: string, say?: string): DialogTurn =>
    turn(say ?? S().navigate(label), [{ type: "fly", to: { kind: "nav", href } }, { type: "navigate", href }]);

  const openCase = (q: string, info: boolean): DialogTurn => {
    state = { mode: "idle" };
    const spoken = /^\d+$/.test(q) ? String(Number(q)) : q;
    return turn(info ? S().openCaseInfo(spoken) : S().openCase(spoken), [
      { type: "fly", to: { kind: "nav", href: "/cases" } },
      { type: "openCase", query: q },
    ]);
  };

  const end = (): DialogTurn => {
    state = { mode: "idle" };
    paused = null;
    return turn(S().goodbye, [{ type: "fly", to: { kind: "home" } }, { type: "end" }], false);
  };

  const cancelAndEnd = (what: "sos" | "report"): DialogTurn => {
    state = { mode: "idle" };
    paused = null;
    return turn(S().cancelledAndBye(what), [{ type: "fly", to: { kind: "home" } }, { type: "end" }], false);
  };

  /* ----------------------------------------------------------- FIR engine */

  const typeLabel = (t: IncidentType) => (lang === "en" ? INCIDENT_TYPE_EN[t] : INCIDENT_TYPE_HI[t]);
  const dateLabel = (d: SpokenDate) => (lang === "en" ? d.en : d.hi);
  const label = (slot: FirSlot) => S().fieldLabel[slot];

  const question = (slot: FirSlot): string => {
    const P = S();
    return { name: P.qName, phone: P.qPhone, address: P.qAddress, type: P.qType, date: P.qDate, location: P.qLocation, description: P.qDescription }[slot];
  };

  const nextMissing = (f: FirState): FirSlot | null =>
    FIR_FIELDS.find((x) => x.ask && f.data[x.slot] === undefined)?.slot ?? null;

  /** Fill actions for everything already collected (page reload / resume). Statement is filled after submit. */
  const refills = (f: FirState): VoiceAction[] =>
    FIR_FIELDS.filter((x) => x.slot !== "description" && f.data[x.slot]).map((x) => fill(x.field, f.data[x.slot]!));

  const summary = (f: FirState, prefix = "", actions: VoiceAction[] = []): DialogTurn => {
    f.slot = "confirm";
    const type = f.data.type as IncidentType | undefined;
    const say = S().firSummary({
      name: f.data.name || "—",
      type: type ? typeLabel(type) : "—",
      date: f.spokenDate ? dateLabel(f.spokenDate) : "—",
      location: f.data.location || "—",
    });
    return turn(`${prefix} ${say}`.trim(), [...actions, { type: "fly", to: { kind: "submit", form: "report" } }]);
  };

  /** Move to the next missing slot (or the summary) after an answer. */
  const advance = (f: FirState, ack: string, actions: VoiceAction[]): DialogTurn => {
    const n = nextMissing(f);
    if (!n) return summary(f, ack, actions);
    f.slot = n;
    return turn(`${ack} ${question(n)}`.trim(), actions);
  };

  /** Store a value; returns the fill (+ fly) actions only if the value changed. */
  const store = (f: FirState, slot: FirSlot, value: string): VoiceAction[] => {
    const changed = f.data[slot] !== value;
    f.data[slot] = value;
    f.history = [...f.history.filter((x) => x !== slot), slot];
    if (!changed || slot === "description" || value === "") return [];
    const field = fieldOf(slot).field;
    return [{ type: "fly", to: { kind: "field", field } }, fill(field, value)];
  };

  type Parsed = { ok: true; value: string; ack: string; date?: SpokenDate } | { ok: false; reprompt: string };

  /** Parse an answer for a specific slot. */
  const parseSlot = (slot: FirSlot, t: string, raw: string): Parsed => {
    const P = S();
    switch (slot) {
      case "name": {
        const name = cleanName(raw);
        return name ? { ok: true, value: name, ack: P.ackName(name) } : { ok: false, reprompt: P.qName };
      }
      case "phone": {
        if (SKIP.test(t)) return { ok: true, value: "", ack: P.phoneSkipped };
        const digits = parseDigits(t);
        const phone = digits.length > 10 && digits.startsWith("91") ? digits.slice(-10) : digits;
        if (phone.length < 10 || phone.length > 12) return { ok: false, reprompt: P.phoneAgain };
        return { ok: true, value: phone, ack: P.phoneSaved(phone.split("").join(" ")) };
      }
      case "address": {
        if (SKIP.test(t)) return { ok: true, value: "", ack: P.ackAddressSkipped };
        const addr = cleanFree(raw);
        return addr ? { ok: true, value: addr, ack: P.ackAddress } : { ok: false, reprompt: P.qAddress };
      }
      case "type": {
        const type = matchIncidentType(t) ?? "Other";
        return { ok: true, value: type, ack: P.ackType(typeLabel(type)) };
      }
      case "date": {
        const d = parseDate(t, now());
        return d ? { ok: true, value: d.iso, ack: P.ackDate(dateLabel(d)), date: d } : { ok: false, reprompt: P.dateAgain };
      }
      case "location": {
        const loc = cleanLocation(raw);
        return loc ? { ok: true, value: loc, ack: P.ackLocation } : { ok: false, reprompt: P.qLocation };
      }
      case "description": {
        const text = cleanFree(raw);
        return text.split(" ").length >= 3 ? { ok: true, value: text, ack: P.ackDescription } : { ok: false, reprompt: P.descriptionAgain };
      }
    }
  };

  /**
   * Direct value statements at any time: "नाम रमेश कुमार है", "my name is Ramesh", "फोन नंबर 98765 43210 है",
   * "जगह सदर बाज़ार है", "तारीख कल की है", "address is …". Returns the slot + raw value text, or null.
   */
  const directStatement = (tc: string): { slot: FirSlot; text: string } | null => {
    const words = tc.split(" ").length;
    if (words > 14) return null;
    const lead = "(?:मेरा|मेरी|उनका|उनकी|इनका|शिकायतकर्ता का|शिकायतकर्ता की|घटना का|घटना की|my|the|his|her|their|complainants|complainant s|incident)?\\s*";
    const tailHi = "\\s*(?:है|हैं|हूँ|हूं|थी|था|की है|का है|को)?$";
    const patterns: [FirSlot, RegExp][] = [
      ["name", new RegExp(`^${lead}(?:नाम|name)\\s*(?:है|is|was)?\\s+(.+?)${tailHi}`, "i")],
      ["phone", new RegExp(`^${lead}(?:फोन|फ़ोन|मोबाइल|contact|phone|mobile)?\\s*(?:नंबर|number|no)\\s*(?:है|is|was)?\\s+(.+?)${tailHi}`, "i")],
      ["address", new RegExp(`^${lead}(?:पता|address)\\s*(?:है|is|was)?\\s+(.+?)${tailHi}`, "i")],
      ["type", new RegExp(`^${lead}(?:प्रकार|type|category)\\s*(?:है|is|was)?\\s+(.+?)${tailHi}`, "i")],
      ["date", new RegExp(`^${lead}(?:तारीख|तिथि|date)\\s*(?:है|is|was)?\\s+(.+?)${tailHi}`, "i")],
      ["location", new RegExp(`^${lead}(?:जगह|स्थान|location|place)\\s*(?:है|is|was)?\\s+(.+?)${tailHi}`, "i")],
    ];
    for (const [slot, re] of patterns) {
      const m = tc.match(re);
      if (m && m[1].trim()) return { slot, text: m[1].trim() };
    }
    return null;
  };

  const correctionTarget = (t: string, atConfirm: boolean): FirSlot | null => {
    if (t.split(" ").length > 9) return null;
    const hasWrong = WRONG.test(t);
    if (!hasWrong && !atConfirm) return null;
    // Prefer the most specific alias (phone before name: "नाम वाला नंबर" is rare; "नंबर" wins only without "नाम").
    for (const f of FIR_FIELDS) if (f.alias.test(t) && (hasWrong || t.split(" ").length <= 5)) return f.slot;
    return null;
  };

  const startFir = (): DialogTurn => {
    if (paused) return resumeFir(true);
    state = { mode: "fir", slot: "name", data: {}, history: [] };
    needsRefill = false;
    return turn(S().firStart, [
      { type: "fly", to: { kind: "nav", href: "/intake/new" } },
      { type: "navigate", href: "/intake/new" },
    ]);
  };

  const resumeFir = (navigate: boolean): DialogTurn => {
    const f = paused ?? (state.mode === "fir" ? state : null);
    if (!f) return startFir();
    paused = null;
    state = f;
    needsRefill = false;
    const q = f.slot === "confirm" ? summary(f).say : question(f.slot);
    const nav: VoiceAction[] = navigate
      ? [{ type: "fly", to: { kind: "nav", href: "/intake/new" } }, { type: "navigate", href: "/intake/new" }]
      : [];
    return turn(S().resumeFir(q), [...nav, ...refills(f)]);
  };

  const handleFir = (f: FirState, t: string, raw: string, tc: string): DialogTurn => {
    const atConfirm = f.slot === "confirm";

    // 1) confirmation step: yes submits; corrections; end / no cancel
    if (atConfirm && YES.test(t) && !NO.test(t) && !CONFIRM_NO.test(t) && !WRONG.test(t)) {
      const description = f.data.description ?? "";
      state = { mode: "wizard", statement: description || undefined, step: "intake", awaiting: null };
      return turn(S().firSubmitted, [{ type: "submit", form: "report" }, ...(description ? [fill("report.statement", description)] : [])]);
    }

    // 2) "पिछला बदलो / previous / वापस" → re-ask the previous slot only
    if (BACK.test(t) && t.split(" ").length <= 5) {
      const prev = atConfirm ? f.history[f.history.length - 1] : [...f.history].reverse().find((x) => x !== f.slot);
      if (prev) {
        f.slot = prev;
        return turn(S().againAsk(label(prev)));
      }
      return turn(atConfirm ? summary(f).say : question(f.slot as FirSlot));
    }

    // 3) corrections: "नाम गलत है", "change the phone number", "नहीं नाम गलत हो गया है"
    const target = correctionTarget(t, atConfirm);
    if (target) {
      f.slot = target;
      return turn(S().correctAsk(label(target)));
    }

    // 4) direct value statements for any field
    const direct = directStatement(tc);
    if (direct) {
      const dn = normalize(direct.text);
      const parsed = parseSlot(direct.slot, dn, direct.text);
      if (parsed.ok && !(direct.slot === "phone" && parsed.value === "")) {
        if (parsed.date) f.spokenDate = parsed.date;
        const actions = store(f, direct.slot, parsed.value);
        return advance(f, parsed.ack, actions);
      }
    }

    if (atConfirm) {
      if (CONFIRM_END.test(t)) return cancelAndEnd("report");
      if (CONFIRM_NO.test(t) || NO.test(t)) {
        state = { mode: "idle" };
        return turn(S().firCancelled);
      }
      return turn(S().firConfirmAgain);
    }

    // 5) plain answer for the slot being asked — fills only that field
    const slot = f.slot as FirSlot;
    const parsed = parseSlot(slot, t, raw);
    if (!parsed.ok) return turn(parsed.reprompt);
    if (parsed.date) f.spokenDate = parsed.date;
    const actions = store(f, slot, parsed.value);
    return advance(f, parsed.ack, actions);
  };

  /* ----------------------------------------------------------- SOS engine */

  const startSos = (): DialogTurn => {
    state = { mode: "sos", slot: "message", correcting: false, data: {} };
    return turn(S().sosStart, [
      { type: "fly", to: { kind: "nav", href: "/sos" } },
      { type: "navigate", href: "/sos" },
    ]);
  };

  const handleSos = (s: Extract<State, { mode: "sos" }>, t: string, raw: string): DialogTurn => {
    if (s.slot !== "message" && SOS_ABORT.test(t)) {
      state = { mode: "idle" };
      return turn(S().sosCancelled);
    }
    if (s.slot === "message" && /(^|\s)(मत भेजो|sos मत भेजो|रद्द करो|cancel करो|cancel|dont send|do not send|cancel the sos|cancel sos)(\s|$)/.test(t)) {
      state = { mode: "idle" };
      return turn(S().sosCancelled);
    }
    switch (s.slot) {
      case "message": {
        const msg = cleanFree(raw);
        if (msg.split(" ").length < 2) return turn(S().sosMessageAgain);
        s.data.message = msg;
        const title = msg.split(" ").slice(0, 6).join(" ").slice(0, 110);
        const actions: VoiceAction[] = [
          { type: "fly", to: { kind: "field", field: "sos.message" } },
          fill("sos.title", title),
          fill("sos.message", msg),
        ];
        if (s.correcting) {
          s.slot = "confirm";
          s.correcting = false;
          return turn(`${S().sosMessageChanged} ${S().sosConfirm}`, [...actions, { type: "fly", to: { kind: "submit", form: "sos" } }]);
        }
        s.slot = "location";
        return turn(S().sosAskLocation, actions);
      }
      case "location": {
        s.slot = "confirm";
        if (SKIP.test(t) || (NO.test(t) && t.split(" ").length <= 2)) return turn(S().sosConfirm, [{ type: "fly", to: { kind: "submit", form: "sos" } }]);
        const loc = cleanLocation(raw);
        s.data.location = loc;
        return turn(S().sosConfirm, [
          { type: "fly", to: { kind: "field", field: "sos.locationText" } },
          fill("sos.locationText", loc),
          { type: "fly", to: { kind: "submit", form: "sos" } },
        ]);
      }
      case "confirm": {
        if (/((संदेश|मैसेज|message)\s*(बदलो|बदलिए|बदल दो|change))|(change (the )?message)|(edit (the )?message)/.test(t)) {
          s.slot = "message";
          s.correcting = true;
          return turn(S().sosMessageAgain);
        }
        if (CONFIRM_END.test(t)) return cancelAndEnd("sos");
        if (CONFIRM_NO.test(t) || NO.test(t)) {
          state = { mode: "idle" };
          return turn(S().sosCancelled);
        }
        if (SOS_YES.test(t)) {
          state = { mode: "idle" };
          return turn(S().sosSent, [{ type: "submit", form: "sos" }]);
        }
        return turn(S().sosConfirmAgain);
      }
    }
  };

  /* -------------------------------------------------------- intake wizard */

  const baseStep = (step: string) => step.split(":")[0];

  /** Prompt for a wizard step; sets what we're waiting for. */
  const wizardPrompt = (w: WizardState, step: string): DialogTurn | null => {
    const P = S();
    w.step = step;
    switch (step) {
      case "method": w.awaiting = "advance"; return turn(P.wizMethod);
      case "consent": w.awaiting = null; return turn(P.wizConsent);
      case "capture": w.awaiting = "advance"; return turn(P.wizCapture);
      case "capture:saved": w.awaiting = "advance"; return turn(P.wizCaptureSaved);
      case "transcript": w.awaiting = "readback"; return turn(P.wizTranscriptAsk);
      case "draft": w.awaiting = "advance"; return turn(P.wizDraft);
      case "review": w.awaiting = "advance"; return turn(P.wizReview);
      case "case": w.awaiting = "advance"; return turn(P.wizCase);
      case "complete": state = { mode: "idle" }; return turn(P.wizComplete);
      default: return null; // "intake" = the report form (FIR flow)
    }
  };

  const wizardAdvance = (w: WizardState, step: string): DialogTurn => {
    w.awaiting = null;
    return turn(S().wizAdvancing, [{ type: "advanceIntake", step: baseStep(step) }]);
  };

  /** Handle an utterance on an intake wizard page; null = not a wizard answer (fall through to global intents). */
  const handleWizard = (w: WizardState, t: string, step: string): DialogTurn | null => {
    const P = S();
    const base = baseStep(step);
    const consequential = CONSEQUENTIAL_STEPS.has(base);
    const no = NO.test(t) || CONFIRM_NO.test(t);

    if (base === "complete") return wizardPrompt(w, "complete");
    if (base === "consent" && (NEXT.test(t) || YES.test(t))) return turn(P.wizConsent);

    if (w.awaiting === "readback") {
      if (YES.test(t) && !no) {
        w.awaiting = "advance";
        return turn(w.statement ? P.wizReadback(w.statement) : P.wizTranscriptNoText);
      }
      if (no) { w.awaiting = "advance"; return turn(P.wizTranscriptConfirm); }
    }

    if (NEXT.test(t) && !no) {
      if (consequential && !STRICT_YES.test(t)) {
        w.awaiting = "advance";
        return turn(base === "transcript" ? P.wizTranscriptConfirm : base === "review" ? P.wizReview : P.wizCase);
      }
      return wizardAdvance(w, step);
    }

    if (w.awaiting === "advance") {
      const yes = consequential ? STRICT_YES.test(t) : YES.test(t);
      if (yes && !no) return wizardAdvance(w, step);
      if (no) { w.awaiting = null; return turn(P.wizStay); }
      if (consequential && YES.test(t)) return turn(P.wizNeedExplicit);
    }
    return null;
  };

  /* ------------------------------------------------------- global intents */

  /** "<page> (पे|पर|में)? <verb>" in either order — wins at all times, even mid-dictation. */
  const strictNav = (t: string): { href: string; label: string } | null => {
    if (t.split(" ").length > 8 || !STRICT_NAV_VERB.test(t)) return null;
    if (/\d/.test(t) && /(case|केस|मामला|fir|एफआईआर)/.test(t)) return null; // "case 15 खोलो" is a case lookup
    for (const n of NAV_TARGETS) if (n.words.test(t)) return { href: n.href, label: lang === "en" ? n.en : n.hi };
    return null;
  };

  const strictCaseOpen = (t: string): string | null => {
    if (t.split(" ").length > 8) return null;
    if (!/(case|केस|मामला|cnt|सीएनटी)/.test(t) || !/(खोलो|खोलिए|खोल दो|open|दिखाओ|show|status|के बारे)/.test(t)) return null;
    if (parseNumber(t) === null && !/cnt|सीएनटी/.test(t)) return null;
    return parseCaseQuery(t);
  };

  const globalIntent = (t: string): DialogTurn | null => {
    if (paused && (RESUME.test(t))) return resumeFir(true);

    const wantsSend = /(भेज|send|सेंड|मदद|help me|बचाओ|emergency|इमरजेंसी|alert|अलर्ट|raise|trigger)/.test(t);
    const isSos = /(sos|एसओएस|एस ओ एस|emergency|इमरजेंसी|मदद चाहिए|बचाओ|i need help|need backup|send backup)/.test(t);
    if (isSos && (wantsSend || !NAV_VERB.test(t))) return startSos();

    const firWord = /(fir|एफआईआर|एफ आई आर|f i r|रिपोर्ट|report|complaint|कंप्लेंट|कम्प्लेंट|शिकायत)/.test(t);
    const firVerb = /(दर्ज|लिख|book|बुक|करनी|करना|करवानी|file|register|रजिस्टर|नई|नया|new|डालनी|lodge|write|create|make|start|raise)/.test(t);
    const isOnlineList = /(online|ऑनलाइन)/.test(t);
    if (firWord && firVerb && !isOnlineList && !/(के बारे|खोलो|दिखाओ|open|show|status|about)/.test(t)) return startFir();

    const caseWord = /(case|केस|मामला|मामले|fir|एफआईआर|cnt|सीएनटी)/.test(t);
    const infoAsk = /(के बारे|जानकारी|details|बताओ|बताइए|जानना|status|about|tell me|whats|what is|info|information|update on)/.test(t);
    const openAsk = /(खोलो|खोलिए|खोल दो|open|दिखाओ|दिखाइए|show|pull up|bring up|find)/.test(t);
    if (caseWord && (infoAsk || openAsk || /\d/.test(t))) {
      const hasNumber = parseNumber(t) !== null || /cnt|सीएनटी/.test(t);
      const q = parseCaseQuery(t);
      if (hasNumber && q) return openCase(q, infoAsk);
      if (q && (/(वाला|वाली|वाले)/.test(t) || (lang === "en" && openAsk && !/cases/.test(t)))) return openCase(q, infoAsk);
      if (infoAsk || /(किसी|कोई|एक|(^|\s)a(\s|$)|any|some)/.test(t)) {
        state = { mode: "awaitCase", info: infoAsk };
        return turn(S().askCase);
      }
    }

    for (const n of NAV_TARGETS) {
      if (n.words.test(t) && (NAV_VERB.test(t) || t.split(" ").length <= 3)) {
        if (n.href === "/intake/new" && paused) return resumeFir(true);
        return navTo(n.href, lang === "en" ? n.en : n.hi);
      }
    }
    return null;
  };

  return {
    greet() {
      state = { mode: "idle" };
      paused = null;
      misses = 0;
      return turn(S().greet(displayName(ctx.userName, lang)), [{ type: "fly", to: { kind: "center" } }]);
    },

    handle(transcript: string, handleOpts?: { language?: string }): DialogTurn {
      const raw = transcript.trim();
      const t = normalize(raw);
      if (!t) return turn("", []);
      const explicitLang = updateLang(raw, t, handleOpts?.language);
      if (explicitLang && t.replace(EXPLICIT_EN, "").replace(EXPLICIT_HI, "").trim().split(" ").filter((w) => w && !/^(अब|से|बोलो|बोलिए|बात|करो|कीजिए|please|now|to|me|with|आप|मुझसे)$/.test(w)).length === 0) {
        return turn(S().langSwitched);
      }

      // Page tracking: if the user is back on /intake/new after leaving it mid-FIR, refill collected fields once.
      const path = ctx.pathname();
      if (state.mode === "fir" && path === "/intake/new") state.seenForm = true;
      // Left the form by any means (clicked a link, back button) → pause, so answers aren't typed into nothing.
      if (state.mode === "fir" && state.seenForm && path !== "/intake/new") {
        paused = state;
        state = { mode: "idle" };
      }
      const firActive = state.mode === "fir" || paused !== null;
      let prefix: VoiceAction[] = [];
      if (firActive && path !== "/intake/new") needsRefill = true;
      if (path === "/intake/new" && needsRefill) {
        needsRefill = false;
        if (paused && state.mode === "idle") { state = paused; paused = null; }
        if (state.mode === "fir") prefix = refills(state);
      }
      const withPrefix = (r: DialogTurn): DialogTurn => (prefix.length ? { ...r, actions: [...prefix, ...r.actions] } : r);

      const dictating = (state.mode === "fir" || state.mode === "sos") && FREE_TEXT_SLOTS.has(state.slot);
      const confirming = (state.mode === "fir" || state.mode === "sos") && state.slot === "confirm";
      if (END_STRONG.test(t)) {
        if (confirming) return cancelAndEnd(state.mode === "sos" ? "sos" : "report");
        return end();
      }
      if (!dictating && !confirming && END_SOFT.test(t)) return end();

      // Navigation wins at all times — even mid-dictation. The FIR is paused (resumable); an unsent SOS is abandoned.
      if (state.mode === "fir" || state.mode === "sos") {
        const nav = strictNav(t);
        if (nav) {
          if (state.mode === "fir") {
            if (nav.href === "/intake/new") return withPrefix(resumeFir(false));
            paused = state;
            state = { mode: "idle" };
            needsRefill = true;
            return navTo(nav.href, nav.label, S().navPausedFir(nav.label));
          }
          state = { mode: "idle" };
          return navTo(nav.href, nav.label, S().navAbandonSos(nav.label));
        }
        const caseQ = strictCaseOpen(t);
        if (caseQ) {
          if (state.mode === "fir") { paused = state; needsRefill = true; }
          return openCase(caseQ, /(status|के बारे|about)/.test(t));
        }
      }

      // Intake wizard pages (/intake/{id}?step=…): yes / no / next / read-back.
      const wizStep = ctx.intakeStep?.() ?? null;
      const onWizardPage = /^\/intake\/(?!new)[^/]+/.test(path);
      if ((state.mode === "wizard" || (state.mode === "idle" && onWizardPage && wizStep)) && wizStep !== "intake") {
        const nav = strictNav(t);
        if (nav) { state = { mode: "idle" }; return navTo(nav.href, nav.label); }
        const w: WizardState = state.mode === "wizard" ? state : { mode: "wizard", awaiting: null };
        // The page moved on (or we resumed on it) → expectations follow the page's step.
        if (wizStep && w.step !== wizStep) {
          w.step = wizStep;
          const b0 = baseStep(wizStep);
          w.awaiting = b0 === "transcript" ? "readback" : b0 === "consent" || b0 === "complete" ? null : "advance";
        }
        const step = wizStep ?? w.step;
        if (step) {
          const r = handleWizard(w, t, step);
          if (r) {
            if (baseStep(step) !== "complete") state = w;
            misses = 0;
            return r;
          }
        }
      }

      if (state.mode === "fir" && CANCEL.test(t) && !BACK.test(t) && t.split(" ").length <= 4) {
        const msg = state.slot === "confirm" ? S().firCancelled : S().cancelled;
        state = { mode: "idle" };
        return turn(msg);
      }
      if (state.mode === "fir") { misses = 0; return withPrefix(handleFir(state, t, raw, raw.replace(/[।,.?!;:"“”()]/g, " ").replace(/\s+/g, " ").trim())); }

      if (state.mode !== "idle" && CANCEL.test(t) && t.split(" ").length <= 4) {
        const msg = state.mode === "sos" ? S().sosCancelled : S().cancelled;
        state = { mode: "idle" };
        return turn(msg);
      }

      if (state.mode === "sos") { misses = 0; return handleSos(state, t, raw); }
      if (state.mode === "awaitCase") {
        const info = state.info;
        const q = parseCaseQuery(t);
        if (q) { misses = 0; return openCase(q, info); }
      }

      const g = globalIntent(t);
      if (g) { misses = 0; return withPrefix(g); }

      misses++;
      return turn(misses >= 2 ? `${S().notUnderstood} ${S().helpOptions}` : `${S().notUnderstood} ${S().help}`);
    },

    onIntakeStep(step: string) {
      if (state.mode === "fir" || state.mode === "sos" || state.mode === "awaitCase") return null;
      if (step === "intake") return null;
      const w: WizardState = state.mode === "wizard" ? state : { mode: "wizard", awaiting: null };
      if (state.mode !== "wizard") state = w;
      if (w.step === step && w.awaiting !== null) return null; // already prompted for this step
      return wizardPrompt(w, step);
    },

    onActionResult({ action, ok }) {
      if (ok) return null;
      if (action.type === "advanceIntake") return turn(S().wizAdvanceFailed);
      if (action.type === "openCase") {
        state = { mode: "awaitCase", info: false };
        return turn(S().caseNotFound);
      }
      if (action.type === "submit") return turn(S().submitFailed);
      return null;
    },
  };
}
