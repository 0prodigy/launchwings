import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be declared BEFORE importing the middleware. Vitest hoists vi.mock,
// but we still keep the imports below so the test reads top-down.

vi.mock("../env.js", () => ({
  env: {
    NODE_ENV: "test",
    CLERK_SECRET_KEY: "sk_test_fake",
    CLERK_JWT_KEY: undefined,
  },
}));

const verifyTokenMock = vi.fn();
const getUserMock = vi.fn();
vi.mock("@clerk/backend", () => ({
  verifyToken: (...args: unknown[]) => verifyTokenMock(...args),
  createClerkClient: () => ({ users: { getUser: getUserMock } }),
}));

// Build a per-test mock for dbPool. The middleware uses two shapes:
//   - db.select().from().where().limit() → returns a Promise<rows[]>
//   - db.transaction(cb) → invokes cb with a tx that supports
//       tx.insert().values().returning() → Promise<rows[]>
type MockState = {
  selectRows: { id: string; tenantId: string }[];
  // Tracks calls to the transactional inserts so tests can assert on them.
  tenantInserts: { slug: string; name: string }[];
  userInserts: { tenantId: string; clerkUserId: string; email: string }[];
  // When set, the next users insert throws this error before being recorded.
  userInsertError: (Error & { code?: string }) | null;
  // Returning ids; tests can override.
  tenantInsertId: string;
  userInsertId: string;
};

const mockState: MockState = {
  selectRows: [],
  tenantInserts: [],
  userInserts: [],
  userInsertError: null,
  tenantInsertId: "tenant-uuid-1",
  userInsertId: "user-uuid-1",
};

function makeChainedSelect(rows: { id: string; tenantId: string }[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
}

function makeTx() {
  return {
    insert: (table: { _: { name?: string }; [k: string]: unknown }) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: () => {
          // Distinguish tables by reference equality against the mocked db symbols.
          // Cheaper approach: check field shape.
          if ("slug" in vals) {
            mockState.tenantInserts.push(vals as { slug: string; name: string });
            return Promise.resolve([{ id: mockState.tenantInsertId }]);
          }
          if (mockState.userInsertError) {
            const err = mockState.userInsertError;
            mockState.userInsertError = null;
            return Promise.reject(err);
          }
          mockState.userInserts.push(
            vals as { tenantId: string; clerkUserId: string; email: string },
          );
          return Promise.resolve([{ id: mockState.userInsertId }]);
        },
      }),
    }),
  };
}

vi.mock("@launchwings/db", () => ({
  tenants: { _: { name: "tenants" } },
  users: { _: { name: "users" } },
  dbPool: () => ({
    select: () => makeChainedSelect(mockState.selectRows),
    transaction: async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
      return cb(makeTx());
    },
  }),
}));

import { clerkMiddleware, _resetUserCache, type AuthContext } from "../middleware/clerk.js";

function buildApp() {
  const app = new Hono<{ Variables: { auth: AuthContext | null } }>();
  app.use("*", clerkMiddleware);
  app.get("/whoami", (c) => c.json({ auth: c.get("auth") }));
  return app;
}

beforeEach(() => {
  _resetUserCache();
  mockState.selectRows = [];
  mockState.tenantInserts = [];
  mockState.userInserts = [];
  mockState.userInsertError = null;
  verifyTokenMock.mockReset();
  getUserMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clerkMiddleware JIT provisioning", () => {
  it("JIT-provisions a tenant + user when verified clerk token has no shadow row", async () => {
    verifyTokenMock.mockResolvedValueOnce({ sub: "user_NEW" });
    getUserMock.mockResolvedValueOnce({
      primaryEmailAddressId: "eml_1",
      emailAddresses: [{ id: "eml_1", emailAddress: "new@example.com" }],
    });
    mockState.selectRows = []; // initial lookup empty
    mockState.tenantInsertId = "tenant-new-1";
    mockState.userInsertId = "user-new-1";

    const app = buildApp();
    const res = await app.request("/whoami", {
      headers: { authorization: "Bearer fake.jwt.token" },
    });
    const body = (await res.json()) as { auth: AuthContext | null };

    expect(res.status).toBe(200);
    expect(body.auth).not.toBeNull();
    expect(body.auth?.tenantId).toBe("tenant-new-1");
    expect(body.auth?.userId).toBe("user-new-1");
    expect(body.auth?.clerkUserId).toBe("user_NEW");

    expect(mockState.tenantInserts).toHaveLength(1);
    expect(mockState.tenantInserts[0]?.name).toBe("new@example.com");
    expect(mockState.tenantInserts[0]?.slug).toMatch(/^new-[a-z2-7]{6}$/);
    expect(mockState.userInserts).toHaveLength(1);
    expect(mockState.userInserts[0]?.email).toBe("new@example.com");
    expect(mockState.userInserts[0]?.clerkUserId).toBe("user_NEW");
  });

  it("race: handles unique violation on user insert by re-SELECTing", async () => {
    verifyTokenMock.mockResolvedValueOnce({ sub: "user_RACE" });
    getUserMock.mockResolvedValueOnce({
      primaryEmailAddressId: "eml_1",
      emailAddresses: [{ id: "eml_1", emailAddress: "race@example.com" }],
    });
    // First select (initial lookup): empty. Second select (post-23505 re-SELECT):
    // returns the racing row. We swap selectRows after the first read by reading
    // the tenant-insert side effect — but the simpler path is to seed an array of
    // arrays consumed in order. Re-implement makeChainedSelect inline for this test.
    let selectCall = 0;
    const seqRows: { id: string; tenantId: string }[][] = [
      [],
      [{ id: "user-existing", tenantId: "tenant-existing" }],
    ];
    // Override the dbPool's select for this test only by patching mockState via
    // a callable — easier: mutate selectRows between calls using the userInsertError
    // mechanism. The race path: tx fires, user-insert rejects with 23505, then
    // the catch block does a fresh db.select. We need that fresh select to see
    // the racing row.
    //
    // Strategy: monkey-patch makeChainedSelect indirectly by swapping selectRows
    // when the insert error fires.
    const raceErr = Object.assign(new Error("dup"), { code: "23505" });
    mockState.userInsertError = raceErr;
    // Swap selectRows when we detect the race fires. Since our mock for
    // userInsertError returns rejection synchronously, we rely on the catch
    // block selecting AFTER the insert. Set selectRows up so the FIRST call
    // (initial lookup) reads empty and the SECOND (re-SELECT) sees the row.
    //
    // The chainedSelect we built reads `mockState.selectRows` lazily via
    // closure-on-state-mutation. So we update selectRows after first request to
    // simulate row appearing — but middleware runs both selects within one
    // request. Workaround: stub by index using a getter-like approach.
    Object.defineProperty(mockState, "selectRows", {
      configurable: true,
      get() {
        return seqRows[Math.min(selectCall++, seqRows.length - 1)] ?? [];
      },
    });

    const app = buildApp();
    const res = await app.request("/whoami", {
      headers: { authorization: "Bearer fake.jwt.token" },
    });
    const body = (await res.json()) as { auth: AuthContext | null };

    // Restore plain property so afterEach reset works.
    Object.defineProperty(mockState, "selectRows", {
      configurable: true,
      writable: true,
      value: [],
    });

    expect(res.status).toBe(200);
    expect(body.auth?.tenantId).toBe("tenant-existing");
    expect(body.auth?.userId).toBe("user-existing");
    // Tenant insert WAS attempted (the tx ran), but the user insert threw and
    // rolled the tx back. We don't assert tenantInserts is empty (the mock
    // records the values pre-rollback); we DO assert that no SECOND tenant
    // insert was attempted after the catch — i.e. exactly one tenant insert.
    expect(mockState.tenantInserts).toHaveLength(1);
    // No successful user insert recorded (the only attempt was the one we threw on).
    expect(mockState.userInserts).toHaveLength(0);
  });
});

describe("clerkMiddleware auth context shape", () => {
  it("X-Test dev escape hatch sets clerkUserId to null", async () => {
    const app = buildApp();
    const res = await app.request("/whoami", {
      headers: {
        "x-test-user": "user-test-1",
        "x-test-tenant": "tenant-test-1",
      },
    });
    const body = (await res.json()) as { auth: AuthContext | null };

    expect(res.status).toBe(200);
    expect(body.auth).not.toBeNull();
    expect(body.auth?.userId).toBe("user-test-1");
    expect(body.auth?.tenantId).toBe("tenant-test-1");
    // X-Test path doesn't go through Clerk, so clerkUserId must be null —
    // procs that need a real Clerk user (ONB-03 GitHub) reject CONFLICT.
    expect(body.auth?.clerkUserId).toBeNull();
  });
});
