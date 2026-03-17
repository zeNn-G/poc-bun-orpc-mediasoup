import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, MonitorPlay, Eye, EyeOff, Volume2, VolumeOff } from "lucide-react";
import { Button } from "@poc-bun-orpc-mediasoup/ui/components/button";
import type { RemoteStream } from "@/hooks/use-media-session";

function AudioTile({ track, muted }: { track: MediaStreamTrack; muted?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    if (!muted) el.play().catch(() => {});
    return () => {
      el.pause();
      el.srcObject = null;
    };
  }, [track, muted]);

  return <audio ref={ref} autoPlay={!muted} muted={muted} playsInline />;
}

function VideoTile({
  track,
  label,
  muted,
}: {
  track: MediaStreamTrack;
  label: string;
  muted?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    return () => {
      el.srcObject = null;
    };
  }, [track]);

  const goFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.();
  }, []);

  return (
    <div ref={containerRef} className="group relative h-full w-full overflow-hidden rounded-md bg-black/80">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5 pt-5">
        <span className="text-[11px] font-medium text-white/90">{label}</span>
      </div>
      <button
        onClick={goFullscreen}
        className="absolute top-1.5 right-1.5 rounded bg-black/50 p-1 text-white/70 opacity-0 transition-all hover:bg-black/70 hover:text-white group-hover:opacity-100"
      >
        <Maximize className="h-3 w-3" />
      </button>
    </div>
  );
}

function ScreenShareViewer({
  videoTrack,
  audioTrack,
  isLocal,
  onClose,
}: {
  videoTrack: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  isLocal: boolean;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioMuted, setAudioMuted] = useState(true);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([videoTrack]);
    return () => {
      el.srcObject = null;
    };
  }, [videoTrack]);

  const goFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 z-10 flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="h-full w-full object-contain"
      />
      {/* Top controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {audioTrack && (
          <button
            onClick={() => setAudioMuted(!audioMuted)}
            className="rounded-md bg-black/50 p-1.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
          >
            {audioMuted ? <VolumeOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
        <button
          onClick={goFullscreen}
          className="rounded-md bg-black/50 p-1.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
        >
          <Maximize className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          className="rounded-md bg-black/50 p-1.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
        >
          <EyeOff className="h-4 w-4" />
        </button>
      </div>
      {audioTrack && <AudioTile track={audioTrack} muted={audioMuted} />}
    </div>
  );
}

interface ScreenShareInfo {
  id: string;
  peerId: string;
  videoTrack: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  isLocal: boolean;
}

export function VideoGrid({
  remoteStreams,
  localStream,
  screenStream,
  peerId,
}: {
  remoteStreams: RemoteStream[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  peerId: string;
}) {
  const localVideoTrack = localStream?.getVideoTracks()[0];
  const screenPreviewTrack = screenStream?.getVideoTracks()[0];

  const videoStreams = remoteStreams.filter((s) => s.kind === "video");
  const audioStreams = remoteStreams.filter((s) => s.kind === "audio" && !s.appData?.screen);
  const screenAudioStreams = remoteStreams.filter((s) => s.kind === "audio" && s.appData?.screen);

  const remoteScreens = videoStreams.filter((s) => s.appData?.screen);
  const remoteCameras = videoStreams.filter((s) => !s.appData?.screen);

  const [watchingId, setWatchingId] = useState<string | null>(null);

  // Build screen share list
  const screenShares: ScreenShareInfo[] = [];
  if (screenPreviewTrack) {
    screenShares.push({ id: "local-screen", peerId, videoTrack: screenPreviewTrack, isLocal: true });
  }
  for (const s of remoteScreens) {
    const matchingAudio = screenAudioStreams.find((a) => a.peerId === s.peerId);
    screenShares.push({ id: s.producerId, peerId: s.peerId, videoTrack: s.track, isLocal: false, audioTrack: matchingAudio?.track });
  }

  const activeShare = screenShares.find((s) => s.id === watchingId);
  const cameraCount = remoteCameras.length + (localVideoTrack ? 1 : 0);
  const cols = cameraCount <= 1 ? 1 : cameraCount <= 4 ? 2 : 3;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Main area */}
      <div className="relative flex-1">
        {/* Camera grid — always visible as base layer */}
        {cameraCount > 0 ? (
          <div
            className="absolute inset-0 grid gap-1.5 p-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: "1fr" }}
          >
            {remoteCameras.map((s) => (
              <VideoTile key={s.producerId} track={s.track} label={s.peerId} />
            ))}
            {localVideoTrack && (
              <VideoTile track={localVideoTrack} label={`${peerId} (you)`} muted />
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No video streams</p>
          </div>
        )}

        {/* Screen share notification cards — centered */}
        {screenShares.length > 0 && !activeShare && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="flex flex-col gap-2">
              {screenShares.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card/95 px-8 py-6 shadow-2xl backdrop-blur-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                    <MonitorPlay className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{s.peerId}</p>
                    <p className="text-xs text-muted-foreground">is presenting</p>
                  </div>
                  <Button size="sm" onClick={() => setWatchingId(s.id)} className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    Watch
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Screen share fullscreen viewer — overlays everything */}
        {activeShare && (
          <ScreenShareViewer
            videoTrack={activeShare.videoTrack}
            audioTrack={activeShare.audioTrack}
            isLocal={activeShare.isLocal}
            onClose={() => setWatchingId(null)}
          />
        )}
      </div>

      {/* Mic audio — always plays */}
      {audioStreams.map((s) => (
        <AudioTile key={s.producerId} track={s.track} />
      ))}
    </div>
  );
}
