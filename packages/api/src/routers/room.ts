import { eventIterator } from "@orpc/server";
import { z } from "zod";
import { publicProcedure } from "../index";
import {
  publisher,
  getOrCreateRoom,
  getRoom,
  removeUserFromRoom,
} from "../lib/room-store";
import {
  RoomIdSchema,
  RoomInputSchema,
  SendMessageInputSchema,
  RoomEventSchema,
} from "../schemas/room";

export const roomRouter = {
  join: publicProcedure.input(RoomInputSchema).handler(async ({ input }) => {
    const room = getOrCreateRoom(input.roomId);
    room.add(input.user);
    await publisher.publish(`room:${input.roomId}`, {
      type: "joined",
      roomId: input.roomId,
      user: input.user,
      ts: Date.now(),
    });
    return { status: "joined" as const, members: [...room] };
  }),

  leave: publicProcedure.input(RoomInputSchema).handler(async ({ input }) => {
    removeUserFromRoom(input.roomId, input.user);
    await publisher.publish(`room:${input.roomId}`, {
      type: "left",
      roomId: input.roomId,
      user: input.user,
      ts: Date.now(),
    });
    return { status: "left" as const };
  }),

  sendMessage: publicProcedure
    .input(SendMessageInputSchema)
    .handler(async ({ input }) => {
      const ts = Date.now();
      await publisher.publish(`room:${input.roomId}`, {
        type: "message",
        roomId: input.roomId,
        user: input.user,
        text: input.text,
        ts,
      });
      return { sent: true, ts };
    }),

  members: publicProcedure
    .input(z.object({ roomId: RoomIdSchema }))
    .handler(({ input }) => {
      const room = getRoom(input.roomId);
      return { members: room ? [...room] : [] };
    }),

  live: publicProcedure
    .input(z.object({ roomId: RoomIdSchema }))
    .output(eventIterator(RoomEventSchema))
    .handler(async function* ({ input, signal }) {
      try {
        for await (const event of publisher.subscribe(
          `room:${input.roomId}`,
          { signal },
        )) {
          yield event;
        }
      } finally {
        console.log(`[room:live] cleanup room:${input.roomId}`);
      }
    }),
};
