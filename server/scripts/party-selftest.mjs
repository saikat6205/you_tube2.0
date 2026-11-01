import assert from "node:assert/strict";
import {
  CHAT_MAX_LENGTH,
  EMPTY_PARTY_TTL_MS,
  MAX_CHAT_MESSAGES,
  MAX_PARTIES,
  MAX_PARTY_PARTICIPANTS,
  PARTY_CODE_ALPHABET,
  PARTY_CODE_LENGTH,
  PARTY_TTL_MS,
  addPartyMessage,
  cleanupParties,
  createParty,
  endParty,
  generatePartyCode,
  getParty,
  joinParty,
  leaveParty,
  normalizePartyCode,
  partyCount,
  partySummary,
  publicParticipant,
  resetPartiesForTests,
  setCallState,
  setPlayback,
} from "../utils/partyStore.js";

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

const user = (id, name = `User ${id}`) => ({
  id: String(id),
  name,
  image: "",
});

const makeParty = (hostId = "host-1") => {
  const result = createParty({
    hostId,
    hostName: "Host",
    videoId: "video-1",
    videoTitle: "Test video",
  });
  if (!result.party) throw new Error("Party was not created");
  return result.party;
};

resetPartiesForTests();

check("normalizes party codes", () => {
  assert.equal(normalizePartyCode(" ab12cd "), "AB12CD");
  assert.equal(normalizePartyCode(null), "");
});

check("generates a six character code from the safe alphabet", () => {
  const code = generatePartyCode(() => false, () => 0);
  assert.equal(code.length, PARTY_CODE_LENGTH);
  assert.equal(code, "AAAAAA");
  for (const character of code) {
    assert.equal(PARTY_CODE_ALPHABET.includes(character), true);
  }
});

check("creates and retrieves a party case-insensitively", () => {
  resetPartiesForTests();
  const party = makeParty();
  assert.equal(party.code.length, PARTY_CODE_LENGTH);
  assert.equal(getParty(party.code.toLowerCase()), party);
  assert.equal(partyCount(), 1);
});

check("join marks the host and keeps participants idempotent", () => {
  resetPartiesForTests();
  const party = makeParty();
  const first = joinParty({
    code: party.code,
    socketId: "socket-host",
    user: user("host-1", "Host"),
  });
  assert.equal(first.error, undefined);
  assert.equal(first.isHost, true);

  const duplicate = joinParty({
    code: party.code,
    socketId: "socket-host",
    user: user("host-1", "Host"),
  });
  assert.equal(duplicate.participants.length, 1);
  assert.equal(duplicate.participant.joinedAt, first.participant.joinedAt);
});

check("rejects a ninth participant", () => {
  resetPartiesForTests();
  const party = makeParty();
  for (let index = 0; index < MAX_PARTY_PARTICIPANTS; index += 1) {
    const result = joinParty({
      code: party.code,
      socketId: `socket-${index}`,
      user: user(index),
    });
    assert.equal(result.error, undefined);
  }
  const overflow = joinParty({
    code: party.code,
    socketId: "socket-overflow",
    user: user("overflow"),
  });
  assert.equal(overflow.error, "full");
  assert.equal(party.participants.size, MAX_PARTY_PARTICIPANTS);
});

check("rejects joins for unknown parties", () => {
  resetPartiesForTests();
  const result = joinParty({
    code: "NOPE00",
    socketId: "socket-1",
    user: user(1),
  });
  assert.equal(result.error, "not_found");
});

check("adds trimmed chat messages with a bounded history", () => {
  resetPartiesForTests();
  const party = makeParty();
  joinParty({
    code: party.code,
    socketId: "socket-host",
    user: user("host-1", "Host"),
  });

  const message = addPartyMessage({
    code: party.code,
    user: user("host-1", "Host"),
    text: "  hello   there  ",
  });
  assert.equal(message.message.text, "hello there");
  assert.equal(message.message.name, "Host");
  assert.equal(Boolean(message.message.id), true);

  assert.equal(addPartyMessage({ code: party.code, user: user(1), text: "   " }).error, "empty");
  assert.equal(
    addPartyMessage({
      code: party.code,
      user: user(1),
      text: "a".repeat(CHAT_MAX_LENGTH + 1),
    }).error,
    "too_long"
  );

  for (let index = 0; index < MAX_CHAT_MESSAGES + 5; index += 1) {
    addPartyMessage({
      code: party.code,
      user: user(1),
      text: `message ${index}`,
    });
  }
  assert.equal(party.messages.length, MAX_CHAT_MESSAGES);
  assert.equal(party.messages.at(-1).text, `message ${MAX_CHAT_MESSAGES + 4}`);
});

check("updates call state and playback", () => {
  resetPartiesForTests();
  const party = makeParty();
  joinParty({
    code: party.code,
    socketId: "socket-host",
    user: user("host-1", "Host"),
  });

  const call = setCallState({
    code: party.code,
    socketId: "socket-host",
    state: { inCall: true, muted: true, cameraOn: true, sharing: true },
  });
  assert.equal(call.participant.inCall, true);
  assert.equal(call.participant.muted, true);
  assert.equal(call.participant.cameraOn, true);
  assert.equal(call.participant.sharing, true);

  const playback = setPlayback({
    code: party.code,
    playing: true,
    time: 42.5,
  });
  assert.equal(playback.playback.playing, true);
  assert.equal(playback.playback.time, 42.5);
  assert.equal(playback.playback.serverTime >= playback.playback.updatedAt, true);

  setPlayback({ code: party.code, time: -10 });
  assert.equal(party.playback.time, 0);
  assert.equal(party.playback.playing, true);
});

check("leaving removes the participant and marks the party empty", () => {
  resetPartiesForTests();
  const party = makeParty();
  joinParty({
    code: party.code,
    socketId: "socket-host",
    user: user("host-1", "Host"),
  });
  const left = leaveParty(party.code, "socket-host");
  assert.equal(left.participant.userId, "host-1");
  assert.equal(party.participants.size, 0);
  assert.equal(typeof party.emptySince, "number");
});

check("summary exposes only public participant fields", () => {
  resetPartiesForTests();
  const party = makeParty();
  joinParty({
    code: party.code,
    socketId: "socket-host",
    user: { ...user("host-1", "Host"), email: "secret@example.com" },
  });
  const summary = partySummary(party);
  assert.equal(summary.participantCount, 1);
  assert.equal(summary.participants[0].name, "Host");
  assert.equal("email" in summary.participants[0], false);
  assert.equal(publicParticipant(party.participants.get("socket-host")).socketId, "socket-host");
});

check("ends a party and removes it from storage", () => {
  resetPartiesForTests();
  const party = makeParty();
  assert.equal(endParty(party.code).code, party.code);
  assert.equal(getParty(party.code), null);
});

check("cleanup removes expired active and abandoned empty parties", () => {
  resetPartiesForTests();
  const active = makeParty();
  joinParty({
    code: active.code,
    socketId: "socket-active",
    user: user(1),
  });
  const empty = makeParty();
  const now = Date.now();
  const removedActive = cleanupParties(now + PARTY_TTL_MS + 1);
  assert.equal(removedActive >= 1, true);
  assert.equal(getParty(active.code), null);

  resetPartiesForTests();
  makeParty();
  const removedEmpty = cleanupParties(Date.now() + EMPTY_PARTY_TTL_MS + 1);
  assert.equal(removedEmpty, 1);
  assert.equal(empty.participants.size, 0);
});

check("enforces the party count ceiling", () => {
  resetPartiesForTests();
  for (let index = 0; index < MAX_PARTIES; index += 1) {
    const result = createParty({
      hostId: `host-${index}`,
      hostName: "Host",
      videoId: `video-${index}`,
      videoTitle: "Video",
    });
    assert.equal(Boolean(result.party), true);
  }
  const overflow = createParty({
    hostId: "extra",
    hostName: "Host",
    videoId: "video-extra",
    videoTitle: "Video",
  });
  assert.equal(overflow.error, "limit");
  resetPartiesForTests();
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
