// Request context for tRPC procedures. Populated by the Hono adapter on the api side
// (per-request: tenantId from Clerk, requestId for tracing). The web side imports the
// shape via type-inference only — never the runtime implementation.
//
// Keep this file dependency-light: types only, no Hono/Clerk imports here, so the
// web bundle never pulls server-only packages.

export type RequestContext = {
  /** Stable per-request id; matches the Axiom/OTel trace id when present. */
  requestId: string;
  /** Tenant the request is acting on. Null on unauthenticated procedures. */
  tenantId: string | null;
  /** User id from Clerk. Null on unauthenticated procedures. */
  userId: string | null;
  /**
   * Raw Clerk user id (e.g. `user_2abc...`). Null on unauthenticated procedures
   * AND on the X-Test-* dev escape hatch (which doesn't go through Clerk). Used
   * by procs that call into the Clerk Backend SDK — primarily ONB-03's
   * `clerk.users.getUserOauthAccessToken(...)` for the GitHub external account.
   */
  clerkUserId: string | null;
};
