import { createClerkClient, verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { dbPool, tenants, users } from "@launchwings/db";
import { env } from "../env.js";

// Per-request auth context. Set by this middleware on `c.set("auth", ...)` when
// either (a) a verified Clerk session token is present, or (b) the dev escape
// hatch headers (X-Test-User + X-Test-Tenant) are present in non-production.
//
// IMPORTANT: this middleware does NOT itself reject unauthenticated requests.
// `protectedProcedure` in packages/trpc throws TRPCError UNAUTHORIZED, and
// public routes (e.g. /health) deliberately stay accessible without auth.
export type AuthContext = {
  userId: string;
  tenantId: string;
  clerkUserId: string | null;
};

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext | null;
  }
}

// In-process cache: clerkUserId → { userId, tenantId }. Avoids hitting the DB
// on every request for hot users. Bounded by Map size — for v1 a single Fly
// machine sees a small user count; we bail out at 1000 entries to cap memory.
//
// TODO(SETUP-06+): replace with Redis (Upstash) so multiple Fly machines share
// the cache + we get TTL eviction. The shape of this Map should match the Redis
// hash so the swap is mechanical.
type CachedUser = { userId: string; tenantId: string };
const userCache = new Map<string, CachedUser>();
const USER_CACHE_MAX = 1000;

function cacheGet(clerkUserId: string): CachedUser | undefined {
  return userCache.get(clerkUserId);
}

function cacheSet(clerkUserId: string, value: CachedUser): void {
  if (userCache.size >= USER_CACHE_MAX) {
    // Naive eviction — drop the oldest (insertion-ordered) key. Good enough until Redis.
    const firstKey = userCache.keys().next().value;
    if (firstKey !== undefined) userCache.delete(firstKey);
  }
  userCache.set(clerkUserId, value);
}

// Exposed for tests so a fresh process between cases isn't required.
export function _resetUserCache(): void {
  userCache.clear();
}

async function lookupUserByClerkId(clerkUserId: string): Promise<CachedUser | null> {
  const cached = cacheGet(clerkUserId);
  if (cached) return cached;

  const db = dbPool();
  const rows = await db
    .select({ id: users.id, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const value: CachedUser = { userId: row.id, tenantId: row.tenantId };
  cacheSet(clerkUserId, value);
  return value;
}

// Slug helpers — derive a stable, ≤32-char slug from the email local-part plus a
// 6-char base32 suffix. We never collide on the suffix in practice (32^6 ≈ 1B);
// if we somehow did, the unique-index race handler kicks in and the next request
// re-SELECTs the existing row.
const SLUG_BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 25);
}
function randomSuffix(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += SLUG_BASE32_ALPHABET[Math.floor(Math.random() * SLUG_BASE32_ALPHABET.length)];
  }
  return out;
}

// JIT provisioning — called when verifyToken succeeded but the shadow user row
// doesn't exist yet. Replaces the never-built Clerk webhook. Failure modes:
//   - Clerk 4xx/5xx on getUser → returns null (caller continues with auth=null)
//   - DB error other than the unique-violation race → returns null
//   - Unique-violation race on users insert → re-SELECT and return the racing row
async function provisionUserForClerkId(clerkUserId: string): Promise<CachedUser | null> {
  if (!env.CLERK_SECRET_KEY) return null;

  let email: string;
  try {
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(clerkUserId);
    const primary =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId) ??
      clerkUser.emailAddresses[0];
    if (!primary?.emailAddress) {
      console.log(
        JSON.stringify({
          level: "warn",
          source: "clerk-mw",
          message: "clerk getUser returned no email address",
          clerkUserId,
        }),
      );
      return null;
    }
    email = primary.emailAddress;
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "warn",
        source: "clerk-mw",
        message: "clerk getUser failed during JIT provision",
        clerkUserId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }

  const localPart = email.split("@")[0] ?? "user";
  const slug = `${slugify(localPart) || "user"}-${randomSuffix()}`;
  const name = email || "Untitled tenant";

  const db = dbPool();
  try {
    const result = await db.transaction(async (tx) => {
      const tenantRows = await tx
        .insert(tenants)
        .values({ slug, name })
        .returning({ id: tenants.id });
      const tenantId = tenantRows[0]?.id;
      if (!tenantId) throw new Error("tenant insert returned no id");
      const userRows = await tx
        .insert(users)
        .values({ tenantId, clerkUserId, email })
        .returning({ id: users.id });
      const userId = userRows[0]?.id;
      if (!userId) throw new Error("user insert returned no id");
      return { userId, tenantId } satisfies CachedUser;
    });
    console.log(
      JSON.stringify({
        level: "info",
        source: "clerk-mw",
        message: "provisioned new tenant + user row",
        clerkUserId,
        tenantId: result.tenantId,
        userId: result.userId,
      }),
    );
    cacheSet(clerkUserId, result);
    return result;
  } catch (err) {
    // Postgres unique violation. The transaction rolled back so no orphan tenant
    // remains. Re-SELECT the racing row and return it.
    const code = (err as { code?: string } | null)?.code;
    if (code === "23505") {
      const rows = await db
        .select({ id: users.id, tenantId: users.tenantId })
        .from(users)
        .where(eq(users.clerkUserId, clerkUserId))
        .limit(1);
      const row = rows[0];
      if (row) {
        const value: CachedUser = { userId: row.id, tenantId: row.tenantId };
        cacheSet(clerkUserId, value);
        console.log(
          JSON.stringify({
            level: "info",
            source: "clerk-mw",
            message: "JIT provision lost race; resolved via re-select",
            clerkUserId,
            tenantId: value.tenantId,
          }),
        );
        return value;
      }
      // 23505 but the row isn't visible — could be a tenant-slug collision (1 in
      // ~1B). Fall through to the error log so an operator notices.
    }
    console.log(
      JSON.stringify({
        level: "error",
        source: "clerk-mw",
        message: "JIT provision failed",
        clerkUserId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

export const clerkMiddleware: MiddlewareHandler = async (c, next) => {
  // Default: no auth context. Downstream picks the policy.
  c.set("auth", null);

  const isDev = env.NODE_ENV !== "production";

  // Dev escape hatch — mirrors apps/api/src/context.ts so contract tests can
  // exercise tenant scoping without a real Clerk session.
  if (isDev) {
    const testUser = c.req.header("x-test-user");
    const testTenant = c.req.header("x-test-tenant");
    if (testUser && testTenant) {
      c.set("auth", {
        userId: testUser,
        tenantId: testTenant,
        clerkUserId: null,
      });
      await next();
      return;
    }
  }

  // No Clerk secret → degraded mode: skip verification entirely. The startup
  // warn in env.ts already told the operator what's going on.
  if (!env.CLERK_SECRET_KEY) {
    await next();
    return;
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    await next();
    return;
  }

  const token = authHeader.slice("bearer ".length).trim();
  if (!token) {
    await next();
    return;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
    });
    const clerkUserId = payload.sub;
    if (!clerkUserId) {
      await next();
      return;
    }

    let user = await lookupUserByClerkId(clerkUserId);
    if (!user) {
      // Verified Clerk user but no shadow row yet. JIT-provision a tenant + user
      // pair (replaces the never-built Clerk webhook). If provisioning fails
      // (Clerk API or DB error) we fall back to auth=null so unauthenticated
      // routes keep working.
      console.log(
        JSON.stringify({
          level: "info",
          source: "clerk-mw",
          message: "provisioning new tenant + user row from verified clerk token",
          clerkUserId,
        }),
      );
      user = await provisionUserForClerkId(clerkUserId);
      if (!user) {
        await next();
        return;
      }
    }

    c.set("auth", {
      userId: user.userId,
      tenantId: user.tenantId,
      clerkUserId,
    });
  } catch (err) {
    // Token verification failed — log structured (Axiom) and continue
    // unauthenticated. Don't leak the token contents in the log.
    console.log(
      JSON.stringify({
        level: "warn",
        source: "clerk-mw",
        message: "clerk token verify failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  await next();
};
