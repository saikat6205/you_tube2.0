/**
 * Live API test for the comment features. Requires the backend on :5000 and a
 * reachable MongoDB. It signs short-lived JWTs locally (never printed) so the
 * flows can be exercised without going through Google sign-in.
 *
 * Run from the server directory: node scripts/comment-live-test.mjs
 */
import dns from "node:dns";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "yourtube_secret_key";
const adminEmails = String(process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

let passed = 0;
let failed = 0;
let skipped = 0;

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
};

const skip = (name, reason) => {
  skipped += 1;
  console.log(`SKIP ${name}: ${reason}`);
};

const call = async (method, path, { token, body, headers } = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
};

const sign = (id, email) => jwt.sign({ id: String(id), email }, JWT_SECRET, { expiresIn: "1h" });

const dbUrl =
  process.env.DB_URL ||
  `${process.env.MONGODB_URI}/${process.env.MONGODB_DATABASE || "yourtube"}`;

await mongoose.connect(dbUrl);
const db = mongoose.connection.db;

const users = await db.collection("users").find({}).limit(30).toArray();
const video = await db.collection("videofiles").findOne({});

if (!users.length) throw new Error("No users found in the database");
if (!video) throw new Error("No video found in the database");

const isAdmin = (email) => adminEmails.includes(String(email || "").toLowerCase());
const author = users.find((user) => !isAdmin(user.email)) || users[0];
const reporters = users.filter((user) => String(user._id) !== String(author._id)).slice(0, 4);
const adminUser = users.find((user) => isAdmin(user.email)) || users[0];
const adminEmail = adminEmails[0] || adminUser.email;

const authorToken = sign(author._id, author.email);
const adminToken = sign(adminUser._id, adminEmail);
const reporterTokens = reporters.map((user) => sign(user._id, user.email));
const nonAdminUser = reporters.find((user) => !isAdmin(user.email)) || author;
const nonAdminToken = sign(nonAdminUser._id, "viewer@example.com");

if (reporters.length < 3) throw new Error("Live test needs at least 4 user records");

const unique = Date.now();
const validText = `यह वीडियो बहुत अच्छा है ${unique}`;
const createdIds = [];
const originalPreferences = {
  preferredLanguage: author.preferredLanguage,
  showLocation: author.showLocation,
};

const createComment = async (body) => {
  const response = await call("POST", "/comment/postcomment", {
    token: authorToken,
    body: { videoid: String(video._id), commentbody: body },
  });
  if (response.data?.result?._id) createdIds.push(response.data.result._id);
  return response;
};

try {
  // Public list
  const list = await call("GET", `/comment/${video._id}`);
  check("GET comments returns an array", list.status === 200 && Array.isArray(list.data), `status ${list.status}`);

  // Post + validation
  const posted = await createComment(validText);
  const commentId = posted.data?.result?._id;
  check("post valid multilingual comment", posted.status === 201, `status ${posted.status} ${posted.data?.message || ""}`);
  check("server stores the author display name", Boolean(posted.data?.result?.usercommented));
  check("language detected as Hindi", posted.data?.result?.detectedLanguage === "hi", posted.data?.result?.detectedLanguage);

  const abuse = await createComment("fuck this video");
  check("abusive comment rejected", abuse.status === 422 && abuse.data?.reason === "abusive", `status ${abuse.status}`);

  const special = await createComment("!!!!!!!!!!!!");
  check("special-character flood rejected", special.status === 422 && special.data?.reason === "special_characters", `status ${special.status}`);

  const spam = await createComment("http://a.co http://b.co http://c.co");
  check("link spam rejected", spam.status === 422 && spam.data?.reason === "spam", `status ${spam.status}`);

  const duplicate = await createComment(validText);
  check("duplicate comment rejected", duplicate.status === 429, `status ${duplicate.status}`);

  if (!commentId) throw new Error("Valid comment was not created");

  // Reactions
  const like1 = await call("POST", `/comment/${commentId}/like`, { token: reporterTokens[0] });
  check("like adds a reaction", like1.status === 200 && like1.data?.result?.likeCount === 1 && like1.data?.result?.myReaction === "like", JSON.stringify(like1.data?.result));

  const like2 = await call("POST", `/comment/${commentId}/like`, { token: reporterTokens[0] });
  check("like toggles off", like2.status === 200 && like2.data?.result?.likeCount === 0 && like2.data?.result?.myReaction === null);

  const dislike = await call("POST", `/comment/${commentId}/dislike`, { token: reporterTokens[0] });
  check("dislike adds a reaction", dislike.status === 200 && dislike.data?.result?.dislikeCount === 1 && dislike.data?.result?.myReaction === "dislike");

  const flipped = await call("POST", `/comment/${commentId}/like`, { token: reporterTokens[0] });
  check("like replaces an existing dislike", flipped.status === 200 && flipped.data?.result?.likeCount === 1 && flipped.data?.result?.dislikeCount === 0);

  // Reports (threshold 3)
  const r1 = await call("POST", `/comment/${commentId}/report`, { token: reporterTokens[0], body: { reason: "spam" } });
  const r2 = await call("POST", `/comment/${commentId}/report`, { token: reporterTokens[1], body: { reason: "abuse" } });
  const r3 = await call("POST", `/comment/${commentId}/report`, { token: reporterTokens[2], body: { reason: "harassment" } });
  check("reports 1-2 keep the comment visible", r1.data?.result?.status === "visible" && r2.data?.result?.status === "visible");
  check("third report flags for review", r3.status === 200 && r3.data?.result?.status === "flagged" && r3.data?.result?.reportCount === 3, JSON.stringify(r3.data?.result));

  const duplicateReport = await call("POST", `/comment/${commentId}/report`, { token: reporterTokens[0], body: { reason: "spam" } });
  check("duplicate report is idempotent", duplicateReport.data?.alreadyReported === true && duplicateReport.data?.result?.reportCount === 3);

  const selfReport = await call("POST", `/comment/${commentId}/report`, { token: authorToken, body: { reason: "other" } });
  check("author cannot report own comment", selfReport.status === 400);

  const stillVisible = await call("GET", `/comment/${video._id}`);
  const publicComment = stillVisible.data.find((item) => item._id === commentId);
  check("flagged comment stays visible to viewers", Boolean(publicComment));
  check(
    "raw report identities are not exposed",
    Boolean(publicComment) && !JSON.stringify(publicComment).includes(String(reporters[0]._id))
  );

  // Translation
  const translation = await call("POST", "/comment/translate", { token: nonAdminToken, body: { commentId, target: "en" } });
  if (translation.status === 200) {
    check("translation returns text", typeof translation.data?.text === "string" && translation.data.text.trim().length > 0, JSON.stringify(translation.data));
    check("translation reports source language", Boolean(translation.data?.sourceLanguage || translation.data?.detectedLanguage));
  } else {
    skip("translation live check", `provider unavailable (status ${translation.status})`);
  }

  const badLanguage = await call("POST", "/comment/translate", { body: { commentId, target: "xx" } });
  check("unsupported translation language rejected", badLanguage.status === 400);

  // Moderation queue
  const forbidden = await call("GET", "/comment/reported/list", { token: nonAdminToken });
  check("non-admin cannot read the moderation queue", forbidden.status === 403);

  const queue = await call("GET", "/comment/reported/list", { token: adminToken });
  const queuedComment = (queue.data || []).find((item) => item._id === commentId);
  check("admin reads the moderation queue", queue.status === 200 && Boolean(queuedComment), `status ${queue.status}`);
  check(
    "moderation queue hides reporter identities",
    Boolean(queuedComment) && !JSON.stringify(queuedComment).includes(String(reporters[0]._id))
  );

  const approveForbidden = await call("PATCH", `/comment/review/${commentId}`, { token: nonAdminToken, body: { action: "approve" } });
  check("non-admin cannot review comments", approveForbidden.status === 403);

  const approve = await call("PATCH", `/comment/review/${commentId}`, { token: adminToken, body: { action: "approve" } });
  check("admin approves a flagged comment", approve.status === 200 && approve.data?.status === "visible" && approve.data?.reportCount === 0, JSON.stringify(approve.data));

  // Edit while the comment is still public
  const edited = await call("POST", `/comment/editcomment/${commentId}`, { token: authorToken, body: { commentbody: `Edited comment ${unique}` } });
  check("author edits own comment", edited.status === 200 && edited.data?.commentbody === `Edited comment ${unique}`);

  const foreignEdit = await call("POST", `/comment/editcomment/${commentId}`, { token: reporterTokens[0], body: { commentbody: "hijack" } });
  check("other users cannot edit the comment", foreignEdit.status === 403);

  let lastReport = null;
  for (let index = 0; index < 3; index += 1) {
    lastReport = await call("POST", `/comment/${commentId}/report`, { token: reporterTokens[index], body: { reason: "abuse" } });
  }
  check(
    "reports re-flag after approval",
    lastReport?.status === 200 && lastReport?.data?.result?.status === "flagged",
    JSON.stringify(lastReport?.data)
  );

  const remove = await call("PATCH", `/comment/review/${commentId}`, { token: adminToken, body: { action: "remove" } });
  check(
    "admin removes a re-flagged comment",
    remove.status === 200 && remove.data?.status === "removed",
    `status ${remove.status} ${JSON.stringify(remove.data)}`
  );

  const afterRemove = await call("GET", `/comment/${video._id}`);
  check("removed comment is hidden from viewers", !afterRemove.data.some((item) => item._id === commentId));

  // Preferences + optional location
  const badPreference = await call("PATCH", "/user/preferences", { token: authorToken, body: { preferredLanguage: "xx" } });
  check("invalid preferred language rejected", badPreference.status === 400);

  const prefs = await call("PATCH", "/user/preferences", { token: authorToken, body: { preferredLanguage: "bn", showLocation: true } });
  check("preferences update and echo isAdmin", prefs.status === 200 && prefs.data?.preferredLanguage === "bn" && prefs.data?.showLocation === true && typeof prefs.data?.isAdmin === "boolean", JSON.stringify(prefs.data));

  const privateComment = await createComment(`Location check ${unique}`);
  check("location field is a coarse string", typeof privateComment.data?.result?.locationLabel === "string");
  check(
    "location never includes a city or placeholder",
    !/Local|Unknown/.test(privateComment.data?.result?.locationLabel || "")
  );

  const geoPost = await call("POST", "/comment/postcomment", {
    token: authorToken,
    body: { videoid: String(video._id), commentbody: `Geo location check ${unique}` },
    headers: { "X-Forwarded-For": "8.8.8.8" },
  });
  const geoId = geoPost.data?.result?._id;
  if (geoId) createdIds.push(geoId);
  const geoLabel = geoPost.data?.result?.locationLabel || "";
  check("opt-in location includes state and country", geoPost.status === 201 && geoLabel.length > 0, geoLabel);
  check("opt-in location omits city detail", !/San Jose/i.test(geoLabel), geoLabel);

  const cleared = await call("PATCH", "/user/preferences", { token: authorToken, body: { showLocation: false } });
  check("location can be turned off", cleared.status === 200 && cleared.data?.showLocation === false);

  const afterClear = await call("GET", `/comment/${video._id}`);
  const clearedComment = (afterClear.data || []).find((item) => item._id === geoId);
  check(
    "turning location off clears past labels",
    Boolean(clearedComment) && clearedComment.locationLabel === ""
  );

  const deleted = await call("DELETE", `/comment/deletecomment/${commentId}`, { token: authorToken });
  check("author deletes own comment", deleted.status === 200);
} catch (error) {
  failed += 1;
  console.error("FAIL live test crashed:", error.message);
} finally {
  for (const id of createdIds) {
    await db.collection("comments").deleteOne({ _id: new mongoose.Types.ObjectId(id) }).catch(() => {});
  }
  await db.collection("comments").deleteMany({ commentbody: { $regex: String(unique) } }).catch(() => {});
  await db.collection("users").updateOne(
    { _id: author._id },
    {
      $set: {
        preferredLanguage: originalPreferences.preferredLanguage || "en",
        showLocation: Boolean(originalPreferences.showLocation),
      },
    }
  );
  await mongoose.connection.close();
}

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) process.exit(1);
