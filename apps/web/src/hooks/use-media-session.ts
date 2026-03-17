import { useCallback, useEffect, useRef, useState } from "react";
import { MediaSession } from "@/lib/mediasoup-client";
import type { RouterClient } from "@orpc/server";
import type { WsRouter } from "@poc-bun-orpc-mediasoup/api/routers/ws";

type WsClient = RouterClient<WsRouter>;

export type ScreenQuality = "480p" | "720p" | "1080p" | "source";

const SCREEN_PRESETS: Record<ScreenQuality, { video: MediaTrackConstraints }> = {
  "480p": { video: { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } },
  "720p": { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } },
  "1080p": { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } },
  "source": { video: { frameRate: { ideal: 60 } } },
};

export interface RemoteStream {
  peerId: string;
  producerId: string;
  kind: string;
  track: MediaStreamTrack;
  appData?: Record<string, unknown>;
}

interface RoomEvent {
  type: string;
  roomId?: string;
  peerId?: string;
  producerId?: string;
  kind?: string;
  appData?: Record<string, unknown>;
}

export function useMediaSession(
  wsClient: WsClient | null,
  roomId: string,
  peerId: string,
) {
  const [isInCall, setIsInCall] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenProducerId, setScreenProducerId] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<MediaSession | null>(null);
  const audioProducerRef = useRef<string | null>(null);
  const videoProducerRef = useRef<string | null>(null);

  const joinCall = useCallback(async () => {
    if (!wsClient || isInCall) return;

    const session = new MediaSession(wsClient, roomId, peerId);
    sessionRef.current = session;

    try {
      const existingProducers = await session.join();

      // Get user media — try audio+video, fall back gracefully
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch {
            console.warn("No media devices available, joining without local media");
          }
        }
      }

      if (stream) {
        setLocalStream(stream);

        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        if (audioTrack) {
          const producer = await session.produceAudio(audioTrack);
          audioProducerRef.current = producer.id;
        }
        if (videoTrack) {
          const producer = await session.produceVideo(videoTrack);
          videoProducerRef.current = producer.id;
        }
      }

      // Consume existing producers
      for (const p of existingProducers) {
        try {
          const { track } = await session.consumeProducer(p.producerId);
          setRemoteStreams((prev) => [
            ...prev,
            {
              peerId: p.peerId,
              producerId: p.producerId,
              kind: p.kind,
              track,
              appData: p.appData,
            },
          ]);
        } catch (e) {
          console.error("Failed to consume existing producer:", e);
        }
      }

      setIsInCall(true);
    } catch (e) {
      console.error("Failed to join media call:", e);
      // Clean up on failure
      sessionRef.current = null;
      await session.leave().catch(() => {});
    }
  }, [wsClient, roomId, peerId, isInCall]);

  const leaveCall = useCallback(async () => {
    if (!sessionRef.current) return;

    // Stop local tracks
    if (localStream) {
      for (const track of localStream.getTracks()) track.stop();
    }
    setLocalStream(null);

    if (screenStream) {
      for (const track of screenStream.getTracks()) track.stop();
      setScreenStream(null);
    }

    await sessionRef.current.leave();
    sessionRef.current = null;
    audioProducerRef.current = null;
    videoProducerRef.current = null;
    setScreenProducerId(null);
    setRemoteStreams([]);
    setIsInCall(false);
    setAudioEnabled(true);
    setVideoEnabled(true);
  }, [localStream, screenStream]);

  const toggleAudio = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setAudioEnabled(audioTrack.enabled);
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
    }
  }, [localStream]);

  const shareScreen = useCallback(async (quality: ScreenQuality = "720p") => {
    if (!sessionRef.current) return;
    const preset = SCREEN_PRESETS[quality];
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: preset.video,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      setScreenStream(displayStream);

      // Produce video track
      const screenVideoTrack = displayStream.getVideoTracks()[0];
      if (screenVideoTrack) {
        const producer = await sessionRef.current.produceScreen(screenVideoTrack);
        setScreenProducerId(producer.id);

        screenVideoTrack.addEventListener("ended", () => {
          setScreenProducerId(null);
          setScreenStream(null);
        });
      }

      // Produce audio track (system/tab audio)
      const screenAudioTrack = displayStream.getAudioTracks()[0];
      if (screenAudioTrack && sessionRef.current) {
        await sessionRef.current.produceAudio(screenAudioTrack);
      }
    } catch (e) {
      console.error("Screen share failed:", e);
    }
  }, []);

  const changeScreenQuality = useCallback(async (quality: ScreenQuality) => {
    if (!screenStream) return;
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) return;
    const preset = SCREEN_PRESETS[quality];
    await videoTrack.applyConstraints(preset.video);
  }, [screenStream]);

  const stopScreenShare = useCallback(async () => {
    if (!sessionRef.current || !screenProducerId) return;
    await sessionRef.current.closeProducer(screenProducerId);
    setScreenProducerId(null);
    if (screenStream) {
      for (const track of screenStream.getTracks()) track.stop();
      setScreenStream(null);
    }
  }, [screenProducerId, screenStream]);

  // Handle room events for media
  const handleRoomEvent = useCallback(
    async (event: RoomEvent) => {
      if (!sessionRef.current || !isInCall) return;

      if (
        event.type === "media:newProducer" &&
        event.peerId !== peerId &&
        event.producerId
      ) {
        try {
          const { track } = await sessionRef.current.consumeProducer(
            event.producerId,
          );
          setRemoteStreams((prev) => [
            ...prev,
            {
              peerId: event.peerId!,
              producerId: event.producerId!,
              kind: event.kind ?? "unknown",
              track,
              appData: event.appData,
            },
          ]);
        } catch (e) {
          console.error("Failed to consume new producer:", e);
        }
      } else if (
        event.type === "media:producerClosed" &&
        event.producerId
      ) {
        setRemoteStreams((prev) =>
          prev.filter((s) => s.producerId !== event.producerId),
        );
      } else if (
        event.type === "media:peerLeftCall" &&
        event.peerId !== peerId
      ) {
        setRemoteStreams((prev) =>
          prev.filter((s) => s.peerId !== event.peerId),
        );
      }
    },
    [isInCall, peerId],
  );

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (session) {
        session.leave().catch(() => {});
        sessionRef.current = null;
      }
    };
  }, []);

  return {
    isInCall,
    remoteStreams,
    audioEnabled,
    videoEnabled,
    localStream,
    screenProducerId,
    screenStream,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    shareScreen,
    stopScreenShare,
    changeScreenQuality,
    handleRoomEvent,
  };
}
