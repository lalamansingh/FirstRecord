/**
 * Starter catalogue of legal provisions used ONLY to suggest possibly relevant
 * sections to an officer. Summaries are plain-language paraphrases, not the
 * statutory text. Every entry must be verified against the official text by an
 * authorized person before real use. The officer always decides what applies.
 */
import { get, insert, newId, now, update } from "@/lib/db";

export const BNS = "Bharatiya Nyaya Sanhita, 2023";
export const ITA = "Information Technology Act, 2000";
const VERIFY = "Starter catalogue — verify against the official text before use.";
const VERIFY_SUB = `${VERIFY} Sub-section numbering to be confirmed.`;

export interface CatalogEntry {
  code: string;
  act: string;
  section: string;
  title: string;
  titleHi: string;
  summary: string;
  category: string;
  /** Trigger phrases (English and Hindi). Matched case-insensitively against the statement. */
  keywords: string[];
  sourceNote?: string;
}

export const STARTER_CATALOG: CatalogEntry[] = [
  // ---- Property offences
  { code: "BNS 303(2)", act: BNS, section: "303(2)", title: "Theft", titleHi: "चोरी", category: "property",
    summary: "Dishonestly taking movable property out of someone's possession without consent.",
    keywords: ["stolen", "stole", "theft", "was taken", "went missing", "chori", "चोरी", "चुरा", "चुराया", "चुरा लिया", "गायब"] },
  { code: "BNS 304(2)", act: BNS, section: "304(2)", title: "Snatching", titleHi: "छीना-झपटी", category: "property",
    summary: "Theft by suddenly or forcibly seizing property from a person, e.g. a chain or phone snatched on the street.",
    keywords: ["snatched", "snatching", "grabbed my", "pulled my chain", "chain snatch", "छीन", "छीना", "झपट", "झपटा"], sourceNote: VERIFY_SUB },
  { code: "BNS 305", act: BNS, section: "305", title: "Theft in a dwelling house, vehicle or place of worship", titleHi: "घर, वाहन या पूजा स्थल में चोरी", category: "property",
    summary: "Theft committed in a home, building used for custody of property, means of transport or place of worship.",
    keywords: ["stolen from my house", "stolen from home", "from my house", "from the temple", "from my car", "घर से चोरी", "घर से", "मंदिर से", "गाड़ी से"] },
  { code: "BNS 308(2)", act: BNS, section: "308(2)", title: "Extortion", titleHi: "जबरन वसूली", category: "property",
    summary: "Putting a person in fear of injury to dishonestly make them hand over property or money.",
    keywords: ["extortion", "demanded money", "pay or else", "threatened to pay", "hafta", "protection money", "रंगदारी", "वसूली", "पैसे मांगे", "हफ्ता"] },
  { code: "BNS 309(4)", act: BNS, section: "309(4)", title: "Robbery", titleHi: "लूट", category: "property",
    summary: "Theft or extortion accompanied by causing, or threatening, death, hurt or wrongful restraint.",
    keywords: ["robbed", "robbery", "at knifepoint", "at gunpoint", "looted", "लूट", "लूटा", "लूट लिया", "चाकू दिखाकर"] },
  { code: "BNS 310(2)", act: BNS, section: "310(2)", title: "Dacoity", titleHi: "डकैती", category: "property",
    summary: "Robbery committed jointly by five or more persons.",
    keywords: ["dacoity", "gang of five", "group of men robbed", "डकैती", "डाका"] },
  { code: "BNS 314", act: BNS, section: "314", title: "Dishonest misappropriation of property", titleHi: "संपत्ति का बेईमानी से दुर्विनियोग", category: "property",
    summary: "Dishonestly using or converting someone else's movable property for one's own use.",
    keywords: ["misappropriated", "kept my", "refused to return", "वापस नहीं किया", "हड़प"] },
  { code: "BNS 316(2)", act: BNS, section: "316(2)", title: "Criminal breach of trust", titleHi: "आपराधिक न्यासभंग", category: "property",
    summary: "Dishonestly misusing or converting property that was entrusted to a person.",
    keywords: ["entrusted", "breach of trust", "gave him money to keep", "did not return the money", "भरोसे", "अमानत", "विश्वासघात"] },
  { code: "BNS 317(2)", act: BNS, section: "317(2)", title: "Dishonestly receiving stolen property", titleHi: "चोरी की संपत्ति बेईमानी से प्राप्त करना", category: "property",
    summary: "Receiving or keeping property while knowing or having reason to believe it is stolen.",
    keywords: ["stolen goods", "bought stolen", "selling stolen", "चोरी का माल"] },
  { code: "BNS 318(4)", act: BNS, section: "318(4)", title: "Cheating (inducing delivery of property)", titleHi: "छल (संपत्ति सौंपने के लिए प्रेरित करना)", category: "fraud",
    summary: "Deceiving a person to dishonestly make them hand over property or money.",
    keywords: ["cheated", "cheating", "fraud", "duped", "fake promise", "never delivered", "धोखा", "धोखाधड़ी", "ठगी", "ठग", "फ्रॉड"] },
  { code: "BNS 319(2)", act: BNS, section: "319(2)", title: "Cheating by personation", titleHi: "प्रतिरूपण द्वारा छल", category: "fraud",
    summary: "Cheating by pretending to be some other person.",
    keywords: ["pretended to be", "pretending to be", "posing as", "posed as", "impersonating", "impersonated", "claimed to be from the bank", "claiming to be", "claimed to be", "बनकर", "बन कर", "खुद को बताया", "बताकर"] },
  { code: "BNS 324", act: BNS, section: "324", title: "Mischief (damage to property)", titleHi: "रिष्टि (संपत्ति को नुकसान)", category: "property",
    summary: "Intentionally destroying or damaging property causing wrongful loss.",
    keywords: ["damaged", "broke my", "smashed", "set fire", "vandal", "तोड़", "तोड़फोड़", "नुकसान", "आग लगा"], sourceNote: VERIFY_SUB },
  { code: "BNS 329", act: BNS, section: "329", title: "Criminal trespass and house-trespass", titleHi: "आपराधिक अतिचार और गृह-अतिचार", category: "property",
    summary: "Entering or remaining on property, or in a dwelling, unlawfully with intent to commit an offence, intimidate, insult or annoy.",
    keywords: ["trespass", "entered my house", "entered my land", "forced his way in", "barged in", "घर में घुस", "घुस आए", "जबरदस्ती घुस", "कब्जा"], sourceNote: VERIFY_SUB },
  { code: "BNS 331", act: BNS, section: "331", title: "House-breaking", titleHi: "गृह-भेदन (सेंधमारी)", category: "property",
    summary: "House-trespass by breaking in (e.g. a broken lock, window or wall), including at night.",
    keywords: ["broke the lock", "lock was broken", "broke in", "break-in", "burglary", "window was broken", "ताला तोड़", "ताला टूटा", "सेंध", "सेंधमारी"], sourceNote: VERIFY_SUB },
  { code: "BNS 336", act: BNS, section: "336", title: "Forgery", titleHi: "कूटरचना (जालसाजी)", category: "fraud",
    summary: "Making a false document or electronic record with intent to cause damage or support a false claim.",
    keywords: ["forged", "forgery", "fake document", "fake signature", "जाली", "फर्जी दस्तावेज", "नकली हस्ताक्षर"], sourceNote: VERIFY_SUB },

  // ---- Offences affecting the body
  { code: "BNS 103(1)", act: BNS, section: "103(1)", title: "Murder", titleHi: "हत्या", category: "body",
    summary: "Causing death with the intention or knowledge described in the law for murder.",
    keywords: ["murdered", "killed", "murder", "हत्या", "मार डाला", "जान से मार दिया"] },
  { code: "BNS 109", act: BNS, section: "109", title: "Attempt to murder", titleHi: "हत्या का प्रयास", category: "body",
    summary: "Doing an act with intention or knowledge that, if it caused death, would amount to murder.",
    keywords: ["tried to kill", "attempt to kill", "tried to murder", "जान से मारने की कोशिश", "मारने का प्रयास"] },
  { code: "BNS 106(1)", act: BNS, section: "106(1)", title: "Causing death by negligence", titleHi: "उपेक्षा से मृत्यु कारित करना", category: "body",
    summary: "Causing death by a rash or negligent act not amounting to culpable homicide.",
    keywords: ["died in the accident", "death due to negligence", "hit and run", "accident death", "हादसे में मौत", "दुर्घटना में मृत्यु", "लापरवाही से मौत"] },
  { code: "BNS 115(2)", act: BNS, section: "115(2)", title: "Voluntarily causing hurt", titleHi: "स्वेच्छा से उपहति कारित करना", category: "body",
    summary: "Intentionally causing bodily pain, disease or infirmity.",
    keywords: ["beat me", "hit me", "slapped", "punched", "kicked", "injured", "मारा", "मारपीट", "पीटा", "थप्पड़", "चोट"] },
  { code: "BNS 117(2)", act: BNS, section: "117(2)", title: "Voluntarily causing grievous hurt", titleHi: "स्वेच्छा से घोर उपहति कारित करना", category: "body",
    summary: "Intentionally causing serious injury such as a fracture, loss of sight or hearing, or permanent disfigurement.",
    keywords: ["fracture", "broken bone", "lost my eye", "serious injury", "stitches", "हड्डी टूट", "फ्रैक्चर", "गंभीर चोट", "टांके"] },
  { code: "BNS 118(1)", act: BNS, section: "118(1)", title: "Hurt by dangerous weapons or means", titleHi: "खतरनाक हथियार या साधन से उपहति", category: "body",
    summary: "Causing hurt using a weapon, fire, poison, acid or other dangerous means.",
    keywords: ["with a knife", "with a rod", "iron rod", "with a stick", "acid", "stabbed", "चाकू से", "रॉड से", "लाठी से", "डंडे से", "तेजाब"], sourceNote: VERIFY_SUB },
  { code: "BNS 126(2)", act: BNS, section: "126(2)", title: "Wrongful restraint", titleHi: "सदोष अवरोध", category: "body",
    summary: "Obstructing a person so they cannot go where they have a right to go.",
    keywords: ["blocked my way", "stopped me from going", "would not let me go", "रास्ता रोका", "रास्ता रोक", "जाने नहीं दिया"] },
  { code: "BNS 127(2)", act: BNS, section: "127(2)", title: "Wrongful confinement", titleHi: "सदोष परिरोध", category: "body",
    summary: "Restraining a person so they cannot leave a certain area, e.g. locking them in a room.",
    keywords: ["locked me in", "locked in a room", "kept me confined", "held me captive", "कमरे में बंद", "बंद कर दिया", "बंधक"] },
  { code: "BNS 131", act: BNS, section: "131", title: "Assault or criminal force", titleHi: "हमला या आपराधिक बल", category: "body",
    summary: "Using or threatening criminal force against a person (otherwise than on grave and sudden provocation).",
    keywords: ["assaulted", "attacked me", "pushed me", "manhandled", "हमला", "धक्का", "धक्का दिया"] },
  { code: "BNS 137(2)", act: BNS, section: "137(2)", title: "Kidnapping", titleHi: "व्यपहरण (अपहरण)", category: "body",
    summary: "Taking a person out of India, or a child or person of unsound mind away from their lawful guardian, without consent.",
    keywords: ["kidnapped", "kidnap", "abducted", "took my child", "missing child", "अपहरण", "उठा ले गए", "अगवा"] },
  { code: "BNS 140", act: BNS, section: "140", title: "Kidnapping or abduction for ransom or to murder", titleHi: "फिरौती या हत्या के लिए अपहरण", category: "body",
    summary: "Kidnapping or abducting a person for ransom, or in order to murder them, or to compel an act.",
    keywords: ["ransom", "फिरौती"], sourceNote: VERIFY_SUB },
  { code: "BNS 125", act: BNS, section: "125", title: "Act endangering life or personal safety of others", titleHi: "दूसरों के जीवन या सुरक्षा को खतरे में डालना", category: "body",
    summary: "A rash or negligent act that endangers human life or the personal safety of others.",
    keywords: ["endangered", "could have killed", "जान खतरे में"] },
  { code: "BNS 281", act: BNS, section: "281", title: "Rash driving or riding on a public way", titleHi: "सार्वजनिक मार्ग पर उतावलेपन से वाहन चलाना", category: "traffic",
    summary: "Driving or riding on a public road so rashly or negligently as to endanger human life.",
    keywords: ["rash driving", "speeding", "drove fast", "hit my bike", "hit my scooter", "rammed", "तेज रफ्तार", "टक्कर मार", "टक्कर", "लापरवाही से गाड़ी"] },

  // ---- Offences against women, marriage and dignity
  { code: "BNS 74", act: BNS, section: "74", title: "Assault or criminal force to outrage the modesty of a woman", titleHi: "स्त्री की लज्जा भंग करने के आशय से हमला", category: "women",
    summary: "Using assault or criminal force on a woman intending, or knowing it is likely, to outrage her modesty.",
    keywords: ["touched me inappropriately", "molested", "groped", "छेड़छाड़", "गलत तरीके से छुआ", "बदतमीजी"] },
  { code: "BNS 75", act: BNS, section: "75", title: "Sexual harassment", titleHi: "यौन उत्पीड़न", category: "women",
    summary: "Unwelcome sexual advances, demands for sexual favours, showing pornography or making sexually coloured remarks.",
    keywords: ["sexual harassment", "sexual remarks", "lewd comments", "indecent proposal", "यौन उत्पीड़न", "अश्लील बातें", "गंदे इशारे"] },
  { code: "BNS 78", act: BNS, section: "78", title: "Stalking", titleHi: "पीछा करना", category: "women",
    summary: "Repeatedly following or contacting a woman despite clear disinterest, or monitoring her online activity.",
    keywords: ["stalking", "following me", "follows me", "keeps calling me", "keeps messaging", "पीछा", "पीछा करता", "बार-बार फोन"] },
  { code: "BNS 79", act: BNS, section: "79", title: "Word, gesture or act intended to insult the modesty of a woman", titleHi: "स्त्री की लज्जा का अपमान करने वाले शब्द या इशारे", category: "women",
    summary: "Words, sounds, gestures or objects intended to insult a woman's modesty.",
    keywords: ["obscene gesture", "whistled at", "passed comments", "अश्लील इशारा", "फब्तियां", "सीटी बजा"] },
  { code: "BNS 85", act: BNS, section: "85", title: "Cruelty by husband or his relatives", titleHi: "पति या उसके रिश्तेदारों द्वारा क्रूरता", category: "women",
    summary: "Cruelty to a married woman by her husband or his relatives, including harassment for dowry.",
    keywords: ["dowry", "in-laws harass", "husband beats", "mother-in-law", "दहेज", "ससुराल", "सास", "पति मारता", "पति ने मारा"] },
  { code: "BNS 80", act: BNS, section: "80", title: "Dowry death", titleHi: "दहेज मृत्यु", category: "women",
    summary: "Death of a woman in unnatural circumstances within seven years of marriage after dowry-related cruelty.",
    keywords: ["dowry death", "burnt for dowry", "दहेज हत्या", "दहेज के लिए जला"] },

  // ---- Intimidation, insult, defamation
  { code: "BNS 351(2)", act: BNS, section: "351(2)", title: "Criminal intimidation", titleHi: "आपराधिक अभित्रास (धमकी)", category: "public",
    summary: "Threatening injury to a person, their reputation or property to cause alarm or force them to act.",
    keywords: ["threatened", "threat", "will kill you", "see you later", "धमकी", "धमकाया", "जान से मारने की धमकी", "देख लेंगे"] },
  { code: "BNS 352", act: BNS, section: "352", title: "Intentional insult to provoke breach of peace", titleHi: "शांति भंग कराने के आशय से अपमान", category: "public",
    summary: "Intentionally insulting a person, knowing it is likely to provoke them to break the public peace.",
    keywords: ["abused me", "abusive language", "verbally abused", "गाली", "गालियां", "गाली-गलौज"] },
  { code: "BNS 356(2)", act: BNS, section: "356(2)", title: "Defamation", titleHi: "मानहानि", category: "public",
    summary: "Making or publishing statements intending to harm a person's reputation.",
    keywords: ["defamation", "defamed", "spreading lies", "false rumours", "मानहानि", "बदनाम", "झूठी अफवाह"] },
  { code: "BNS 61(2)", act: BNS, section: "61(2)", title: "Criminal conspiracy", titleHi: "आपराधिक षड्यंत्र", category: "general",
    summary: "An agreement between two or more persons to commit an offence or a lawful act by unlawful means.",
    keywords: ["conspiracy", "planned together", "conspired", "साजिश", "षड्यंत्र", "मिलकर योजना"] },

  // ---- Information Technology Act
  { code: "IT Act 66", act: ITA, section: "66", title: "Computer-related offences (hacking)", titleHi: "कंप्यूटर संबंधी अपराध (हैकिंग)", category: "cyber",
    summary: "Dishonestly or fraudulently accessing, damaging or misusing a computer system or data.",
    keywords: ["hacked", "hacking", "account was hacked", "unauthorised access", "हैक", "अकाउंट हैक"] },
  { code: "IT Act 66C", act: ITA, section: "66C", title: "Identity theft", titleHi: "पहचान की चोरी", category: "cyber",
    summary: "Fraudulently using another person's password, electronic signature or other unique identification.",
    keywords: ["otp", "pin", "cvv", "card details", "password was used", "used my aadhaar", "fake profile", "identity theft", "ओटीपी", "पिन", "पासवर्ड", "कार्ड की जानकारी", "फर्जी प्रोफाइल", "मेरे नाम से"] },
  { code: "IT Act 66D", act: ITA, section: "66D", title: "Cheating by personation using a computer resource", titleHi: "कंप्यूटर साधन से प्रतिरूपण द्वारा छल", category: "cyber",
    summary: "Cheating by pretending to be someone else through a phone, app, website or other computer resource.",
    keywords: [
      "online fraud", "upi", "phone call from the bank", "fake call", "link", "online payment", "kyc", "otp",
      "claiming to be from", "claimed to be from", "pretending to be from", "posed as", "bank official", "bank officer",
      "customer care", "call claiming", "called claiming", "caller said", "video call", "remote access app",
      "ऑनलाइन धोखा", "ऑनलाइन ठगी", "यूपीआई", "फर्जी कॉल", "लिंक", "केवाईसी", "ओटीपी",
      "बैंक से बोल", "बैंक अधिकारी", "बैंक कर्मचारी", "कस्टमर केयर", "कॉल करके", "फोन करके",
    ] },
  { code: "IT Act 66E", act: ITA, section: "66E", title: "Violation of privacy", titleHi: "निजता का उल्लंघन", category: "cyber",
    summary: "Capturing, publishing or transmitting images of a person's private area without consent.",
    keywords: ["private photos", "recorded me without", "hidden camera", "निजी फोटो", "छुपा कैमरा"] },
  { code: "IT Act 67", act: ITA, section: "67", title: "Publishing or transmitting obscene material electronically", titleHi: "इलेक्ट्रॉनिक रूप से अश्लील सामग्री प्रकाशित करना", category: "cyber",
    summary: "Publishing or sending obscene material in electronic form.",
    keywords: ["obscene video", "obscene photo", "morphed", "obscene messages", "अश्लील वीडियो", "अश्लील फोटो", "अश्लील मैसेज"] },
];

const TITLE_HI = new Map(STARTER_CATALOG.map((e) => [e.code, e.titleHi]));
/** Hindi heading for a starter-catalogue code (falls back to the stored English title). */
export function provisionTitleHi(code: string): string | undefined {
  return TITLE_HI.get(code);
}

/**
 * Insert or refresh the starter catalogue (idempotent; matched by `code`).
 * Entries edited by an administrator (updated_by set) are left untouched.
 */
export function seedLegalCatalog(): { inserted: number; updated: number } {
  let inserted = 0;
  let updated = 0;
  const t = now();
  for (const e of STARTER_CATALOG) {
    const existing = get<{ id: string; updated_by: string | null }>("SELECT id, updated_by FROM legal_provisions WHERE code = ?", e.code);
    const values = {
      act: e.act,
      section: e.section,
      title: e.title,
      summary: e.summary,
      keywords: JSON.stringify(e.keywords),
      category: e.category,
      source_note: e.sourceNote ?? VERIFY,
    };
    if (!existing) {
      insert("legal_provisions", { id: newId(), code: e.code, ...values, is_active: 1, updated_by: null, created_at: t, updated_at: t });
      inserted++;
    } else if (!existing.updated_by) {
      update("legal_provisions", existing.id, { ...values, updated_at: t });
      updated++;
    }
  }
  return { inserted, updated };
}
