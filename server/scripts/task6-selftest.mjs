import assert from "node:assert/strict";
import {
  detectLanguage,
  isSupportedLanguage,
  languageLabel,
} from "../utils/language.js";
import {
  containsAbusiveLanguage,
  hasRepeatedSpecialChars,
  isSpammyComment,
  validateComment,
} from "../utils/moderation.js";
import { getAdminEmails, isAdminEmail } from "../utils/admin.js";

let passed = 0;
let failed = 0;

const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
};

const reasons = (text) => validateComment(text);

// --- language detection -----------------------------------------------------
check("detect Hindi", () => assert.equal(detectLanguage("यह एक अच्छा वीडियो है"), "hi"));
check("detect Bengali", () => assert.equal(detectLanguage("এটি একটি ভাল ভিডিও"), "bn"));
check("detect Tamil", () => assert.equal(detectLanguage("இது ஒரு நல்ல வீடியோ"), "ta"));
check("detect Telugu", () => assert.equal(detectLanguage("ఇది మంచి వీడియో"), "te"));
check("detect Gujarati", () => assert.equal(detectLanguage("આ સારો વિડિયો છે"), "gu"));
check("detect Punjabi", () => assert.equal(detectLanguage("ਇਹ ਇੱਕ ਚੰਗਾ ਵੀਡੀਓ ਹੈ"), "pa"));
check("detect Arabic", () => assert.equal(detectLanguage("هذا فيديو جيد"), "ar"));
check("detect Russian", () => assert.equal(detectLanguage("это хорошее видео"), "ru"));
check("detect Chinese", () => assert.equal(detectLanguage("这是一个很好的视频"), "zh"));
check("detect Japanese", () => assert.equal(detectLanguage("これは良い動画です"), "ja"));
check("detect Korean", () => assert.equal(detectLanguage("좋은 영상입니다"), "ko"));
check("detect Thai", () => assert.equal(detectLanguage("วิดีโอนี้ดีมาก"), "th"));
check("detect Spanish", () => assert.equal(detectLanguage("Este video es muy bueno, gracias"), "es"));
check("detect French", () => assert.equal(detectLanguage("Cette video est tres bonne, merci beaucoup"), "fr"));
check("detect German", () => assert.equal(detectLanguage("Das ist ein gutes Video, danke"), "de"));
check("detect Indonesian", () => assert.equal(detectLanguage("Video ini sangat bagus, terima kasih"), "id"));
check("detect Turkish", () => assert.equal(detectLanguage("Bu video cok guzel, tesekkurler"), "tr"));
check("detect Vietnamese", () => assert.equal(detectLanguage("Video nay rat hay, cam on"), "vi"));
check("detect English", () => assert.equal(detectLanguage("This is a good video, thanks"), "en"));
check("detect empty", () => assert.equal(detectLanguage("   "), "und"));
check("detect punctuation only", () => assert.equal(detectLanguage("!!! ???"), "und"));
check("supported language", () => assert.equal(isSupportedLanguage("hi"), true));
check("unsupported language", () => assert.equal(isSupportedLanguage("xx"), false));
check("language label", () => assert.equal(languageLabel("bn"), "Bengali"));
check("unknown language label", () => assert.equal(languageLabel("xx"), "Unknown"));

// --- moderation -------------------------------------------------------------
check("accept normal comment", () => {
  const result = reasons("Great video, thanks for sharing!");
  assert.equal(result.ok, true);
  assert.equal(result.text, "Great video, thanks for sharing!");
});
check("trim comment", () => {
  const result = reasons("   hello world   ");
  assert.equal(result.ok, true);
  assert.equal(result.text, "hello world");
});
check("accept multilingual comment", () => {
  assert.equal(reasons("यह वीडियो बहुत अच्छा है").ok, true);
  assert.equal(reasons("এই ভিডিওটি খুব ভালো").ok, true);
});
check("accept emoji in normal comment", () => {
  assert.equal(reasons("Nice video 🔥").ok, true);
});
check("reject empty comment", () => {
  const result = reasons("   ");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "empty");
});
check("reject too long comment", () => {
  const result = reasons("a".repeat(1001));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "too_long");
});
check("reject control characters", () => {
  const result = reasons("hello\u0007world");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_characters");
});
check("reject abusive word", () => {
  const result = reasons("fuck this video");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "abusive");
});
check("reject leetspeak abuse", () => {
  assert.equal(containsAbusiveLanguage("sh1t"), true);
  assert.equal(containsAbusiveLanguage("5h1t"), true);
});
check("reject obfuscated abuse", () => {
  assert.equal(containsAbusiveLanguage("f.u.c.k"), true);
  assert.equal(containsAbusiveLanguage("f u c k"), true);
});
check("reject non-latin abuse", () => {
  assert.equal(containsAbusiveLanguage("चूतिया"), true);
});
check("allow Scunthorpe-style words", () => {
  assert.equal(containsAbusiveLanguage("I visited Scunthorpe last year"), false);
  assert.equal(containsAbusiveLanguage("classic and assassin"), false);
});
check("detect repeated special characters", () => {
  assert.equal(hasRepeatedSpecialChars("Wow!!!!!!!!!"), true);
  const result = reasons("Wow!!!!!!!!!");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "special_characters");
});
check("reject symbol flood", () => {
  const result = reasons("@#$%^&*()_+");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "special_characters");
});
check("allow normal punctuation", () => {
  assert.equal(reasons("Wait... is that real?! I loved it.").ok, true);
});
check("reject link spam", () => {
  const result = reasons("http://a.co http://b.co http://c.co");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "spam");
});
check("reject short link-only comment", () => {
  assert.equal(reasons("http://a.co").ok, false);
});
check("allow one link in a longer comment", () => {
  assert.equal(
    reasons("Check the full tutorial at https://example.com/editing for more").ok,
    true
  );
});
check("reject repeated characters", () => {
  assert.equal(isSpammyComment("loooooooooooool"), true);
});
check("reject repeated words", () => {
  assert.equal(isSpammyComment("spam spam spam spam spam spam spam spam"), true);
});
check("reject all caps", () => {
  assert.equal(isSpammyComment("THIS IS ALL CAPS AND VERY LOUD"), true);
});
check("reject promotional text", () => {
  assert.equal(isSpammyComment("Subscribe to my channel for free crypto"), true);
});
check("custom abusive words from env", () => {
  process.env.ABUSIVE_WORDS = "custombadword";
  assert.equal(containsAbusiveLanguage("this is a custombadword"), true);
  process.env.ABUSIVE_WORDS = "";
});

// --- admin ------------------------------------------------------------------
check("admin email matching", () => {
  process.env.ADMIN_EMAILS = "Admin@Example.com, second@example.com";
  assert.equal(getAdminEmails().length, 2);
  assert.equal(isAdminEmail("admin@example.com"), true);
  assert.equal(isAdminEmail("ADMIN@EXAMPLE.COM"), true);
  assert.equal(isAdminEmail("nobody@example.com"), false);
  assert.equal(isAdminEmail(""), false);
  process.env.ADMIN_EMAILS = "";
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
