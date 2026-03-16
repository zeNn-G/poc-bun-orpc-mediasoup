import { MemoryPublisher } from "@orpc/experimental-publisher/memory";
import type { RoomEvent } from "../schemas/room";

export const publisher = new MemoryPublisher<Record<string, RoomEvent>>();

const rooms = new Map<string, Set<string>>();

export function getOrCreateRoom(roomId: string): Set<string> {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Set();
    rooms.set(roomId, room);
  }
  return room;
}

export function getRoom(roomId: string): Set<string> | undefined {
  return rooms.get(roomId);
}

export function removeUserFromRoom(roomId: string, user: string): void {
  const room = rooms.get(roomId);
  if (room) {
    room.delete(user);
    if (room.size === 0) rooms.delete(roomId);
  }
}
