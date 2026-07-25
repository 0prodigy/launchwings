import type { Context as HonoContext } from "hono";
import type { RequestContext } from "@launchwings/trpc/context";
import { randomUUID } from "node:crypto";

// Per-request RequestContext factory invoked by the trpc-server adapter.
// The Clerk middleware in src/middleware/clerk.ts populates `c.get("auth")`
// (verified Clerk session OR the X-Test-* dev escape hatch). We read it here
// and forward to the tRPC layer; `protectedProcedure` enforces non-null.
export async function createContext(
  _opts: { req: Request; resHeaders: Headers },
  c: HonoContext,
): Promise<RequestContext> {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  c.header("x-request-id", requestId);

  const auth = c.get("auth");

  return {
    requestId,
    tenantId: auth?.tenantId ?? null,
    userId: auth?.userId ?? null,
    clerkUserId: auth?.clerkUserId ?? null,
  };
}
