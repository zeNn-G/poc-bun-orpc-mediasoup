import type * as mediasoup from "mediasoup";
import { env } from "@poc-bun-orpc-mediasoup/env/server";
import { patchSpawnForMediasoup, restoreSpawn } from "./bun-mediasoup-workaround";

let worker: mediasoup.types.Worker | null = null;

interface RouterEntry {
  router: mediasoup.types.Router;
  audioLevelObserver: mediasoup.types.AudioLevelObserver;
}

const routers = new Map<string, RouterEntry>();

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

export async function getOrCreateRouter(
  roomId: string,
): Promise<{ router: mediasoup.types.Router; audioLevelObserver: mediasoup.types.AudioLevelObserver }> {
  const existing = routers.get(roomId);
  if (existing) return existing;

  const w = await initWorker();
  const router = await w.createRouter({ mediaCodecs });
  const audioLevelObserver = await router.createAudioLevelObserver({
    maxEntries: 10,
    threshold: -50,
    interval: 800,
  });

  const entry: RouterEntry = { router, audioLevelObserver };
  routers.set(roomId, entry);
  return entry;
}

export function getAudioLevelObserver(
  roomId: string,
): mediasoup.types.AudioLevelObserver | undefined {
  return routers.get(roomId)?.audioLevelObserver;
}

export function deleteRouter(roomId: string): void {
  const entry = routers.get(roomId);
  if (entry) {
    entry.audioLevelObserver.close();
    entry.router.close();
    routers.delete(roomId);
  }
}
