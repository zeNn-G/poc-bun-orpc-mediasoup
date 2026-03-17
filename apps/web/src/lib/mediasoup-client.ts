import { Device } from "mediasoup-client";
import type { Transport, Producer, Consumer } from "mediasoup-client/types";
import type { RouterClient } from "@orpc/server";
import type { WsRouter } from "@poc-bun-orpc-mediasoup/api/routers/ws";

type WsClient = RouterClient<WsRouter>;

export class MediaSession {
  private device: Device;
  private wsClient: WsClient;
  private roomId: string;
  private peerId: string;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producers = new Map<string, Producer>();
  private consumers = new Map<string, Consumer>();

  constructor(wsClient: WsClient, roomId: string, peerId: string) {
    this.device = new Device();
    this.wsClient = wsClient;
    this.roomId = roomId;
    this.peerId = peerId;
  }

  async join() {
    const { rtpCapabilities } = await this.wsClient.media.joinMedia({
      roomId: this.roomId,
      peerId: this.peerId,
    });

    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
    await this.createSendTransport();
    await this.createRecvTransport();

    // Get existing peers to consume their producers
    const { peers } = await this.wsClient.media.mediaPeers({
      roomId: this.roomId,
    });

    const existingProducers: Array<{
      peerId: string;
      producerId: string;
      kind: string;
      appData: Record<string, unknown>;
    }> = [];

    for (const peer of peers) {
      if (peer.peerId === this.peerId) continue;
      for (const producer of peer.producers) {
        existingProducers.push({
          peerId: peer.peerId,
          producerId: producer.producerId,
          kind: producer.kind,
          appData: producer.appData as Record<string, unknown>,
        });
      }
    }

    return existingProducers;
  }

  private async createSendTransport() {
    const params = await this.wsClient.media.createTransport({
      roomId: this.roomId,
      peerId: this.peerId,
      direction: "send",
    });

    this.sendTransport = this.device.createSendTransport(params);

    this.sendTransport.on(
      "connect",
      async ({ dtlsParameters }: { dtlsParameters: unknown }, callback: () => void, errback: (e: Error) => void) => {
        try {
          await this.wsClient.media.connectTransport({
            roomId: this.roomId,
            peerId: this.peerId,
            transportId: params.id,
            dtlsParameters,
          });
          callback();
        } catch (e) {
          errback(e as Error);
        }
      },
    );

    this.sendTransport.on(
      "produce",
      async (
        { kind, rtpParameters, appData }: { kind: "audio" | "video"; rtpParameters: unknown; appData: unknown },
        callback: (arg: { id: string }) => void,
        errback: (e: Error) => void,
      ) => {
        try {
          const { producerId } = await this.wsClient.media.produce({
            roomId: this.roomId,
            peerId: this.peerId,
            transportId: params.id,
            kind,
            rtpParameters,
            appData: appData as Record<string, unknown>,
          });
          callback({ id: producerId });
        } catch (e) {
          errback(e as Error);
        }
      },
    );
  }

  private async createRecvTransport() {
    const params = await this.wsClient.media.createTransport({
      roomId: this.roomId,
      peerId: this.peerId,
      direction: "recv",
    });

    this.recvTransport = this.device.createRecvTransport(params);

    this.recvTransport.on(
      "connect",
      async ({ dtlsParameters }: { dtlsParameters: unknown }, callback: () => void, errback: (e: Error) => void) => {
        try {
          await this.wsClient.media.connectTransport({
            roomId: this.roomId,
            peerId: this.peerId,
            transportId: params.id,
            dtlsParameters,
          });
          callback();
        } catch (e) {
          errback(e as Error);
        }
      },
    );
  }

  async produceAudio(track: MediaStreamTrack): Promise<Producer> {
    if (!this.sendTransport) throw new Error("Send transport not ready");
    const producer = await this.sendTransport.produce({ track });
    this.producers.set(producer.id, producer);
    return producer;
  }

  async produceVideo(track: MediaStreamTrack): Promise<Producer> {
    if (!this.sendTransport) throw new Error("Send transport not ready");
    const producer = await this.sendTransport.produce({ track });
    this.producers.set(producer.id, producer);
    return producer;
  }

  async produceScreen(track: MediaStreamTrack): Promise<Producer> {
    if (!this.sendTransport) throw new Error("Send transport not ready");
    const producer = await this.sendTransport.produce({
      track,
      appData: { screen: true },
    });
    this.producers.set(producer.id, producer);

    track.addEventListener("ended", () => {
      this.closeProducer(producer.id);
    });

    return producer;
  }

  async consumeProducer(producerId: string): Promise<{ consumer: Consumer; track: MediaStreamTrack }> {
    if (!this.recvTransport) throw new Error("Recv transport not ready");

    const result = await this.wsClient.media.consume({
      roomId: this.roomId,
      peerId: this.peerId,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    const consumer = await this.recvTransport.consume({
      id: result.consumerId,
      producerId: result.producerId,
      kind: result.kind as "audio" | "video",
      rtpParameters: result.rtpParameters,
    });

    this.consumers.set(consumer.id, consumer);

    await this.wsClient.media.resumeConsumer({
      roomId: this.roomId,
      peerId: this.peerId,
      consumerId: consumer.id,
    });

    return { consumer, track: consumer.track };
  }

  async closeProducer(producerId: string) {
    const producer = this.producers.get(producerId);
    if (producer) {
      producer.close();
      this.producers.delete(producerId);
    }
    try {
      await this.wsClient.media.closeProducer({
        roomId: this.roomId,
        peerId: this.peerId,
        producerId,
      });
    } catch {
      // ignore if already disconnected
    }
  }

  getProducers() {
    return this.producers;
  }

  async leave() {
    // Close all producers and consumers locally — guard each against already-closed state
    for (const producer of this.producers.values()) {
      try { producer.close(); } catch { /* already closed */ }
    }
    for (const consumer of this.consumers.values()) {
      try { consumer.close(); } catch { /* already closed */ }
    }
    this.producers.clear();
    this.consumers.clear();

    try { this.sendTransport?.close(); } catch { /* queue already stopped */ }
    try { this.recvTransport?.close(); } catch { /* queue already stopped */ }
    this.sendTransport = null;
    this.recvTransport = null;

    try {
      await this.wsClient.media.leaveMedia({
        roomId: this.roomId,
        peerId: this.peerId,
      });
    } catch {
      // ignore if already disconnected
    }
  }
}
