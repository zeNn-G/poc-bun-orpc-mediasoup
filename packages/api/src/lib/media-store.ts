import type * as mediasoup from "mediasoup";

export interface PeerMedia {
  peerId: string;
  roomId: string;
  sendTransport: mediasoup.types.WebRtcTransport | null;
  recvTransport: mediasoup.types.WebRtcTransport | null;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
}

export interface MediaRoom {
  router: mediasoup.types.Router;
  peers: Map<string, PeerMedia>;
}

const mediaRooms = new Map<string, MediaRoom>();
const connectionToPeer = new Map<string, { roomId: string; peerId: string }>();

export function getMediaRoom(roomId: string): MediaRoom | undefined {
  return mediaRooms.get(roomId);
}

export function getOrCreateMediaRoom(
  roomId: string,
  router: mediasoup.types.Router,
): MediaRoom {
  let room = mediaRooms.get(roomId);
  if (!room) {
    room = { router, peers: new Map() };
    mediaRooms.set(roomId, room);
  }
  return room;
}

export function addPeerMedia(roomId: string, peerId: string): PeerMedia {
  const room = mediaRooms.get(roomId);
  if (!room) throw new Error(`Media room ${roomId} not found`);

  const peer: PeerMedia = {
    peerId,
    roomId,
    sendTransport: null,
    recvTransport: null,
    producers: new Map(),
    consumers: new Map(),
  };
  room.peers.set(peerId, peer);
  return peer;
}

export function getPeerMedia(roomId: string, peerId: string): PeerMedia | undefined {
  return mediaRooms.get(roomId)?.peers.get(peerId);
}

export function removePeerMedia(roomId: string, peerId: string): PeerMedia | undefined {
  const room = mediaRooms.get(roomId);
  if (!room) return undefined;

  const peer = room.peers.get(peerId);
  if (!peer) return undefined;

  // Close all consumers
  for (const consumer of peer.consumers.values()) {
    consumer.close();
  }
  // Close all producers
  for (const producer of peer.producers.values()) {
    producer.close();
  }
  // Close transports
  peer.sendTransport?.close();
  peer.recvTransport?.close();

  room.peers.delete(peerId);
  return peer;
}

export function cleanupMediaRoom(roomId: string): boolean {
  const room = mediaRooms.get(roomId);
  if (room && room.peers.size === 0) {
    room.router.close();
    mediaRooms.delete(roomId);
    return true;
  }
  return false;
}

export function registerConnection(connectionId: string, roomId: string, peerId: string): void {
  connectionToPeer.set(connectionId, { roomId, peerId });
}

export function getConnectionPeer(connectionId: string): { roomId: string; peerId: string } | undefined {
  return connectionToPeer.get(connectionId);
}

export function unregisterConnection(connectionId: string): { roomId: string; peerId: string } | undefined {
  const info = connectionToPeer.get(connectionId);
  if (info) connectionToPeer.delete(connectionId);
  return info;
}
