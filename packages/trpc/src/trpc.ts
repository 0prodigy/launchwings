import { initTRPC, TRPCError } from "@trpc/server";
import type { RequestContext } from "./context";

// Single tRPC instance for the whole app. All routers + procedures derive from here.
const t = initTRPC.context<RequestContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Auth-required procedures. The Clerk middleware in apps/api populates
// ctx.userId + ctx.tenantId; if either is missing the request is anonymous.
// Throwing a typed UNAUTHORIZED gives the web client a structured 401 it can
// route to a sign-in redirect (vs. a generic 500).
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.tenantId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "tenant scope required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
    },
  });
});
