import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { RPCHandler } from "@orpc/server/fetch";
import { RPCHandler as WSRPCHandler } from "@orpc/server/bun-ws";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@poc-bun-orpc-mediasoup/api/routers/index";
import { wsRouter } from "@poc-bun-orpc-mediasoup/api/routers/ws";
import { CORSPlugin } from "@orpc/server/plugins";
import { serve } from "bun";
import pino from "pino";
import {
  unregisterConnection,
  removePeerMedia,
  cleanupMediaRoom,
} from "@poc-bun-orpc-mediasoup/api/lib/media-store";
import { deleteRouter } from "@poc-bun-orpc-mediasoup/api/lib/mediasoup-worker";
import { publisher } from "@poc-bun-orpc-mediasoup/api/lib/room-store";

const logger = pino({
  transport: {
    target: "pino-pretty",
  },
  serializers: {
    err: (err: Error) => ({
      type: err.name,
      message: err.message,
    }),
  },
});

const loggingPlugin = new LoggingHandlerPlugin({
  logger,
  logRequestResponse: true,
  logRequestAbort: false,
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  plugins: [
    new CORSPlugin({
      origin: (origin) => origin,
      allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    }),
    loggingPlugin,
  ],
});

const wsLoggingPlugin = new LoggingHandlerPlugin({
  logger: logger.child({ transport: "ws" }),
  logRequestResponse: true,
  logRequestAbort: false,
});

const wsHandler = new WSRPCHandler(wsRouter, {
  plugins: [wsLoggingPlugin],
});

const server = serve({
  routes: {
    "/*": async (request) => {
      const rpcResult = await rpcHandler.handle(request, {
        prefix: "/rpc",
        context: {
          session: null,
        },
      });

      if (rpcResult.matched) {
        return rpcResult.response;
      }

      const apiResult = await apiHandler.handle(request, {
        prefix: "/api-reference",
        context: {
          session: null,
        },
      });

      if (apiResult.matched) {
        return apiResult.response;
      }

      return new Response("Not found", { status: 404 });
    },
    "/ws/rpc": (req, server) => {
      if (server.upgrade(req, { data: { connectionId: crypto.randomUUID() } })) {
        return new Response("Upgrade successful");
      }

      return new Response("Upgrade failed", { status: 500 });
    },
  },
  websocket: {
    data: {} as { connectionId: string },
    open(ws) {
      logger.info({ connectionId: ws.data.connectionId }, "[ws] peer connected");
    },
    message(ws, message) {
      wsHandler.message(ws, message, {
        context: { session: null, connectionId: ws.data.connectionId },
      });
    },
    async close(ws, code, reason) {
      const { connectionId } = ws.data;
      logger.info({ code, reason, connectionId }, "[ws] peer disconnected");
      wsHandler.close(ws);

      // Media cleanup on disconnect
      if (connectionId) {
        const info = unregisterConnection(connectionId);
        if (info) {
          const peer = removePeerMedia(info.roomId, info.peerId);
          if (peer) {
            // Notify about closed producers
            for (const producer of peer.producers.values()) {
              await publisher.publish(`room:${info.roomId}`, {
                type: "media:producerClosed",
                roomId: info.roomId,
                peerId: info.peerId,
                producerId: producer.id,
                ts: Date.now(),
              });
            }
            await publisher.publish(`room:${info.roomId}`, {
              type: "media:peerLeftCall",
              roomId: info.roomId,
              peerId: info.peerId,
              ts: Date.now(),
            });
          }
          if (cleanupMediaRoom(info.roomId)) {
            deleteRouter(info.roomId);
          }
        }
      }
    },
  },
  idleTimeout: 255, // max value — prevents SSE connections from being killed
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

logger.info(`Server running at ${server.url}`);
