import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Socket } from "socket.io-client";
import { useRouter } from "next/router";
import Link from "next/link";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  Circle,
  Copy,
  Crown,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Send,
  Square,
  Users,
  Video as VideoIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { encodeFilePath } from "@/lib/utils";

type PartyParticipant = {
  socketId: string;
  userId: string;
  name: string;
  image: string;
  inCall: boolean;
  muted: boolean;
  cameraOn: boolean;
  sharing: boolean;
  joinedAt: number;
};

type PartyMessage = {
  id: string;
  userId: string;
  name: string;
  image: string;
  text: string;
  createdAt: number;
};

type PlaybackState = {
  playing: boolean;
  time: number;
  updatedAt: number;
  serverTime: number;
};

type Party = {
  code: string;
  videoId: string;
  videoTitle: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  updatedAt: number;
  participants: PartyParticipant[];
  participantCount: number;
  maxParticipants: number;
  messages: PartyMessage[];
  playback: PlaybackState;
};

type VideoRecord = {
  _id: string;
  videotitle: string;
  filepath: string;
  ispremium?: boolean;
  videochanel?: string;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const formatClock = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

function RemoteTile({
  participant,
  stream,
}: {
  participant: PartyParticipant;
  stream?: MediaStream;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border bg-black">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white">
          <Avatar className="h-14 w-14">
            <AvatarImage src={participant.image} alt={participant.name} />
            <AvatarFallback>{participant.name?.[0] || "?"}</AvatarFallback>
          </Avatar>
          <p className="text-sm font-medium">{participant.name}</p>
          <p className="text-xs text-white/60">Connecting video...</p>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
        {participant.muted && <MicOff className="h-3.5 w-3.5" />}
        {participant.sharing && <Monitor className="h-3.5 w-3.5" />}
        <span>{participant.name}</span>
      </div>
    </div>
  );
}

export default function PartyPage() {
  const router = useRouter();
  const rawCode = router.query.code;
  const code = typeof rawCode === "string" ? rawCode.toUpperCase() : "";
  const { user, handlegooglesignin } = useUser();

  const [party, setParty] = useState<Party | null>(null);
  const [video, setVideo] = useState<VideoRecord | null>(null);
  const [participants, setParticipants] = useState<PartyParticipant[]>([]);
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [selfId, setSelfId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [ended, setEnded] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [chatText, setChatText] = useState("");
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [recording, setRecording] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const localPreviewRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const applyingRemoteRef = useRef(false);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlaybackRef = useRef<PlaybackState | null>(null);
  const inCallRef = useRef(false);
  const mutedRef = useRef(false);
  const cameraOnRef = useRef(false);
  const sharingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const videoSrc = useMemo(() => {
    if (!video) return null;
    const backend = process.env.BACKEND_URL || "http://localhost:5000";
    const token =
      hasToken && typeof window !== "undefined"
        ? localStorage.getItem("token")
        : null;
    if (token) {
      return `${backend}/video/stream/${video._id}?token=${encodeURIComponent(
        token
      )}`;
    }
    if (!video.ispremium) {
      return `${backend}/${encodeFilePath(video.filepath)}`;
    }
    return null;
  }, [video, hasToken]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasToken(Boolean(localStorage.getItem("token")));
    }
  }, [user?._id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasToken(Boolean(localStorage.getItem("token")));
  }, []);

  useEffect(() => {
    if (!code) return;
    let active = true;
    setLoading(true);
    setError("");

    const load = async () => {
      try {
        const partyResponse = await axiosInstance.get(`/party/${code}`);
        if (!active) return;
        setParty(partyResponse.data);
        setParticipants(partyResponse.data.participants || []);
        try {
          const videoResponse = await axiosInstance.get(
            `/video/${partyResponse.data.videoId}`
          );
          if (active) setVideo(videoResponse.data);
        } catch {
          if (active) setVideo(null);
        }
      } catch (requestError: any) {
        if (!active) return;
        setError(
          requestError?.response?.data?.message ||
            "This watch party could not be found"
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [code]);

  const mergeParticipant = (participant: PartyParticipant) => {
    setParticipants((current) => {
      const index = current.findIndex(
        (item) => item.socketId === participant.socketId
      );
      if (index === -1) return [...current, participant];
      const next = current.slice();
      next[index] = { ...next[index], ...participant };
      return next;
    });
  };

  const removeParticipant = (socketId: string) => {
    setParticipants((current) =>
      current.filter((item) => item.socketId !== socketId)
    );
  };

  const applyPlayback = (playback: PlaybackState) => {
    const element = videoRef.current;
    if (!element) {
      pendingPlaybackRef.current = playback;
      return;
    }
    if (element.readyState < 1) {
      pendingPlaybackRef.current = playback;
      return;
    }

    const ageSeconds = playback.playing
      ? Math.max(
          0,
          (Number(playback.serverTime || 0) - Number(playback.updatedAt || 0)) /
            1000
        )
      : 0;
    const target = Math.max(0, Number(playback.time || 0) + ageSeconds);

    applyingRemoteRef.current = true;
    if (Number.isFinite(target) && Math.abs(element.currentTime - target) > 1.25) {
      try {
        element.currentTime = target;
      } catch {
        pendingPlaybackRef.current = playback;
      }
    }
    if (playback.playing) {
      element.play().catch(() => {});
    } else {
      element.pause();
    }
    if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 350);
  };

  const handleLoadedMetadata = () => {
    if (!pendingPlaybackRef.current) return;
    const playback = pendingPlaybackRef.current;
    pendingPlaybackRef.current = null;
    applyPlayback(playback);
  };

  const emitMediaState = (patch: Partial<PartyParticipant>) => {
    socketRef.current?.emit("call:state", patch);
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot access camera or microphone");
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (firstError: any) {
      if (
        firstError?.name === "NotFoundError" ||
        firstError?.name === "OverconstrainedError"
      ) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw firstError;
      }
    }

    localStreamRef.current = stream;
    cameraTrackRef.current = stream.getVideoTracks()[0] || null;
    setLocalStream(stream);
    setMuted(false);
    mutedRef.current = false;
    const camera = Boolean(cameraTrackRef.current);
    setCameraOn(camera);
    cameraOnRef.current = camera;
    return stream;
  };

  const closePeer = (peerId: string) => {
    const peer = peerConnectionsRef.current.get(peerId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
      peerConnectionsRef.current.delete(peerId);
    }
    pendingCandidatesRef.current.delete(peerId);
    if (remoteStreamsRef.current[peerId]) {
      const next = { ...remoteStreamsRef.current };
      delete next[peerId];
      remoteStreamsRef.current = next;
      setRemoteStreams(next);
    }
  };

  const createPeer = (peerId: string) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(peerId, peer);

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("webrtc:ice-candidate", {
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peer.ontrack = (event) => {
      let stream = event.streams?.[0] || null;
      if (!stream) {
        stream = remoteStreamsRef.current[peerId] || new MediaStream();
        if (!stream.getTracks().some((track) => track.id === event.track.id)) {
          stream.addTrack(event.track);
        }
      }
      remoteStreamsRef.current = {
        ...remoteStreamsRef.current,
        [peerId]: stream,
      };
      setRemoteStreams({ ...remoteStreamsRef.current });
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        toast.error("A video connection failed. Try rejoining the call.");
        closePeer(peerId);
      }
    };

    return peer;
  };

  const attachLocalTracks = async (peer: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const outboundVideo = sharingRef.current
      ? screenStreamRef.current?.getVideoTracks()[0]
      : stream.getVideoTracks()[0];
    const tracks = [
      stream.getAudioTracks()[0],
      outboundVideo || stream.getVideoTracks()[0],
    ].filter(Boolean) as MediaStreamTrack[];

    for (const track of tracks) {
      const transceiver = peer
        .getTransceivers()
        .find(
          (item) =>
            item.receiver.track?.kind === track.kind ||
            item.sender.track?.kind === track.kind
        );
      if (transceiver) {
        await transceiver.sender.replaceTrack(track);
        if (transceiver.direction === "recvonly") {
          transceiver.direction = "sendrecv";
        }
      } else {
        peer.addTrack(track, stream);
      }
    }
  };

  const flushCandidates = async (peerId: string, peer: RTCPeerConnection) => {
    const queued = pendingCandidatesRef.current.get(peerId);
    if (!queued?.length || !peer.remoteDescription) return;
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        continue;
      }
    }
  };

  const createOffer = async (peerId: string) => {
    try {
      const peer = createPeer(peerId);
      await attachLocalTracks(peer);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit("webrtc:offer", {
        to: peerId,
        sdp: peer.localDescription,
      });
    } catch {
      toast.error("Could not start video with a participant");
    }
  };

  const handleIncomingOffer = async (from: string, sdp: RTCSessionDescriptionInit) => {
    if (!inCallRef.current) return;
    try {
      const peer = createPeer(from);
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      await attachLocalTracks(peer);
      await flushCandidates(from, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socketRef.current?.emit("webrtc:answer", {
        to: from,
        sdp: peer.localDescription,
      });
    } catch {
      toast.error("Could not answer an incoming video call");
    }
  };

  const handleIncomingAnswer = async (
    from: string,
    sdp: RTCSessionDescriptionInit
  ) => {
    const peer = peerConnectionsRef.current.get(from);
    if (!peer) return;
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushCandidates(from, peer);
    } catch {
      toast.error("Could not complete a video connection");
    }
  };

  const handleIncomingCandidate = async (
    from: string,
    candidate: RTCIceCandidateInit
  ) => {
    const peer = peerConnectionsRef.current.get(from);
    if (!peer) {
      const queued = pendingCandidatesRef.current.get(from) || [];
      queued.push(candidate);
      pendingCandidatesRef.current.set(from, queued);
      return;
    }
    if (!peer.remoteDescription) {
      const queued = pendingCandidatesRef.current.get(from) || [];
      queued.push(candidate);
      pendingCandidatesRef.current.set(from, queued);
      return;
    }
    try {
      await peer.addIceCandidate(candidate);
    } catch {
      return;
    }
  };

  const cleanupMedia = () => {
    for (const peerId of Array.from(peerConnectionsRef.current.keys())) {
      closePeer(peerId);
    }
    pendingCandidatesRef.current.clear();
    remoteStreamsRef.current = {};
    setRemoteStreams({});

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    cameraTrackRef.current = null;
    setScreenStream(null);
    setLocalStream(null);
    setSharing(false);
    sharingRef.current = false;
    setMuted(false);
    mutedRef.current = false;
    setCameraOn(false);
    cameraOnRef.current = false;
    setInCall(false);
    inCallRef.current = false;

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const startCall = async () => {
    if (inCallRef.current || !joined) return;
    try {
      await ensureLocalStream();
      inCallRef.current = true;
      setInCall(true);
      socketRef.current?.emit("call:join");
    } catch (mediaError: any) {
      const message =
        mediaError?.name === "NotAllowedError"
          ? "Camera and microphone permission was denied"
          : mediaError?.message || "Could not start your camera or microphone";
      toast.error(message);
    }
  };

  const leaveCall = () => {
    socketRef.current?.emit("call:leave");
    cleanupMedia();
  };

  const toggleMute = () => {
    if (!inCallRef.current) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = !next));
    emitMediaState({ muted: next });
  };

  const toggleCamera = () => {
    if (!inCallRef.current) return;
    const track = cameraTrackRef.current;
    if (!track) {
      toast.error("No camera was found for this device");
      return;
    }
    const next = !cameraOnRef.current;
    track.enabled = next;
    cameraOnRef.current = next;
    setCameraOn(next);
    emitMediaState({ cameraOn: next });
  };

  const stopScreenShare = async () => {
    const display = screenStreamRef.current;
    display?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    sharingRef.current = false;
    setSharing(false);

    for (const peer of peerConnectionsRef.current.values()) {
      const transceiver = peer
        .getTransceivers()
        .find(
          (item) =>
            item.receiver.track?.kind === "video" ||
            item.sender.track?.kind === "video"
        );
      if (transceiver) {
        await transceiver.sender
          .replaceTrack(cameraTrackRef.current || null)
          .catch(() => {});
      }
    }
    emitMediaState({ sharing: false });
  };

  const startScreenShare = async () => {
    if (!inCallRef.current) return;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = display.getVideoTracks()[0];
      if (!track) throw new Error("No screen selected");
      screenStreamRef.current = display;
      setScreenStream(display);
      sharingRef.current = true;
      setSharing(true);
      track.onended = () => {
        void stopScreenShare();
      };

      for (const peer of peerConnectionsRef.current.values()) {
        const transceiver = peer
          .getTransceivers()
          .find(
            (item) =>
              item.receiver.track?.kind === "video" ||
              item.sender.track?.kind === "video"
          );
        if (transceiver) {
          await transceiver.sender.replaceTrack(track).catch(() => {});
        }
      }
      emitMediaState({ sharing: true });
    } catch (shareError: any) {
      if (shareError?.name !== "NotAllowedError") {
        toast.error(shareError?.message || "Could not share your screen");
      }
    }
  };

  const toggleScreenShare = () => {
    if (sharingRef.current) {
      void stopScreenShare();
    } else {
      void startScreenShare();
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const startRecording = () => {
    if (!isHost) {
      toast.error("Only the host can record this watch party");
      return;
    }
    if (recorderRef.current) return;
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      toast.error("Recording is not supported in this browser");
      return;
    }

    const display = screenStreamRef.current || localStreamRef.current;
    const microphone = localStreamRef.current;
    const videoTrack = display?.getVideoTracks()[0];
    const audioTracks = microphone?.getAudioTracks() || [];
    if (!videoTrack && !audioTracks.length) {
      toast.error("Join the video call before recording");
      return;
    }

    const stream = new MediaStream();
    if (videoTrack) stream.addTrack(videoTrack);
    audioTracks.forEach((track) => {
      if (!stream.getAudioTracks().some((item) => item.id === track.id)) {
        stream.addTrack(track);
      }
    });

    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));

    try {
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        chunksRef.current = [];
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = `watch-party-${party?.code || code}-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.webm`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
        recorderRef.current = null;
        setRecording(false);
        toast.success("Recording saved to your downloads");
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      toast.success("Recording this device's call locally");
    } catch {
      toast.error("Could not start recording");
    }
  };

  useEffect(() => {
    if (!code) return;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setAuthRequired(true);
      setLoading(false);
      return;
    }

    let active = true;
    let socket: Socket | null = null;

    const connect = async () => {
      const { io } = await import("socket.io-client");
      if (!active) return;
      const backend = process.env.BACKEND_URL || "http://localhost:5000";
      socket = io(backend, {
        auth: { token },
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;
      setAuthRequired(false);

      socket.on("connect", () => {
        socket?.emit("party:join", { code });
      });

      socket.on("connect_error", (connectError) => {
        if (!active) return;
        if (/unauthorized/i.test(connectError.message)) {
          setAuthRequired(true);
        } else {
          setError(connectError.message || "Could not connect to the party");
        }
        setLoading(false);
      });

      socket.on("disconnect", () => {
        if (!active) return;
        setJoined(false);
        cleanupMedia();
        toast.error("Connection lost. Trying to reconnect...");
      });

      socket.on("party:joined", (data: any) => {
        setSelfId(data.selfId || "");
        setIsHost(Boolean(data.isHost));
        setParty(data.party);
        setParticipants(data.participants || data.party?.participants || []);
        setMessages(data.messages || data.party?.messages || []);
        setJoined(true);
        setLoading(false);
        setError("");
        setEnded(false);
        if (data.party?.playback) applyPlayback(data.party.playback);
      });

      socket.on("party:participant-joined", (data: any) => {
        if (data?.participant) {
          mergeParticipant(data.participant);
          toast.success(`${data.participant.name} joined the party`);
        }
      });

      socket.on("party:participant-left", (data: any) => {
        if (!data?.socketId) return;
        removeParticipant(data.socketId);
        closePeer(data.socketId);
      });

      socket.on("party:error", (data: any) => {
        const message = data?.message || "Watch party error";
        toast.error(message);
        if (data?.code === "not_found" || data?.code === "full") {
          setError(message);
          setJoined(false);
        }
      });

      socket.on("party:ended", (data: any) => {
        setEnded(true);
        setJoined(false);
        cleanupMedia();
        toast.info(
          data?.by ? `${data.by} ended the watch party` : "Watch party ended"
        );
      });

      socket.on("chat:message", (message: PartyMessage) => {
        setMessages((current) => [...current, message].slice(-100));
      });

      socket.on("call:joined", async (data: any) => {
        inCallRef.current = true;
        setInCall(true);
        const existing: PartyParticipant[] = data?.participants || [];
        for (const participant of existing) {
          await createOffer(participant.socketId);
        }
      });

      socket.on("call:participant-joined", (data: any) => {
        if (data?.participant) mergeParticipant(data.participant);
      });

      socket.on("call:state", (participant: PartyParticipant) => {
        if (participant?.socketId) mergeParticipant(participant);
      });

      socket.on("call:left", (data: any) => {
        if (!data?.socketId) return;
        setParticipants((current) =>
          current.map((participant) =>
            participant.socketId === data.socketId
              ? {
                  ...participant,
                  inCall: false,
                  muted: false,
                  cameraOn: false,
                  sharing: false,
                }
              : participant
          )
        );
        closePeer(data.socketId);
      });

      socket.on("webrtc:offer", (data: any) => {
        if (data?.from && data?.sdp) {
          void handleIncomingOffer(data.from, data.sdp);
        }
      });

      socket.on("webrtc:answer", (data: any) => {
        if (data?.from && data?.sdp) {
          void handleIncomingAnswer(data.from, data.sdp);
        }
      });

      socket.on("webrtc:ice-candidate", (data: any) => {
        if (data?.from && data?.candidate) {
          void handleIncomingCandidate(data.from, data.candidate);
        }
      });

      socket.on("player:state", (playback: PlaybackState) => {
        applyPlayback(playback);
      });
    };

    void connect();

    return () => {
      active = false;
      socket?.emit("party:leave");
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      cleanupMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, user?._id]);

  useEffect(() => {
    if (localPreviewRef.current) {
      localPreviewRef.current.srcObject = screenStream || localStream;
    }
  }, [screenStream, localStream]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = chatText.trim();
    if (!text || !socketRef.current || !joined) return;
    socketRef.current.emit("chat:send", { text });
    setChatText("");
  };

  const copyInvite = async () => {
    const inviteUrl =
      typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.info(inviteUrl);
    }
  };

  const endParty = () => {
    if (!isHost) return;
    if (!window.confirm("End the watch party for everyone?")) return;
    socketRef.current?.emit("party:end");
  };

  const videoPlay = () => {
    if (applyingRemoteRef.current || !joined) return;
    socketRef.current?.emit("player:play", {
      time: videoRef.current?.currentTime || 0,
    });
  };

  const videoPause = () => {
    if (applyingRemoteRef.current || !joined) return;
    socketRef.current?.emit("player:pause", {
      time: videoRef.current?.currentTime || 0,
    });
  };

  const videoSeeked = () => {
    if (applyingRemoteRef.current || !joined) return;
    socketRef.current?.emit("player:seek", {
      time: videoRef.current?.currentTime || 0,
    });
  };

  const remoteCallParticipants = participants.filter(
    (participant) => participant.inCall && participant.socketId !== selfId
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <Users className="mx-auto mb-3 h-9 w-9 text-red-600" />
          <h1 className="text-xl font-semibold">Join the watch party</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to watch together, chat with friends and join the video
            call.
          </p>
          {party && (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm font-medium">
              {party.videoTitle}
            </p>
          )}
          <Button
            className="mt-5 w-full bg-red-600 text-white hover:bg-red-700"
            onClick={handlegooglesignin}
          >
            Sign in to continue
          </Button>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <LogOut className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Watch party ended</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The host ended this session.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {party?.videoId && (
              <Link href={`/watch/${party.videoId}`}>
                <Button>Continue watching</Button>
              </Link>
            )}
            <Link href="/">
              <Button variant="outline">Go home</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error && !party) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Watch party unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link href="/">
            <Button className="mt-5">Go home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selfParticipant = participants.find(
    (participant) => participant.socketId === selfId
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1500px] p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
              Watch party
            </p>
            <h1 className="truncate text-xl font-semibold">{party.videoTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Code <span className="font-mono font-semibold">{party.code}</span>{" "}
              · Host {party.hostName} · {participants.length}/
              {party.maxParticipants} friends
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyInvite}>
              <Copy className="h-4 w-4" />
              Invite friends
            </Button>
            {isHost && (
              <Button
                variant={recording ? "destructive" : "outline"}
                size="sm"
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                {recording ? "Stop recording" : "Record"}
              </Button>
            )}
            {isHost && (
              <Button variant="destructive" size="sm" onClick={endParty}>
                <PhoneOff className="h-4 w-4" />
                End party
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
              {videoSrc ? (
                <video
                  key={videoSrc}
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  playsInline
                  className="h-full w-full"
                  onPlay={videoPlay}
                  onPause={videoPause}
                  onSeeked={videoSeeked}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white">
                  <p className="text-lg font-medium">Video unavailable</p>
                  <p className="text-sm text-white/60">
                    This video cannot be played in the party.
                  </p>
                </div>
              )}
              {recording && (
                <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  Recording
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
              {inCall ? (
                <>
                  <Button
                    variant={muted ? "destructive" : "secondary"}
                    size="sm"
                    onClick={toggleMute}
                  >
                    {muted ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                    {muted ? "Unmute" : "Mute"}
                  </Button>
                  <Button
                    variant={cameraOn ? "secondary" : "destructive"}
                    size="sm"
                    onClick={toggleCamera}
                  >
                    {cameraOn ? (
                      <Camera className="h-4 w-4" />
                    ) : (
                      <CameraOff className="h-4 w-4" />
                    )}
                    {cameraOn ? "Camera off" : "Camera on"}
                  </Button>
                  <Button
                    variant={sharing ? "default" : "secondary"}
                    size="sm"
                    onClick={toggleScreenShare}
                  >
                    {sharing ? (
                      <MonitorOff className="h-4 w-4" />
                    ) : (
                      <Monitor className="h-4 w-4" />
                    )}
                    {sharing ? "Stop sharing" : "Share screen"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={leaveCall}>
                    <PhoneOff className="h-4 w-4" />
                    Leave call
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={startCall}
                  disabled={!joined}
                >
                  <VideoIcon className="h-4 w-4" />
                  Join video call
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {inCall
                  ? `${remoteCallParticipants.length + 1} in call`
                  : "Watch together with the camera off until you join"}
              </span>
            </div>

            {inCall && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="relative aspect-video overflow-hidden rounded-xl border bg-black">
                  <video
                    ref={localPreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
                    {muted && <MicOff className="h-3.5 w-3.5" />}
                    {sharing && <Monitor className="h-3.5 w-3.5" />}
                    <span>{selfParticipant?.name || user?.name || "You"}</span>
                  </div>
                </div>
                {remoteCallParticipants.map((participant) => (
                  <RemoteTile
                    key={participant.socketId}
                    participant={participant}
                    stream={remoteStreams[participant.socketId]}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Users className="h-4 w-4" />
                  Participants
                </h2>
                <span className="text-xs text-muted-foreground">
                  {participants.length}/{party.maxParticipants}
                </span>
              </div>
              <ul className="max-h-72 space-y-1 overflow-y-auto p-2">
                {participants.map((participant) => (
                  <li
                    key={participant.socketId}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={participant.image}
                        alt={participant.name}
                      />
                      <AvatarFallback>
                        {participant.name?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {participant.name}
                        {participant.userId === party.hostId && (
                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                        )}
                        {participant.socketId === selfId && (
                          <span className="text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {participant.inCall ? "In video call" : "In party"}
                      </p>
                    </div>
                    {participant.inCall && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        {participant.muted ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                        {participant.sharing && (
                          <Monitor className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex h-[430px] flex-col rounded-xl border bg-card">
              <div className="border-b p-4">
                <h2 className="font-semibold">Party chat</h2>
                <p className="text-xs text-muted-foreground">
                  Messages are visible to everyone in this party.
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Say hello to everyone joining.
                  </p>
                )}
                {messages.map((message) => (
                  <div key={message.id} className="flex gap-2">
                    <Avatar className="mt-0.5 h-7 w-7">
                      <AvatarImage src={message.image} alt={message.name} />
                      <AvatarFallback>
                        {message.name?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold">
                          {message.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatClock(message.createdAt)}
                        </span>
                      </div>
                      <p className="break-words text-sm">{message.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={sendMessage} className="flex gap-2 border-t p-3">
                <Input
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  maxLength={500}
                  placeholder={joined ? "Send a message" : "Joining party..."}
                  disabled={!joined}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!joined || !chatText.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
