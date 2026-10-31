import crypto from "node:crypto";
import { detectLanguage, isSupportedLanguage } from "./language.js";

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 7000;

const cache = new Map();

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "YourTube/1.0 (+comment-translation)" },
    });
    if (!response.ok) throw new Error(`Translation provider returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const fromGoogle = async (text, target) => {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
    `&sl=auto&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`;
  const data = await fetchJson(url);
  const segments = Array.isArray(data?.[0]) ? data[0] : [];
  const translated = segments.map((segment) => (Array.isArray(segment) ? segment[0] || "" : "")).join("");
  if (!translated.trim()) throw new Error("Empty Google translation");
  return {
    text: translated,
    sourceLanguage: typeof data?.[2] === "string" ? data[2] : "auto",
    provider: "google",
  };
};

const fromLibreTranslate = async (text, target) => {
  const baseUrl = process.env.TRANSLATE_API_URL;
  if (!baseUrl) throw new Error("LibreTranslate is not configured");

  const response = await fetch(baseUrl.replace(/\/$/, "") + "/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: "auto",
      target,
      format: "text",
      api_key: process.env.TRANSLATE_API_KEY || undefined,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`LibreTranslate returned ${response.status}`);
  const data = await response.json();
  const translated = data?.translatedText;
  if (!translated || typeof translated !== "string") throw new Error("Empty LibreTranslate response");
  return { text: translated, sourceLanguage: "auto", provider: "libretranslate" };
};

const fromMyMemory = async (text, target) => {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    `&langpair=${encodeURIComponent("Autodetect")}%7C${encodeURIComponent(target)}`;
  const data = await fetchJson(url);
  const translated = data?.responseData?.translatedText;
  if (!translated || typeof translated !== "string") throw new Error("Empty MyMemory response");
  if (/MYMEMORY WARNING/i.test(translated)) throw new Error("MyMemory quota exceeded");
  return { text: translated, sourceLanguage: "auto", provider: "mymemory" };
};

const cacheKey = (text, target) =>
  `${target}:${crypto.createHash("sha256").update(text).digest("hex")}`;

export const translateText = async (text, targetLanguage) => {
  const clean = String(text || "").trim();
  const target = String(targetLanguage || "").trim().toLowerCase();

  if (!clean) throw new Error("Nothing to translate");
  if (!isSupportedLanguage(target)) throw new Error("Unsupported target language");

  const detected = detectLanguage(clean);
  if (detected === target) {
    return { text: clean, sourceLanguage: detected, targetLanguage: target, provider: "none" };
  }

  const key = cacheKey(clean, target);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  if (cached) cache.delete(key);

  const providers = [fromGoogle, fromLibreTranslate, fromMyMemory];
  let lastError = null;

  for (const provider of providers) {
    try {
      const result = await provider(clean, target);
      const value = { ...result, targetLanguage: target };
      cache.set(key, { at: Date.now(), value });
      if (cache.size > MAX_CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value);
      }
      return value;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Translation service unavailable");
};
