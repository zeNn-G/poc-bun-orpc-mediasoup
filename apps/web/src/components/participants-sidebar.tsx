import { useMemo } from "react";
import { Mic, MicOff, Users } from "lucide-react";
import { VolumeContextMenu } from "@/components/volume-context-menu";
import type { VolumeSettings } from "@/hooks/use-volume-settings";
import type { RemoteStream } from "@/hooks/use-media-session";

function getAvatarColor(name: string): string {
  const colors = [
    "bg-red-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-purple-500",
    "bg-amber-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-orange-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function ParticipantRow({
  peerId,
  isLocal,
  isSpeaking,
  volumeSettings,
}: {
  peerId: string;
  isLocal: boolean;
  isSpeaking: boolean;
  volumeSettings: VolumeSettings;
}) {
  const settings = volumeSettings.getSettings(peerId);
  const avatarColor = getAvatarColor(peerId);

  const row = (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-white/5">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold uppercase text-white ${avatarColor} ${
            isSpeaking ? "ring-2 ring-emerald-400 animate-pulse" : ""
          }`}
        >
          {peerId[0]}
        </div>
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm text-foreground/90">{peerId}</span>
        {isLocal && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
      </div>

      {/* Mic indicator */}
      <div className="shrink-0 text-muted-foreground">
        {!isLocal && settings.muted ? (
          <MicOff className="h-3.5 w-3.5 text-red-400/70" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
      </div>
    </div>
  );

  if (isLocal) return row;

  return (
    <VolumeContextMenu peerId={peerId} volumeSettings={volumeSettings}>
      {row}
    </VolumeContextMenu>
  );
}

export function ParticipantsSidebar({
  localPeerId,
  remoteStreams,
  isInCall,
  speakingPeers,
  volumeSettings,
}: {
  localPeerId: string;
  remoteStreams: RemoteStream[];
  isInCall: boolean;
  speakingPeers: Set<string>;
  volumeSettings: VolumeSettings;
}) {
  // Derive call participants from remote streams + local user
  const participants = useMemo(() => {
    const peerIds = new Set<string>();
    if (isInCall) peerIds.add(localPeerId);
    for (const s of remoteStreams) {
      peerIds.add(s.peerId);
    }
    // Local user first, then others sorted
    const others = [...peerIds].filter((id) => id !== localPeerId).sort();
    return isInCall ? [localPeerId, ...others] : others;
  }, [localPeerId, remoteStreams, isInCall]);

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-border/30 bg-background/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Participants ({participants.length})
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {participants.map((m) => (
          <ParticipantRow
            key={m}
            peerId={m}
            isLocal={m === localPeerId}
            isSpeaking={speakingPeers.has(m)}
            volumeSettings={volumeSettings}
          />
        ))}
      </div>
    </div>
  );
}
