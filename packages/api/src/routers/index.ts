import type { RouterClient } from "@orpc/server";
import { publicProcedure } from "../index";
import { roomRouter } from "./room";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  room: roomRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
