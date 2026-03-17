import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, skipToken } from "@tanstack/react-query";
import { Button } from "@poc-bun-orpc-mediasoup/ui/components/button";
import { Card } from "@poc-bun-orpc-mediasoup/ui/components/card";
import { Input } from "@poc-bun-orpc-mediasoup/ui/components/input";
import { client, orpc } from "@/utils/orpc";
import { createWsClient } from "@/utils/orpc-ws";

export const Route = createFileRoute("/ws-playground")({
  component: WsPlaygroundComponent,
});

type RoomEvent =
  | { type: "message"; roomId: string; user: string; text: string; ts: number }
  | { type: "joined"; roomId: string; user: string; ts: number }
  | { type: "left"; roomId: string; user: string; ts: number }
  | { type: "media:peerJoinedCall"; roomId: string; peerId: string; ts: number }
  | { type: "media:peerLeftCall"; roomId: string; peerId: string; ts: number }
  | { type: "media:newProducer"; roomId: string; peerId: string; producerId: string; kind: string; ts: number }
  | { type: "media:producerClosed"; roomId: string; peerId: string; producerId: string; ts: number };

function WsPlaygroundComponent() {
  const [username, setUsername] = useState("");
  const [usernameSet, setUsernameSet] = useState(false);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-4 grid gap-4">
      <h1 className="text-xl font-bold">WS Playground</h1>

      {!usernameSet ? (
        <Card className="p-4 grid gap-3">
          <h2 className="font-medium">Set Username</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Enter your username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim()) setUsernameSet(true);
              }}
              className="flex-1"
            />
            <Button
              onClick={() => setUsernameSet(true)}
              disabled={!username.trim()}
            >
              Set
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="text-sm text-muted-foreground">
            Logged in as{" "}
            <span className="font-medium text-foreground">{username}</span>
            <Button
              variant="link"
              size="sm"
              className="ml-2 h-auto p-0 text-xs"
              onClick={() => setUsernameSet(false)}
            >
              change
            </Button>
          </div>
          <RoomCard username={username} />
          <WsEchoCard />
        </div>
      )}
    </div>
  );
}

function RoomCard({ username }: { username: string }) {
  const [roomId, setRoomId] = useState("general");
  const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const liveQuery = useQuery(
    orpc.room.live.experimental_liveOptions({
      input: joined ? { roomId } : skipToken,
      retry: true,
    }),
  );

  // Accumulate events from live query
  useEffect(() => {
    const event = liveQuery.data;
    if (event) {
      setEvents((prev) => [...prev, event]);

      if (event.type === "joined") {
        setMembers((prev) =>
          prev.includes(event.user) ? prev : [...prev, event.user],
        );
      } else if (event.type === "left") {
        setMembers((prev) => prev.filter((m) => m !== event.user));
      }
    }
  }, [liveQuery.data]);

  // Auto-scroll feed
  useEffect(() => {
    feedRef.current?.scrollTo(0, feedRef.current.scrollHeight);
  }, [events]);

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

  return (
    <Card className="p-4 grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Room (SSE/HTTP)</h2>
        <div className="flex items-center gap-2">
          {!joined && (
            <Input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="room id"
              className="h-8 w-32 text-sm"
            />
          )}
          {joined && (
            <span className="text-sm font-mono text-muted-foreground">
              #{roomId}
            </span>
          )}
          <Button
            size="sm"
            onClick={joined ? leaveRoom : joinRoom}
            disabled={loading || !roomId.trim()}
          >
            {loading ? "..." : joined ? "Leave" : "Join"}
          </Button>
        </div>
      </div>

      {joined && (
        <>
          {/* Members */}
          <div className="flex gap-1 flex-wrap">
            {members.map((m) => (
              <span
                key={m}
                className={`text-xs px-2 py-0.5 rounded-full ${
                  m === username
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {m}
              </span>
            ))}
          </div>

          {/* Message feed */}
          <div
            ref={feedRef}
            className="h-64 overflow-y-auto rounded bg-muted/50 p-2 font-mono text-xs space-y-0.5"
          >
            {events.length === 0 && (
              <span className="text-muted-foreground">
                Waiting for events...
              </span>
            )}
            {events.map((event, i) => (
              <div key={i}>
                <span className="opacity-50">
                  {new Date(event.ts).toLocaleTimeString()}
                </span>{" "}
                {event.type === "message" ? (
                  <>
                    <span className="font-semibold">{event.user}</span>:{" "}
                    {event.text}
                  </>
                ) : event.type === "joined" || event.type === "left" ? (
                  <span className="text-muted-foreground italic">
                    {event.user} {event.type === "joined" ? "joined" : "left"}{" "}
                    the room
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">
                    [media event: {event.type}]
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Message input */}
          <div className="flex gap-2">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={!messageText.trim()}>
              Send
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function WsEchoCard() {
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("hello world");
  const [result, setResult] = useState<{
    echoed: string;
    ts: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const { client: wsClient, websocket } = useMemo(() => createWsClient(), []);

  useEffect(() => {
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    websocket.addEventListener("open", onOpen);
    websocket.addEventListener("close", onClose);
    return () => {
      websocket.close();
    };
  }, [websocket]);

  const send = async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const res = await wsClient.echo({ message });
      setResult(res);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 grid gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Echo (WebSocket)</h2>
          <div
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="h-8 w-48 text-sm"
            disabled={loading || !connected}
          />
          <Button size="sm" onClick={send} disabled={loading || !connected}>
            {loading ? "..." : "Send"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Simple request/response over pure WebSocket.
      </p>
      {result && (
        <div className="text-sm font-mono rounded bg-muted/50 p-2">
          <span className="text-muted-foreground">echoed:</span> {result.echoed}{" "}
          <span className="text-muted-foreground">
            ({new Date(result.ts).toLocaleTimeString()})
          </span>
        </div>
      )}
    </Card>
  );
}
