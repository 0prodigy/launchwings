import { expect, test } from "@playwright/test";

// LRC-01 PR4 — smoke for /api/audit. Mirrors smoke.spec.ts structure: runs
// against PLAYWRIGHT_BASE_URL (default https://launchwings.com).
//
// We deliberately do NOT exercise live external URLs in CI — every audit
// would hit some other site we don't control, and one flaky CDN turns into
// a flaky test. Instead we audit launchwings.com itself (we control it) and
// assert *shape* not specific scores. Checklist:
//
//   1. Valid URL → 200 with `summary` + `results` populated.
//   2. Private/loopback URL → 400 with the SSRF rejection message.
//   3. Malformed URL → 400.
//
// Note: rate limiting is per-IP per-hour at 5 reqs. Three POSTs in this file
// are well under the limit; if the suite is ever extended past 5 we'll need
// a header-based test bypass (out of scope here).

test.describe("/api/audit", () => {
  test("valid URL returns populated audit result", async ({ request }) => {
    const res = await request.post("/api/audit", {
      data: { url: "https://launchwings.com" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status(), `unexpected status ${res.status()}`).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      runId: string;
      finishedAt: string;
      summary: { pass: number; warn: number; fail: number; score: number; error?: string };
      results: Array<{ evaluatorId: string; severity: string }>;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.runId).toBe("string");
    expect(body.runId.length).toBeGreaterThan(0);
    expect(typeof body.finishedAt).toBe("string");
    expect(body.summary).toBeDefined();
    // If the runner can fetch launchwings.com, we expect at least one result.
    // If the smoke env can't egress to it (very unusual), the response still
    // has a clearly-shaped error; assert one or the other rather than mask
    // a real failure.
    if (body.summary.error) {
      expect(body.results.length).toBe(0);
    } else {
      expect(body.results.length).toBeGreaterThan(0);
      // Score should be in band.
      expect(body.summary.score).toBeGreaterThanOrEqual(0);
      expect(body.summary.score).toBeLessThanOrEqual(100);
      // Each result has the canonical shape.
      for (const r of body.results) {
        expect(r.evaluatorId).toBeTruthy();
        expect(["pass", "warn", "fail"]).toContain(r.severity);
      }
    }
  });

  test("private host (127.0.0.1) is rejected with 400", async ({ request }) => {
    const res = await request.post("/api/audit", {
      data: { url: "http://127.0.0.1/admin" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { ok?: boolean; message?: string };
    expect(body.ok).toBeFalsy();
    expect((body.message ?? "").toLowerCase()).toMatch(/private|internal/);
  });

  test("malformed URL is rejected with 400", async ({ request }) => {
    const res = await request.post("/api/audit", {
      data: { url: "not-a-url" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBeFalsy();
  });
});
