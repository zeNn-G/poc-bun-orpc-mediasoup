import { z } from "zod";
import { publicProcedure } from "../index";
import { mediaRouter } from "./media";

export const wsRouter = {
  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .handler(({ input }) => {
      return { echoed: input.message, ts: Date.now() };
    }),

  ping: publicProcedure.handler(() => {
    return { pong: true, ts: Date.now() };
  }),

  media: mediaRouter,
};

export type WsRouter = typeof wsRouter;
