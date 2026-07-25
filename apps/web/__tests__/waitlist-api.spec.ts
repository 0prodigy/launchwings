import { expect, test } from "@playwright/test";

// LRC-01 PR6 — smoke for /api/waitlist after the optional DB-persistence
// landed. Mirrors audit-api.spec.ts: runs against PLAYWRIGHT_BASE_URL and
// only asserts shape, not side-effects.
//
// We can't exercise the DB insert path in CI (no Neon), and that's fine —
// the route is designed to no-op the persistence step when DATABASE_URL is
// unset OR when the insert throws, while still returning 200 ok. This test
// confirms that contract: the user-visible response stays stable.
//
// We use a `+test.<timestamp>` plus-tag email to avoid colliding with real
// signups when the smoke runs against production (Resend treats plus-tags
// as the same mailbox; the suffix keeps the row distinct in the waitlist
// table without changing inbox routing).

test.describe("/api/waitlist", () => {
  test("valid email returns ok=true (DB step is best-effort)", async ({ request }) => {
    const stamp = Date.now();
    const email = `smoke+test.${stamp}@launchwings.com`;
    const res = await request.post("/api/waitlist", {
      data: { email },
      headers: { "Content-Type": "application/json" },
    });

    // The route returns 200 in both cases — Resend configured (queued:true)
    // and dev-only fallback (queued:false). What matters for this smoke is
    // that the route shape is unbroken.
    if (res.status() === 503) {
      // Production deploy with no Resend configured. Acceptable — the route
      // explicitly refuses signups in that state. Skip.
      const body = (await res.json()) as { ok?: boolean; message?: string };
      expect(body.ok).toBeFalsy();
      return;
    }

    expect(res.status(), `unexpected status ${res.status()}`).toBe(200);
    const body = (await res.json()) as { ok?: boolean; queued?: boolean };
    expect(body.ok).toBe(true);
    // queued is true when Resend is configured, false in dev fallback.
    expect(typeof body.queued).toBe("boolean");
  });

  test("malformed JSON is rejected with 400", async ({ request }) => {
    const res = await request.post("/api/waitlist", {
      data: "{not-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("missing email is rejected with 400", async ({ request }) => {
    const res = await request.post("/api/waitlist", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toBeTruthy();
  });
});
