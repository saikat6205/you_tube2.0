/**
 * Comment moderation.
 *
 * The goal is to reject obvious abuse and spam before it is stored while
 * keeping normal multilingual conversation untouched. Detection is heuristic:
 * token matching with leetspeak/diacritic normalisation, repeated-character
 * and symbol-flood checks, link/promo heuristics and duplicate-in-window
 * detection (the duplicate check lives in the controller).
 */
export const COMMENT_MAX_LENGTH = 1000;

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const DEFAULT_ABUSIVE_WORDS = [
  "fuck",
  "fucking",
  "fucker",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "bastard",
  "asshole",
  "dickhead",
  "cunt",
  "whore",
  "slut",
  "retard",
  "scumbag",
  "douchebag",
  "idiot",
  "moron",
  "dumbass",
  "kys",
  "kill yourself",
  "chutiya",
  "madarchod",
  "behenchod",
  "bhosdike",
  "gaandu",
  "harami",
  "kamina",
  "चूतिया",
  "मादरचोद",
  "भोसड़ीके",
  "চোদা",
  "মাদারচোদ",
];

const LEET_MAP = {
  "@": "a",
  "4": "a",
  "0": "o",
  "1": "i",
  "3": "e",
  "5": "s",
  "7": "t",
  $: "s",
  "!": "i",
  "|": "l",
  "+": "t",
};

const stripDiacritics = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const applyLeet = (text) =>
  text
    .split("")
    .map((char) => LEET_MAP[char] || char)
    .join("");

let cachedWords = null;
let cachedEnv = null;

const getAbusiveWords = () => {
  const env = String(process.env.ABUSIVE_WORDS || "");
  if (cachedWords && cachedEnv === env) return cachedWords;

  cachedEnv = env;
  const words = new Set();
  for (const raw of [...DEFAULT_ABUSIVE_WORDS, ...env.split(",")]) {
    const word = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (word) words.add(word);
  }
  cachedWords = words;
  return cachedWords;
};

const normalizeForTokens = (text) =>
  stripDiacritics(String(text).toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Sequence of single letters split by punctuation/spaces, e.g. "f.u.c.k" or
// "f u c k". Squashing only these avoids the classic Scunthorpe false positive.
const OBFUSCATED_SEQUENCE = /(?:\b[a-z][.\-_*\s]){2,}[a-z]\b/g;

export const containsAbusiveLanguage = (text) => {
  const words = getAbusiveWords();
  if (!words.size) return false;

  const raw = String(text).toLowerCase();
  const tokens = normalizeForTokens(raw).split(" ").filter(Boolean).map(applyLeet);
  const joined = tokens.join(" ");
  const lower = stripDiacritics(raw);

  for (const word of words) {
    if (word.includes(" ")) {
      if (joined.includes(word)) return true;
      continue;
    }
    if (/[^\x00-\x7f]/.test(word)) {
      if (lower.includes(word)) return true;
      continue;
    }
    if (tokens.includes(word)) return true;
  }

  const sequences = raw.match(OBFUSCATED_SEQUENCE) || [];
  for (const sequence of sequences) {
    const squashed = applyLeet(sequence.replace(/[^a-z0-9]/g, ""));
    for (const word of words) {
      if (word.includes(" ") || /[^\x00-\x7f]/.test(word)) continue;
      if (squashed === word) return true;
      if (word.length >= 4 && squashed.includes(word)) return true;
    }
  }

  return false;
};

const SPECIAL_RUN = /([^\p{L}\p{N}\s])\1{5,}/u;

export const hasRepeatedSpecialChars = (text) => SPECIAL_RUN.test(String(text));

const symbolRatioTooHigh = (text) => {
  const visible = Array.from(String(text).replace(/\s/g, ""));
  if (visible.length < 8) return false;

  const symbols = visible.filter(
    (char) => /[\p{P}\p{S}]/u.test(char) && !/[.,'"():;\-]/.test(char),
  );

  return symbols.length >= 6 && symbols.length / visible.length > 0.7;
};

const URL_PATTERN = /(https?:\/\/|www\.)/gi;

const PROMO_PATTERNS = [
  /\bfree\s+(money|crypto|gift|iphone|bitcoin|v-?bucks)\b/i,
  /\bclick\s+(here|this\s+link)\b/i,
  /\bsubscribe\s+to\s+my\s+channel\b/i,
  /\b(earn|make)\s+\$?\d{3,}/i,
  /\bwhatsapp\b[^\n]{0,20}\d{6,}/i,
  /\btelegram\b[^\n]{0,20}@/i,
];

export const isSpammyComment = (text) => {
  const clean = String(text);

  const urls = clean.match(URL_PATTERN) || [];
  if (urls.length > 2) return true;
  if (urls.length > 0 && clean.length < 25) return true;

  if (/(.)\1{7,}/u.test(clean)) return true;

  if (PROMO_PATTERNS.some((pattern) => pattern.test(clean))) return true;

  const words = clean.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  if (words.length >= 8) {
    const frequency = new Map();
    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
    for (const count of frequency.values()) {
      if (count >= 6 && count / words.length >= 0.5) return true;
    }
  }

  const letters = clean.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8) {
    return true;
  }

  return false;
};

export const validateComment = (input) => {
  const text = String(input ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!text) {
    return { ok: false, reason: "empty", message: "Comment cannot be empty." };
  }

  if (text.length > COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: `Comments must be ${COMMENT_MAX_LENGTH.toLocaleString()} characters or fewer.`,
    };
  }

  if (CONTROL_CHARS.test(text)) {
    return {
      ok: false,
      reason: "invalid_characters",
      message: "Comment contains characters that are not allowed.",
    };
  }

  if (containsAbusiveLanguage(text)) {
    return {
      ok: false,
      reason: "abusive",
      message: "Comment blocked: it contains abusive language.",
    };
  }

  if (hasRepeatedSpecialChars(text)) {
    return {
      ok: false,
      reason: "special_characters",
      message: "Comment blocked: repeated special characters are not allowed.",
    };
  }

  if (symbolRatioTooHigh(text)) {
    return {
      ok: false,
      reason: "special_characters",
      message: "Comment blocked: too many special characters.",
    };
  }

  if (isSpammyComment(text)) {
    return {
      ok: false,
      reason: "spam",
      message: "Comment blocked: this looks like spam.",
    };
  }

  return { ok: true, text };
};
