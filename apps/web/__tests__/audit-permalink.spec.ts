import { expect, test } from "@playwright/test";

// LRC-01 PR6 — smoke for the /api/audit/[runId] read endpoint.
//
// We can't exercise a real DB in CI, so we verify two pure-routing
// behaviours that don't require persistence:
//   1. A well-formed but absent uuid returns 404 (when DB is reachable) or
//      503 (when DATABASE_URL is unset on the smoke target). Either is
//      correct — what matters is that we never return 200 for a uuid the
//      server has never written.
//   2. A malformed runId returns 400.

test.describe("/api/audit/[runId]", () => {
  test("absent uuid returns 404 or 503, never 200", async ({ request }) => {
    const res = await request.get(
      "/api/audit/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status()).not.toBe(200);
    expect([404, 503]).toContain(res.status());
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBeFalsy();
  });

  test("malformed runId returns 400", async ({ request }) => {
    const res = await request.get("/api/audit/not-a-uuid");
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { ok?: boolean; message?: string };
    expect(body.ok).toBeFalsy();
    expect((body.message ?? "").toLowerCase()).toContain("uuid");
  });
});
