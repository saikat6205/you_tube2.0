import dns from "node:dns";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { io } from "socket.io-client";

dotenv.config();
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "yourtube_secret_key";

let passed = 0;
let failed = 0;

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
};

const sign = (id, email) =>
  jwt.sign({ id: String(id), email }, JWT_SECRET, { expiresIn: "1h" });

const call = async (method, path, { token, body } = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

const waitFor = (socket, event, { timeout = 5000, filter = () => true } = {}) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const handler = (data) => {
      if (!filter(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });

const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Socket connection timed out"));
    }, 6000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });

const dbUrl =
  process.env.DB_URL ||
  `${process.env.MONGODB_URI}/${process.env.MONGODB_DATABASE || "yourtube"}`;

await mongoose.connect(dbUrl);
const db = mongoose.connection.db;
const users = await db.collection("users").find({}).limit(5).toArray();
const video = await db.collection("videofiles").findOne({});

if (users.length < 2) throw new Error("Party live test needs at least 2 users");
if (!video) throw new Error("No video found in the database");

const hostUser = users[0];
const guestUser = users[1];
const hostToken = sign(hostUser._id, hostUser.email);
const guestToken = sign(guestUser._id, guestUser.email);

let hostSocket;
let guestSocket;
let partyCode;

try {
  const unauthorized = await connect("not-a-token").then(
    () => null,
    (error) => error
  );
  check(
    "socket rejects an invalid token",
    Boolean(unauthorized) && /unauthorized/i.test(unauthorized.message),
    unauthorized?.message
  );

  const created = await call("POST", "/party", {
    token: hostToken,
    body: { videoId: String(video._id) },
  });
  check(
    "POST /party creates a party",
    created.status === 201 && typeof created.data?.code === "string",
    `status ${created.status} ${created.data?.message || ""}`
  );
  partyCode = created.data.code;
  check(
    "created party links to the video",
    String(created.data.videoId) === String(video._id)
  );

  const lookup = await call("GET", `/party/${partyCode}`);
  check(
    "GET /party/:code returns public metadata",
    lookup.status === 200 &&
      lookup.data?.code === partyCode &&
      lookup.data?.participantCount === 0,
    `status ${lookup.status}`
  );

  hostSocket = await connect(hostToken);
  guestSocket = await connect(guestToken);
  check("host and guest sockets connect", Boolean(hostSocket.id && guestSocket.id));

  const hostJoinedPromise = waitFor(hostSocket, "party:joined");
  hostSocket.emit("party:join", { code: partyCode });
  const hostJoined = await hostJoinedPromise;
  check(
    "host joins as host",
    hostJoined.isHost === true && hostJoined.selfId === hostSocket.id
  );

  const hostSawGuestPromise = waitFor(hostSocket, "party:participant-joined");
  const guestJoinedPromise = waitFor(guestSocket, "party:joined");
  guestSocket.emit("party:join", { code: partyCode });
  const guestJoined = await guestJoinedPromise;
  const hostSawGuest = await hostSawGuestPromise;
  check(
    "guest receives the participant list",
    guestJoined.isHost === false && guestJoined.participants.length === 2
  );
  check(
    "host sees the guest arrive",
    hostSawGuest?.participant?.socketId === guestSocket.id
  );

  const chatForHost = waitFor(hostSocket, "chat:message");
  const chatForGuest = waitFor(guestSocket, "chat:message");
  guestSocket.emit("chat:send", { text: "  hello party  " });
  const [hostMessage, guestMessage] = await Promise.all([
    chatForHost,
    chatForGuest,
  ]);
  check(
    "chat is delivered to everyone and trimmed",
    hostMessage.text === "hello party" &&
      guestMessage.text === "hello party" &&
      hostMessage.id === guestMessage.id
  );

  const tooLongError = waitFor(guestSocket, "party:error", {
    filter: (data) => data?.code === "too_long",
  });
  guestSocket.emit("chat:send", { text: "a".repeat(501) });
  const validationError = await tooLongError;
  check(
    "oversized chat messages are rejected",
    /500/.test(validationError.message)
  );

  const playbackForGuest = waitFor(guestSocket, "player:state", {
    filter: (data) => data?.sentBy === hostSocket.id,
  });
  hostSocket.emit("player:play", { time: 12.5 });
  const playback = await playbackForGuest;
  check(
    "playback state is relayed",
    playback.playing === true && Math.abs(playback.time - 12.5) < 0.01
  );

  const hostCallPromise = waitFor(hostSocket, "call:joined");
  hostSocket.emit("call:join");
  const hostCall = await hostCallPromise;
  check("host joins the call alone", hostCall.participants.length === 0);

  const hostSawCallJoinPromise = waitFor(
    hostSocket,
    "call:participant-joined"
  );
  const guestCallPromise = waitFor(guestSocket, "call:joined");
  guestSocket.emit("call:join");
  const guestCall = await guestCallPromise;
  await hostSawCallJoinPromise;
  const hostParticipant = guestCall.participants.find(
    (participant) => participant.socketId === hostSocket.id
  );
  check(
    "guest receives the in-call participant",
    Boolean(hostParticipant) && hostParticipant.userId === String(hostUser._id)
  );

  const offerAtHost = waitFor(hostSocket, "webrtc:offer");
  guestSocket.emit("webrtc:offer", {
    to: hostParticipant.socketId,
    sdp: { type: "offer", sdp: "v=0\r\n" },
  });
  const offer = await offerAtHost;
  check(
    "WebRTC offers are relayed",
    offer.from === guestSocket.id && offer.sdp?.sdp === "v=0\r\n"
  );

  const answerAtGuest = waitFor(guestSocket, "webrtc:answer");
  hostSocket.emit("webrtc:answer", {
    to: offer.from,
    sdp: { type: "answer", sdp: "v=0\r\n" },
  });
  const answer = await answerAtGuest;
  check(
    "WebRTC answers are relayed",
    answer.from === hostSocket.id && answer.sdp?.type === "answer"
  );

  const candidateAtHost = waitFor(hostSocket, "webrtc:ice-candidate");
  guestSocket.emit("webrtc:ice-candidate", {
    to: hostParticipant.socketId,
    candidate: { candidate: "candidate:1 1 udp 1 127.0.0.1 5000 typ host" },
  });
  const ice = await candidateAtHost;
  check(
    "ICE candidates are relayed",
    ice.from === guestSocket.id && Boolean(ice.candidate?.candidate)
  );

  const stateAtHost = waitFor(hostSocket, "call:state", {
    filter: (participant) => participant.socketId === guestSocket.id,
  });
  guestSocket.emit("call:state", { muted: true });
  const callState = await stateAtHost;
  check("call state changes are broadcast", callState.muted === true);

  const forbidden = waitFor(guestSocket, "party:error", {
    filter: (data) => data?.code === "forbidden",
  });
  guestSocket.emit("party:end");
  const forbiddenError = await forbidden;
  check(
    "only the host can end the party",
    /host/i.test(forbiddenError.message)
  );

  const endedAtGuest = waitFor(guestSocket, "party:ended");
  hostSocket.emit("party:end");
  const ended = await endedAtGuest;
  check("host ends the party for everyone", Boolean(ended.by));

  const afterEnd = await call("GET", `/party/${partyCode}`);
  check("ended parties are removed", afterEnd.status === 404);
} catch (error) {
  failed += 1;
  console.error(`FAIL live party flow: ${error.message}`);
} finally {
  try {
    if (partyCode) await call("GET", `/party/${partyCode}`);
  } catch {
    partyCode = null;
  }
  hostSocket?.disconnect();
  guestSocket?.disconnect();
  await mongoose.disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
