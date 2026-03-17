import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, skipToken } from "@tanstack/react-query";
import { Button } from "@poc-bun-orpc-mediasoup/ui/components/button";
import { Input } from "@poc-bun-orpc-mediasoup/ui/components/input";
import { client, orpc } from "@/utils/orpc";
import { createWsClient } from "@/utils/orpc-ws";
import { useMediaSession, type ScreenQuality } from "@/hooks/use-media-session";
import { VideoGrid } from "@/components/video-grid";
import { MediaControls } from "@/components/media-controls";
import { ScreenShareDialog } from "@/components/screen-share-dialog";
import {
  Hash,
  Users,
  Phone,
  SendHorizonal,
  Wifi,
  WifiOff,
  MessageSquare,
  X,
} from "lucide-react";

export const Route = createFileRoute("/media-playground")({
  component: MediaPlaygroundComponent,
});

type RoomEvent =
  | { type: "message"; roomId: string; user: string; text: string; ts: number }
  | { type: "joined"; roomId: string; user: string; ts: number }
  | { type: "left"; roomId: string; user: string; ts: number }
  | { type: "media:peerJoinedCall"; roomId: string; peerId: string; ts: number }
  | { type: "media:peerLeftCall"; roomId: string; peerId: string; ts: number }
  | { type: "media:newProducer"; roomId: string; peerId: string; producerId: string; kind: string; appData?: Record<string, unknown>; ts: number }
  | { type: "media:producerClosed"; roomId: string; peerId: string; producerId: string; ts: number };

function MediaPlaygroundComponent() {
  const [username, setUsername] = useState("");
  const [usernameSet, setUsernameSet] = useState(false);

  if (!usernameSet) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-xs space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">Join</h1>
            <p className="text-xs text-muted-foreground">Enter a display name to continue</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Display name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim()) setUsernameSet(true);
              }}
              className="flex-1"
              autoFocus
            />
            <Button onClick={() => setUsernameSet(true)} disabled={!username.trim()}>
              Go
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <RoomView username={username} onChangeUser={() => setUsernameSet(false)} />;
}

function RoomView({ username, onChangeUser }: { username: string; onChangeUser: () => void }) {
  const [roomId, setRoomId] = useState("general");
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(false);
  const [screenQuality, setScreenQuality] = useState<ScreenQuality>("720p");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  const { client: wsClient, websocket } = useMemo(() => createWsClient(), []);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const onOpen = () => setWsConnected(true);
    const onClose = () => setWsConnected(false);
    websocket.addEventListener("open", onOpen);
    websocket.addEventListener("close", onClose);
    return () => { websocket.close(); };
  }, [websocket]);

  const media = useMediaSession(wsConnected ? wsClient : null, roomId, username);

  const liveQuery = useQuery(
    orpc.room.live.experimental_liveOptions({
      input: joined ? { roomId } : skipToken,
      retry: true,
    }),
  );

  useEffect(() => {
    if (liveQuery.data) {
      const event = liveQuery.data as RoomEvent;
      setEvents((prev) => [...prev, event]);
      if (event.type === "joined") {
        setMembers((prev) => prev.includes(event.user) ? prev : [...prev, event.user]);
      } else if (event.type === "left") {
        setMembers((prev) => prev.filter((m) => m !== event.user));
      }
      if (event.type === "message" && !chatOpen) {
        setUnreadCount((c) => c + 1);
      }
      media.handleRoomEvent(event).catch(() => {});
    }
  }, [liveQuery.data, media.handleRoomEvent, chatOpen]);

  useEffect(() => {
    feedRef.current?.scrollTo(0, feedRef.current.scrollHeight);
  }, [events]);

  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  const joinRoom = async () => {
    setLoading(true);
    try {
      setEvents([]);
      setJoined(true);
      const res = await client.room.join({ roomId, user: username });
      setMembers(res.members);
    } catch (e) {
      setJoined(false);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (media.isInCall) await media.leaveCall();
    setLoading(true);
    try {
      await client.room.leave({ roomId, user: username });
      setJoined(false);
      setMembers([]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim()) return;
    const text = messageText;
    setMessageText("");
    try {
      await client.room.sendMessage({ roomId, user: username, text });
    } catch (e) {
      console.error(e);
    }
  };

  // Pre-join lobby
  if (!joined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-xs space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">Room</h1>
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{username}</span>
              <button onClick={onChangeUser} className="ml-1.5 text-muted-foreground underline underline-offset-2 hover:text-foreground">change</button>
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Hash className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="room-id"
                className="pl-8"
                onKeyDown={(e) => { if (e.key === "Enter" && roomId.trim()) joinRoom(); }}
              />
            </div>
            <Button onClick={joinRoom} disabled={loading || !roomId.trim()}>
              {loading ? "..." : "Join"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-black/20">
      {/* Top bar — floating over video */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-linear-to-b from-black/60 to-transparent px-3 py-2">
        <div className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 text-white/60" />
          <span className="text-sm font-medium text-white/90">{roomId}</span>
          <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
            <Users className="h-3 w-3 text-white/60" />
            <span className="text-[10px] text-white/60">{members.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {wsConnected ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-400" />
          )}
          <button onClick={leaveRoom} className="text-xs text-white/60 hover:text-white">
            Leave
          </button>
        </div>
      </div>

      {/* Full-bleed video area */}
      <div className="flex-1">
        {!media.isInCall ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
              <Phone className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No active call</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Join to start sharing audio & video</p>
            </div>
            <Button onClick={media.joinCall} disabled={!wsConnected} size="sm">
              Join Call
            </Button>
          </div>
        ) : (
          <VideoGrid
            remoteStreams={media.remoteStreams}
            localStream={media.localStream}
            screenStream={media.screenStream}
            peerId={username}
          />
        )}
      </div>

      {/* Bottom controls — floating */}
      {media.isInCall && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center bg-linear-to-t from-black/60 to-transparent px-3 pb-3 pt-8">
          <MediaControls
            audioEnabled={media.audioEnabled}
            videoEnabled={media.videoEnabled}
            screenSharing={!!media.screenProducerId}
            screenQuality={screenQuality}
            onToggleAudio={media.toggleAudio}
            onToggleVideo={media.toggleVideo}
            onOpenShareDialog={() => setShareDialogOpen(true)}
            onStopScreenShare={media.stopScreenShare}
            onScreenQualityChange={(q) => {
              setScreenQuality(q);
              media.changeScreenQuality(q);
            }}
            onLeave={media.leaveCall}
          />
        </div>
      )}

      {/* Chat toggle button — floating bottom-right */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="absolute right-3 bottom-3 z-30 flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-2 text-xs font-medium ring-1 ring-border/50 shadow-lg backdrop-blur-sm transition-colors hover:bg-card"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
          {unreadCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat panel — slides in from right */}
      {chatOpen && (
        <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-border/30 bg-background/95 backdrop-blur-md">
          {/* Chat header */}
          <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chat</span>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {members.slice(0, 4).map((m) => (
                  <div
                    key={m}
                    className={`flex h-5 w-5 items-center justify-center rounded-full border border-background text-[9px] font-bold uppercase ${
                      m === username ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                    title={m}
                  >
                    {m[0]}
                  </div>
                ))}
                {members.length > 4 && (
                  <div className="flex h-5 items-center rounded-full bg-muted px-1.5 text-[9px] text-muted-foreground">
                    +{members.length - 4}
                  </div>
                )}
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-2 text-xs">
            {events.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">No messages yet</p>
            )}
            {events.map((event, i) => (
              <div key={i} className="py-0.5">
                {event.type === "message" ? (
                  <div className="group">
                    <span className="font-medium">{event.user}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                      {new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <p className="text-foreground/80">{event.text}</p>
                  </div>
                ) : event.type === "joined" || event.type === "left" ? (
                  <p className="py-0.5 text-[10px] text-muted-foreground">
                    {event.user} {event.type === "joined" ? "joined" : "left"}
                  </p>
                ) : event.type === "media:peerJoinedCall" || event.type === "media:peerLeftCall" ? (
                  <p className="py-0.5 text-[10px] text-emerald-400/70">
                    {event.peerId} {event.type === "media:peerJoinedCall" ? "joined call" : "left call"}
                  </p>
                ) : event.type === "media:newProducer" ? (
                  <p className="py-0.5 text-[10px] text-emerald-400/70">
                    {event.peerId} sharing {event.kind}{event.appData?.screen ? " (screen)" : ""}
                  </p>
                ) : event.type === "media:producerClosed" ? (
                  <p className="py-0.5 text-[10px] text-orange-400/70">
                    {event.peerId} stopped sharing
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-border/30 px-3 py-2">
            <div className="flex gap-1.5">
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder={`Message #${roomId}`}
                className="flex-1 text-xs"
              />
              <button
                onClick={sendMessage}
                disabled={!messageText.trim()}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <SendHorizonal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <ScreenShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onStart={(q) => {
          setScreenQuality(q);
          media.shareScreen(q);
        }}
      />
    </div>
  );
}
