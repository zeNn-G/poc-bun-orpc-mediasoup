import { z } from "zod";

export const JoinMediaInputSchema = z.object({
  roomId: z.string().min(1),
  peerId: z.string().min(1),
});

export const JoinMediaOutputSchema = z.object({
  rtpCapabilities: z.any(),
});

export const CreateTransportInputSchema = z.object({
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  direction: z.enum(["send", "recv"]),
});

export const CreateTransportOutputSchema = z.object({
  id: z.string(),
  iceParameters: z.any(),
  iceCandidates: z.any(),
  dtlsParameters: z.any(),
});

export const ConnectTransportInputSchema = z.object({
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  transportId: z.string().min(1),
  dtlsParameters: z.any(),
});

export const ProduceInputSchema = z.object({
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  transportId: z.string().min(1),
  kind: z.enum(["audio", "video"]),
  rtpParameters: z.any(),
  appData: z.record(z.string(), z.any()).optional(),
});

export const ProduceOutputSchema = z.object({
  producerId: z.string(),
});

export const ConsumeInputSchema = z.object({
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  producerId: z.string().min(1),
  rtpCapabilities: z.any(),
});

export const ConsumeOutputSchema = z.object({
  consumerId: z.string(),
  producerId: z.string(),
  kind: z.string(),
  rtpParameters: z.any(),
});

export const ResumeConsumerInputSchema = z.object({
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  consumerId: z.string().min(1),
});

export const CloseProducerInputSchema = z.object({
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  producerId: z.string().min(1),
});

export const MediaPeersInputSchema = z.object({
  roomId: z.string().min(1),
});
