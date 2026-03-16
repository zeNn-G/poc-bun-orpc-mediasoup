import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { WsRouter } from "@poc-bun-orpc-mediasoup/api/routers/ws";
import type { RouterClient } from "@orpc/server";
import { env } from "@poc-bun-orpc-mediasoup/env/web";

const wsUrl = env.VITE_SERVER_URL.replace(/^http/, "ws") + "/ws/rpc";

export function createWsClient() {
  const websocket = new WebSocket(wsUrl);
  const link = new RPCLink({ websocket });
  const client: RouterClient<WsRouter> = createORPCClient(link);
  const wsOrpc = createTanstackQueryUtils(client, { path: ["ws"] });

  return { client, websocket, wsOrpc };
}
