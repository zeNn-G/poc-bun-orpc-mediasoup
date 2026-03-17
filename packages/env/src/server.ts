import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    MEDIASOUP_ANNOUNCED_IP: z.string().default("127.0.0.1"),
    MEDIASOUP_RTC_MIN_PORT: z.coerce.number().default(10000),
    MEDIASOUP_RTC_MAX_PORT: z.coerce.number().default(10100),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
