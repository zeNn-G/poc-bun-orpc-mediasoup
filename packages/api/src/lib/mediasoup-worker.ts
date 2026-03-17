import type * as mediasoup from "mediasoup";
import { env } from "@poc-bun-orpc-mediasoup/env/server";
import { patchSpawnForMediasoup, restoreSpawn } from "./bun-mediasoup-workaround";

let worker: mediasoup.types.Worker | null = null;
const routers = new Map<string, mediasoup.types.Router>();

// preferredPayloadType is optional for mediaCodecs per mediasoup docs
const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    preferredPayloadType: 100,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    preferredPayloadType: 101,
    clockRate: 90000,
  },
];

export async function initWorker(): Promise<mediasoup.types.Worker> {
  if (worker) return worker;

  const ms = await import("mediasoup");
  try {
    patchSpawnForMediasoup();
    worker = await ms.createWorker({
      logLevel: "warn",
      rtcMinPort: env.MEDIASOUP_RTC_MIN_PORT,
      rtcMaxPort: env.MEDIASOUP_RTC_MAX_PORT,
    });
  } finally {
    restoreSpawn();
  }

  worker.on("died", () => {
    console.error("mediasoup Worker died, exiting...");
    process.exit(1);
  });

  console.log(`mediasoup Worker created [pid:${worker.pid}]`);
  return worker;
}

export async function getOrCreateRouter(roomId: string): Promise<mediasoup.types.Router> {
  let router = routers.get(roomId);
  if (router) return router;

  const w = await initWorker();
  router = await w.createRouter({ mediaCodecs });
  routers.set(roomId, router);
  return router;
}

export function deleteRouter(roomId: string): void {
  const router = routers.get(roomId);
  if (router) {
    router.close();
    routers.delete(roomId);
  }
}
