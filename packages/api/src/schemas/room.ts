import { z } from "zod";

export const RoomIdSchema = z.string().min(1);
export const UserSchema = z.string().min(1);

export const RoomInputSchema = z.object({
  roomId: RoomIdSchema,
  user: UserSchema,
});

export const SendMessageInputSchema = z.object({
  roomId: RoomIdSchema,
  user: UserSchema,
  text: z.string().min(1),
});

export const RoomEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    roomId: z.string(),
    user: z.string(),
    text: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("joined"),
    roomId: z.string(),
    user: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("left"),
    roomId: z.string(),
    user: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("media:peerJoinedCall"),
    roomId: z.string(),
    peerId: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("media:peerLeftCall"),
    roomId: z.string(),
    peerId: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("media:newProducer"),
    roomId: z.string(),
    peerId: z.string(),
    producerId: z.string(),
    kind: z.string(),
    appData: z.record(z.string(), z.any()).optional(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("media:producerClosed"),
    roomId: z.string(),
    peerId: z.string(),
    producerId: z.string(),
    ts: z.number(),
  }),
]);

export type RoomEvent = z.infer<typeof RoomEventSchema>;
