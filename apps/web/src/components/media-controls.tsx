import { Button } from "@poc-bun-orpc-mediasoup/ui/components/button";
import type { ScreenQuality } from "@/hooks/use-media-session";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  PhoneOff,
  ChevronDown,
} from "lucide-react";

const QUALITY_OPTIONS: { value: ScreenQuality; label: string }[] = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "source", label: "Source" },
];

interface MediaControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  screenQuality: ScreenQuality;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onOpenShareDialog: () => void;
  onStopScreenShare: () => void;
  onScreenQualityChange: (quality: ScreenQuality) => void;
  onLeave: () => void;
}

export function MediaControls({
  audioEnabled,
  videoEnabled,
  screenSharing,
  screenQuality,
  onToggleAudio,
  onToggleVideo,
  onOpenShareDialog,
  onStopScreenShare,
  onScreenQualityChange,
  onLeave,
}: MediaControlsProps) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-lg bg-card/80 px-2 py-1.5 ring-1 ring-border/50 backdrop-blur-sm">
      {/* Mic */}
      <button
        onClick={onToggleAudio}
        className={`rounded-md p-2 transition-colors ${
          audioEnabled
            ? "text-foreground hover:bg-muted"
            : "bg-destructive/15 text-destructive hover:bg-destructive/25"
        }`}
      >
        {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </button>

      {/* Camera */}
      <button
        onClick={onToggleVideo}
        className={`rounded-md p-2 transition-colors ${
          videoEnabled
            ? "text-foreground hover:bg-muted"
            : "bg-destructive/15 text-destructive hover:bg-destructive/25"
        }`}
      >
        {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </button>

      <div className="mx-1 h-5 w-px bg-border/50" />

      {/* Screen share */}
      {screenSharing ? (
        <div className="flex items-center gap-0.5">
          <div className="relative">
            <select
              value={screenQuality}
              onChange={(e) => onScreenQualityChange(e.target.value as ScreenQuality)}
              className="h-8 appearance-none rounded-md bg-emerald-500/10 py-0 pr-6 pl-2 text-xs font-medium text-emerald-400 outline-none"
            >
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 text-emerald-400/60" />
          </div>
          <button
            onClick={onStopScreenShare}
            className="rounded-md bg-emerald-500/15 p-2 text-emerald-400 transition-colors hover:bg-emerald-500/25"
          >
            <ScreenShareOff className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={onOpenShareDialog}
          className="rounded-md p-2 text-foreground transition-colors hover:bg-muted"
        >
          <ScreenShare className="h-4 w-4" />
        </button>
      )}

      <div className="mx-1 h-5 w-px bg-border/50" />

      {/* Leave */}
      <button
        onClick={onLeave}
        className="rounded-md bg-destructive/15 p-2 text-destructive transition-colors hover:bg-destructive/25"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}
