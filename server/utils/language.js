/**
 * Lightweight language detection.
 *
 * Script ranges are a reliable signal for non-Latin languages and do not need
 * any external service. Latin-script languages are approximated with common
 * stopwords, which is good enough to decide whether a translation is worth
 * offering. Nothing here is used for security decisions.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "gu", label: "Gujarati" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "id", label: "Indonesian" },
  { code: "tr", label: "Turkish" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
];

const LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map((item) => item.code));

const SCRIPT_HINTS = [
  { code: "ja", re: /[\u3040-\u30ff]/g },
  { code: "ko", re: /[\uac00-\ud7af\u1100-\u11ff]/g },
  { code: "zh", re: /[\u4e00-\u9fff]/g },
  { code: "hi", re: /[\u0900-\u097f]/g },
  { code: "bn", re: /[\u0980-\u09ff]/g },
  { code: "pa", re: /[\u0a00-\u0a7f]/g },
  { code: "gu", re: /[\u0a80-\u0aff]/g },
  { code: "ta", re: /[\u0b80-\u0bff]/g },
  { code: "te", re: /[\u0c00-\u0c7f]/g },
  { code: "ar", re: /[\u0600-\u06ff]/g },
  { code: "ru", re: /[\u0400-\u04ff]/g },
  { code: "th", re: /[\u0e00-\u0e7f]/g },
];

const LATIN_HINTS = {
  en: ["the", "and", "is", "are", "you", "this", "that", "with", "for", "have", "not", "what", "thanks", "hello"],
  es: ["el", "la", "los", "las", "que", "por", "para", "con", "una", "es", "esta", "hola", "gracias", "pero", "como"],
  fr: ["le", "la", "les", "des", "est", "et", "une", "pour", "avec", "bonjour", "merci", "pas", "que", "vous"],
  de: ["der", "die", "das", "und", "ist", "nicht", "ein", "eine", "mit", "danke", "aber", "auch", "ich"],
  pt: ["o", "a", "os", "as", "que", "e", "nao", "uma", "com", "obrigado", "voce", "para", "muito"],
  id: ["yang", "dan", "di", "ini", "itu", "tidak", "dengan", "terima", "kasih", "saya"],
  tr: ["ve", "bir", "bu", "icin", "degil", "merhaba", "tesekkur", "cok"],
  vi: ["va", "la", "cua", "khong", "nay", "cam", "on", "toi"],
};

const stripDiacritics = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const isSupportedLanguage = (code) =>
  LANGUAGE_CODES.has(String(code || "").trim().toLowerCase());

export const languageLabel = (code) => {
  const match = SUPPORTED_LANGUAGES.find(
    (item) => item.code === String(code || "").trim().toLowerCase(),
  );
  return match ? match.label : "Unknown";
};

const detectLatin = (text) => {
  const words = stripDiacritics(text.toLowerCase()).match(/[a-z]+/g) || [];
  if (!words.length) return null;

  const counts = new Map();
  for (const [code, hints] of Object.entries(LATIN_HINTS)) {
    const hintSet = new Set(hints);
    counts.set(code, words.reduce((total, word) => total + (hintSet.has(word) ? 1 : 0), 0));
  }

  let bestCode = "en";
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      bestCode = code;
      bestCount = count;
    }
  }

  return bestCount >= 2 ? bestCode : "en";
};

export const detectLanguage = (text) => {
  const clean = String(text || "");
  if (!clean.trim()) return "und";

  const scriptCounts = new Map();
  for (const { code, re } of SCRIPT_HINTS) {
    const matches = clean.match(re);
    if (matches && matches.length) {
      scriptCounts.set(code, matches.length);
    }
  }

  let bestScript = null;
  let bestScriptCount = 0;
  for (const [code, count] of scriptCounts) {
    if (count > bestScriptCount) {
      bestScript = code;
      bestScriptCount = count;
    }
  }

  if (bestScript && bestScriptCount >= 2) return bestScript;

  const latin = detectLatin(clean);
  return latin || "und";
};
