import jwt from "jsonwebtoken";
import users from "../Modals/Auth.js";
import {
  CHAT_MAX_LENGTH,
  addPartyMessage,
  cleanupParties,
  endParty,
  getParty,
  joinParty,
  leaveParty,
  partyParticipants,
  partySummary,
  publicParticipant,
  setCallState,
  setPlayback,
} from "../utils/partyStore.js";

const CHAT_WINDOW_MS = 5000;
const CHAT_MAX_PER_WINDOW = 5;

const errorFor = (code) => {
  switch (code) {
    case "not_found":
      return "This watch party no longer exists";
    case "full":
      return "This watch party is full";
    case "not_in_party":
      return "You are not in this watch party";
    case "too_long":
      return `Messages can be at most ${CHAT_MAX_LENGTH} characters`;
    case "empty":
      return "Type a message before sending";
    default:
      return "Something went wrong";
  }
};

const emitPartyError = (socket, code, message) => {
  socket.emit("party:error", {
    code: code || "error",
    message: message || errorFor(code),
  });
};

const leaveCurrentParty = (socket, io) => {
  const code = socket.data.partyCode;
  if (!code) return;
  const { participant } = leaveParty(code, socket.id);
  socket.leave(code);
  socket.data.partyCode = null;
  socket.data.isHost = false;
  if (participant) {
    io.to(code).emit("party:participant-left", {
      socketId: socket.id,
      userId: participant.userId,
    });
    if (participant.inCall) {
      io.to(code).emit("call:left", { socketId: socket.id });
    }
  }
};

const authenticate = async (socket, next) => {
  try {
    const raw =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.query?.access_token;
    const token = raw ? String(raw) : "";
    if (!token) return next(new Error("Unauthorized"));

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "yourtube_secret_key"
    );
    const user = await users
      .findById(decoded.id)
      .select("name channelname image email")
      .lean();
    if (!user) return next(new Error("Unauthorized"));

    socket.data.user = {
      id: String(user._id),
      name:
        user.channelname ||
        user.name ||
        user.email?.split("@")[0] ||
        "Viewer",
      image: user.image || "",
    };
    return next();
  } catch (error) {
    return next(new Error("Unauthorized"));
  }
};

export const attachPartySocket = (io) => {
  io.use(authenticate);

  io.on("connection", (socket) => {
    const chatHits = [];

    socket.on("party:join", (payload = {}) => {
      const result = joinParty({
        code: payload.code,
        socketId: socket.id,
        user: socket.data.user,
      });

      if (result.error) {
        return emitPartyError(socket, result.error);
      }

      if (socket.data.partyCode && socket.data.partyCode !== result.party.code) {
        leaveCurrentParty(socket, io);
      }

      socket.join(result.party.code);
      socket.data.partyCode = result.party.code;
      socket.data.isHost = result.isHost;

      socket.emit("party:joined", {
        selfId: socket.id,
        isHost: result.isHost,
        party: partySummary(result.party),
        participants: result.participants,
        messages: result.messages,
      });

      socket.to(result.party.code).emit("party:participant-joined", {
        participant: result.participant,
      });
    });

    socket.on("party:leave", () => {
      leaveCurrentParty(socket, io);
    });

    socket.on("chat:send", (payload = {}) => {
      const code = socket.data.partyCode;
      if (!code) return emitPartyError(socket, "not_in_party");

      const now = Date.now();
      while (chatHits.length && now - chatHits[0] >= CHAT_WINDOW_MS) {
        chatHits.shift();
      }
      if (chatHits.length >= CHAT_MAX_PER_WINDOW) {
        return emitPartyError(
          socket,
          "chat_rate_limit",
          "Slow down a little before sending more messages"
        );
      }

      const result = addPartyMessage({
        code,
        user: socket.data.user,
        text: payload.text,
      });
      if (result.error) return emitPartyError(socket, result.error);

      chatHits.push(now);
      io.to(code).emit("chat:message", result.message);
    });

    socket.on("call:join", () => {
      const code = socket.data.partyCode;
      if (!code) return emitPartyError(socket, "not_in_party");

      const result = setCallState({
        code,
        socketId: socket.id,
        state: { inCall: true },
      });
      if (result.error) return emitPartyError(socket, result.error);

      const existing = partyParticipants(result.party).filter(
        (participant) =>
          participant.inCall && participant.socketId !== socket.id
      );

      socket.emit("call:joined", { participants: existing });
      socket.to(code).emit("call:participant-joined", {
        participant: result.participant,
      });
    });

    socket.on("call:state", (payload = {}) => {
      const code = socket.data.partyCode;
      if (!code) return;

      const result = setCallState({
        code,
        socketId: socket.id,
        state: {
          muted: payload.muted,
          cameraOn: payload.cameraOn,
          sharing: payload.sharing,
        },
      });
      if (result.error) return;
      socket.to(code).emit("call:state", result.participant);
    });

    socket.on("call:leave", () => {
      const code = socket.data.partyCode;
      if (!code) return;
      setCallState({
        code,
        socketId: socket.id,
        state: { inCall: false, muted: false, cameraOn: false, sharing: false },
      });
      socket.to(code).emit("call:left", { socketId: socket.id });
    });

    const relaySignal = (eventName, payload = {}) => {
      const code = socket.data.partyCode;
      if (!code) return;
      const party = getParty(code);
      if (!party) return;

      const from = party.participants.get(socket.id);
      const to = party.participants.get(String(payload.to || ""));
      if (!from || !to || !from.inCall || !to.inCall) return;
      if (to.socketId === socket.id) return;

      io.to(to.socketId).emit(eventName, {
        from: socket.id,
        sdp: payload.sdp,
        candidate: payload.candidate,
      });
    };

    socket.on("webrtc:offer", (payload) =>
      relaySignal("webrtc:offer", payload)
    );
    socket.on("webrtc:answer", (payload) =>
      relaySignal("webrtc:answer", payload)
    );
    socket.on("webrtc:ice-candidate", (payload) =>
      relaySignal("webrtc:ice-candidate", payload)
    );

    const broadcastPlayback = (playing, payload = {}) => {
      const code = socket.data.partyCode;
      if (!code) return;
      const time = Number(payload.time);
      if (!Number.isFinite(time)) return;

      const result = setPlayback({ code, playing, time });
      if (result.error) return;
      socket.to(code).emit("player:state", {
        ...result.playback,
        sentBy: socket.id,
      });
    };

    socket.on("player:play", (payload) => broadcastPlayback(true, payload));
    socket.on("player:pause", (payload) => broadcastPlayback(false, payload));
    socket.on("player:seek", (payload) => broadcastPlayback(undefined, payload));

    socket.on("party:end", () => {
      const code = socket.data.partyCode;
      if (!code) return emitPartyError(socket, "not_in_party");
      const party = getParty(code);
      if (!party) return emitPartyError(socket, "not_found");
      if (String(party.hostId) !== String(socket.data.user.id)) {
        return emitPartyError(
          socket,
          "forbidden",
          "Only the host can end this watch party"
        );
      }

      endParty(code);
      io.to(code).emit("party:ended", { by: socket.data.user.name });
      io.in(code).socketsLeave(code);
    });

    socket.on("disconnect", () => {
      leaveCurrentParty(socket, io);
    });
  });

  const timer = setInterval(() => cleanupParties(), 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
};
