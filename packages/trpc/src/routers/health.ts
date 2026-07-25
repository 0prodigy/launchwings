import { z } from "zod";
import { publicProcedure, router } from "../trpc";

// Smallest possible router so SETUP-01b can prove the wire-up end-to-end.
// Not a permanent home; SETUP-02..04 introduce real domain routers.
export const healthRouter = router({
  ping: publicProcedure
    .input(z.object({ message: z.string().max(200).optional() }).optional())
    .query(({ input }) => ({
      ok: true as const,
      echo: input?.message ?? null,
      service: "@launchwings/api",
      ts: new Date().toISOString(),
    })),
});
