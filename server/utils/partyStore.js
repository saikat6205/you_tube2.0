import crypto from "node:crypto";

export const PARTY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PARTY_CODE_LENGTH = 6;
export const MAX_PARTY_PARTICIPANTS = 8;
export const MAX_PARTIES = 200;
export const PARTY_TTL_MS = 6 * 60 * 60 * 1000;
export const EMPTY_PARTY_TTL_MS = 10 * 60 * 1000;
export const MAX_CHAT_MESSAGES = 100;
export const CHAT_MAX_LENGTH = 500;

const parties = new Map();

const now = () => Date.now();

export const normalizePartyCode = (code) =>
  String(code || "").trim().toUpperCase();

const randomCode = (randomInt = crypto.randomInt) => {
  let code = "";
  for (let index = 0; index < PARTY_CODE_LENGTH; index += 1) {
    code += PARTY_CODE_ALPHABET[randomInt(PARTY_CODE_ALPHABET.length)];
  }
  return code;
};

export const generatePartyCode = (
  isTaken = (code) => parties.has(code),
  randomInt = crypto.randomInt
) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = randomCode(randomInt);
    if (!isTaken(code)) return code;
  }
  throw new Error("Could not allocate a party code");
};

export const publicParticipant = (participant) => ({
  socketId: participant.socketId,
  userId: participant.userId,
  name: participant.name,
  image: participant.image,
  inCall: participant.inCall,
  muted: participant.muted,
  cameraOn: participant.cameraOn,
  sharing: participant.sharing,
  joinedAt: participant.joinedAt,
});

export const partyParticipants = (party) =>
  Array.from(party.participants.values()).map(publicParticipant);

export const partySummary = (party) => ({
  code: party.code,
  videoId: party.videoId,
  videoTitle: party.videoTitle,
  hostId: party.hostId,
  hostName: party.hostName,
  createdAt: party.createdAt,
  updatedAt: party.updatedAt,
  participants: partyParticipants(party),
  participantCount: party.participants.size,
  maxParticipants: MAX_PARTY_PARTICIPANTS,
  messages: party.messages.slice(),
  playback: {
    playing: party.playback.playing,
    time: party.playback.time,
    updatedAt: party.playback.updatedAt,
    serverTime: now(),
  },
});

export const getParty = (code) => parties.get(normalizePartyCode(code)) || null;

export const createParty = ({
  hostId,
  hostName,
  hostImage,
  videoId,
  videoTitle,
}) => {
  cleanupParties();
  if (parties.size >= MAX_PARTIES) {
    return { error: "limit" };
  }

  const code = generatePartyCode();
  const createdAt = now();
  const party = {
    code,
    videoId: String(videoId),
    videoTitle: videoTitle || "Watch party",
    hostId: String(hostId),
    hostName: hostName || "Host",
    hostImage: hostImage || "",
    createdAt,
    updatedAt: createdAt,
    emptySince: createdAt,
    playback: { playing: false, time: 0, updatedAt: createdAt },
    messages: [],
    participants: new Map(),
  };
  parties.set(code, party);
  return { party };
};

export const joinParty = ({ code, socketId, user }) => {
  const party = getParty(code);
  if (!party) return { error: "not_found" };
  if (
    party.participants.size >= MAX_PARTY_PARTICIPANTS &&
    !party.participants.has(socketId)
  ) {
    return { error: "full" };
  }

  const existing = party.participants.get(socketId);
  const participant = {
    socketId,
    userId: String(user.id),
    name: user.name || "Viewer",
    image: user.image || "",
    joinedAt: existing?.joinedAt || now(),
    inCall: existing?.inCall || false,
    muted: existing?.muted || false,
    cameraOn: existing?.cameraOn || false,
    sharing: existing?.sharing || false,
  };
  party.participants.set(socketId, participant);
  party.emptySince = null;
  party.updatedAt = now();

  return {
    party,
    participant,
    isHost: String(party.hostId) === String(participant.userId),
    participants: partyParticipants(party),
    messages: party.messages.slice(),
  };
};

export const leaveParty = (code, socketId) => {
  const party = getParty(code);
  if (!party) return { party: null, participant: null };
  const participant = party.participants.get(socketId) || null;
  party.participants.delete(socketId);
  party.updatedAt = now();
  if (party.participants.size === 0) {
    party.emptySince = now();
  }
  return { party, participant };
};

export const addPartyMessage = ({ code, user, text }) => {
  const party = getParty(code);
  if (!party) return { error: "not_found" };

  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { error: "empty" };
  if (clean.length > CHAT_MAX_LENGTH) return { error: "too_long" };

  const message = {
    id: crypto.randomUUID(),
    userId: String(user.id),
    name: user.name || "Viewer",
    image: user.image || "",
    text: clean,
    createdAt: now(),
  };
  party.messages.push(message);
  if (party.messages.length > MAX_CHAT_MESSAGES) {
    party.messages.splice(0, party.messages.length - MAX_CHAT_MESSAGES);
  }
  party.updatedAt = now();
  return { message };
};

export const setCallState = ({ code, socketId, state = {} }) => {
  const party = getParty(code);
  if (!party) return { error: "not_found" };
  const participant = party.participants.get(socketId);
  if (!participant) return { error: "not_in_party" };

  if (typeof state.inCall === "boolean") participant.inCall = state.inCall;
  if (typeof state.muted === "boolean") participant.muted = state.muted;
  if (typeof state.cameraOn === "boolean") participant.cameraOn = state.cameraOn;
  if (typeof state.sharing === "boolean") participant.sharing = state.sharing;
  party.updatedAt = now();
  return { party, participant };
};

export const setPlayback = ({ code, playing, time }) => {
  const party = getParty(code);
  if (!party) return { error: "not_found" };
  const nextTime = Math.max(0, Number(time) || 0);
  if (typeof playing === "boolean") party.playback.playing = playing;
  party.playback.time = nextTime;
  party.playback.updatedAt = now();
  party.updatedAt = now();
  return { party, playback: { ...party.playback, serverTime: now() } };
};

export const endParty = (code) => {
  const party = getParty(code);
  if (!party) return null;
  parties.delete(party.code);
  return party;
};

export const cleanupParties = (at = now()) => {
  let removed = 0;
  for (const [code, party] of parties) {
    const expired = at - party.createdAt >= PARTY_TTL_MS;
    const emptyExpired =
      party.participants.size === 0 &&
      party.emptySince &&
      at - party.emptySince >= EMPTY_PARTY_TTL_MS;
    if (expired || emptyExpired) {
      parties.delete(code);
      removed += 1;
    }
  }
  return removed;
};

export const partyCount = () => parties.size;

export const resetPartiesForTests = () => {
  parties.clear();
};
