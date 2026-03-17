import { publicProcedure } from "../index";
import { env } from "@poc-bun-orpc-mediasoup/env/server";
import { getOrCreateRouter, deleteRouter } from "../lib/mediasoup-worker";
import {
  getOrCreateMediaRoom,
  addPeerMedia,
  getPeerMedia,
  removePeerMedia,
  cleanupMediaRoom,
  getMediaRoom,
  registerConnection,
} from "../lib/media-store";
import { publisher } from "../lib/room-store";
import {
  JoinMediaInputSchema,
  CreateTransportInputSchema,
  ConnectTransportInputSchema,
  ProduceInputSchema,
  ConsumeInputSchema,
  ResumeConsumerInputSchema,
  CloseProducerInputSchema,
  MediaPeersInputSchema,
} from "../schemas/media";

export const mediaRouter = {
  joinMedia: publicProcedure
    .input(JoinMediaInputSchema)
    .handler(async ({ input, context }) => {
      const router = await getOrCreateRouter(input.roomId);
      const room = getOrCreateMediaRoom(input.roomId, router);

      // Don't add duplicate peer
      if (!room.peers.has(input.peerId)) {
        addPeerMedia(input.roomId, input.peerId);
      }

      // Register connection for disconnect cleanup
      if (context.connectionId) {
        registerConnection(context.connectionId, input.roomId, input.peerId);
      }

      await publisher.publish(`room:${input.roomId}`, {
        type: "media:peerJoinedCall",
        roomId: input.roomId,
        peerId: input.peerId,
        ts: Date.now(),
      });

      return { rtpCapabilities: router.rtpCapabilities };
    }),

  createTransport: publicProcedure
    .input(CreateTransportInputSchema)
    .handler(async ({ input }) => {
      const room = getMediaRoom(input.roomId);
      if (!room) throw new Error(`Media room ${input.roomId} not found`);

      const peer = getPeerMedia(input.roomId, input.peerId);
      if (!peer) throw new Error(`Peer ${input.peerId} not found`);

      const transport = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: "udp",
            ip: "0.0.0.0",
            announcedAddress: env.MEDIASOUP_ANNOUNCED_IP,
          },
          {
            protocol: "tcp",
            ip: "0.0.0.0",
            announcedAddress: env.MEDIASOUP_ANNOUNCED_IP,
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferTcp: true, // TCP more reliable through Docker on Windows
      });

      if (input.direction === "send") {
        peer.sendTransport = transport;
      } else {
        peer.recvTransport = transport;
      }

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    }),

  connectTransport: publicProcedure
    .input(ConnectTransportInputSchema)
    .handler(async ({ input }) => {
      const peer = getPeerMedia(input.roomId, input.peerId);
      if (!peer) throw new Error(`Peer ${input.peerId} not found`);

      const transport =
        peer.sendTransport?.id === input.transportId
          ? peer.sendTransport
          : peer.recvTransport?.id === input.transportId
            ? peer.recvTransport
            : null;

      if (!transport) throw new Error(`Transport ${input.transportId} not found`);

      await transport.connect({ dtlsParameters: input.dtlsParameters });
      return { connected: true };
    }),

  produce: publicProcedure
    .input(ProduceInputSchema)
    .handler(async ({ input }) => {
      const peer = getPeerMedia(input.roomId, input.peerId);
      if (!peer) throw new Error(`Peer ${input.peerId} not found`);

      if (!peer.sendTransport) throw new Error("Send transport not created");

      const producer = await peer.sendTransport.produce({
        kind: input.kind,
        rtpParameters: input.rtpParameters,
        appData: input.appData ?? {},
      });

      peer.producers.set(producer.id, producer);

      await publisher.publish(`room:${input.roomId}`, {
        type: "media:newProducer",
        roomId: input.roomId,
        peerId: input.peerId,
        producerId: producer.id,
        kind: input.kind,
        appData: input.appData,
        ts: Date.now(),
      });

      return { producerId: producer.id };
    }),

  consume: publicProcedure
    .input(ConsumeInputSchema)
    .handler(async ({ input }) => {
      const room = getMediaRoom(input.roomId);
      if (!room) throw new Error(`Media room ${input.roomId} not found`);

      const peer = getPeerMedia(input.roomId, input.peerId);
      if (!peer) throw new Error(`Peer ${input.peerId} not found`);
      if (!peer.recvTransport) throw new Error("Recv transport not created");

      // Find the producer across all peers
      let producer = null;
      for (const p of room.peers.values()) {
        producer = p.producers.get(input.producerId) ?? null;
        if (producer) break;
      }
      if (!producer) throw new Error(`Producer ${input.producerId} not found`);

      if (
        !room.router.canConsume({
          producerId: input.producerId,
          rtpCapabilities: input.rtpCapabilities,
        })
      ) {
        throw new Error("Cannot consume this producer");
      }

      const consumer = await peer.recvTransport.consume({
        producerId: input.producerId,
        rtpCapabilities: input.rtpCapabilities,
        paused: true,
      });

      peer.consumers.set(consumer.id, consumer);

      return {
        consumerId: consumer.id,
        producerId: input.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    }),

  resumeConsumer: publicProcedure
    .input(ResumeConsumerInputSchema)
    .handler(async ({ input }) => {
      const peer = getPeerMedia(input.roomId, input.peerId);
      if (!peer) throw new Error(`Peer ${input.peerId} not found`);

      const consumer = peer.consumers.get(input.consumerId);
      if (!consumer) throw new Error(`Consumer ${input.consumerId} not found`);

      await consumer.resume();
      return { resumed: true };
    }),

  closeProducer: publicProcedure
    .input(CloseProducerInputSchema)
    .handler(async ({ input }) => {
      const peer = getPeerMedia(input.roomId, input.peerId);
      if (!peer) throw new Error(`Peer ${input.peerId} not found`);

      const producer = peer.producers.get(input.producerId);
      if (!producer) throw new Error(`Producer ${input.producerId} not found`);

      producer.close();
      peer.producers.delete(input.producerId);

      await publisher.publish(`room:${input.roomId}`, {
        type: "media:producerClosed",
        roomId: input.roomId,
        peerId: input.peerId,
        producerId: input.producerId,
        ts: Date.now(),
      });

      return { closed: true };
    }),

  leaveMedia: publicProcedure
    .input(JoinMediaInputSchema)
    .handler(async ({ input }) => {
      const peer = removePeerMedia(input.roomId, input.peerId);
      if (!peer) return { left: true };

      await publisher.publish(`room:${input.roomId}`, {
        type: "media:peerLeftCall",
        roomId: input.roomId,
        peerId: input.peerId,
        ts: Date.now(),
      });

      if (cleanupMediaRoom(input.roomId)) {
        deleteRouter(input.roomId);
      }

      return { left: true };
    }),

  mediaPeers: publicProcedure
    .input(MediaPeersInputSchema)
    .handler(({ input }) => {
      const room = getMediaRoom(input.roomId);
      if (!room) return { peers: [] };

      const peers = [...room.peers.values()].map((peer) => ({
        peerId: peer.peerId,
        producers: [...peer.producers.values()].map((p) => ({
          producerId: p.id,
          kind: p.kind,
          appData: p.appData,
        })),
      }));

      return { peers };
    }),
};
