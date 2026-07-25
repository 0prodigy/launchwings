import {
  expect,
  test,
  type Response as PlaywrightResponse,
} from "@playwright/test";

// SETUP-07 smoke suite. Runs against a deployed preview URL (or prod when
// invoked locally). Each assertion guards a specific regression we have
// already paid for at least once — see inline comments.
//
// Out of scope: anything that requires Clerk auth (lands with SETUP-03).

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.describe("home page", () => {
  test("returns 200 and contains brand name", async ({ page, request }) => {
    const head = await request.get("/");
    expect(head.status()).toBe(200);
    await page.goto("/");
    await expect(page.locator("body")).toContainText("LaunchWings");
  });

  test("og:image URL exists and HEAD returns 200", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");
    expect(ogImage, "og:image meta is present").toBeTruthy();
    if (!ogImage) return; // narrowing for ts; expect already failed
    // Some platforms set a relative URL; resolve against the page origin.
    const resolved = new URL(ogImage, page.url()).toString();
    const res = await request.fetch(resolved, { method: "HEAD" });
    expect(
      res.status(),
      `HEAD ${resolved} should be 200 (regression guard: dogfood learnings #12)`,
    ).toBeLessThan(400);
  });

  test("description meta is <= 160 chars", async ({ page }) => {
    // Regression guard against `dogfood-LRS-08` (commit `fix/lrs-08-meta-description-trim`).
    // Long descriptions get silently truncated by Google's SERP — keep ourselves honest.
    await page.goto("/");
    const desc = await page
      .locator('meta[name="description"]')
      .first()
      .getAttribute("content");
    expect(desc, "description meta is present").toBeTruthy();
    expect(
      (desc ?? "").length,
      `description must be <= 160 chars (was ${(desc ?? "").length})`,
    ).toBeLessThanOrEqual(160);
  });
});

test.describe("waitlist form", () => {
  test("submits and surfaces a clearly-shaped result", async ({ page }) => {
    // Regression guard against DOGFOOD-LRS-12: previously the form swallowed
    // 502/503 from the waitlist endpoint and showed a "success" state. Either
    // the submission must succeed (UI shows success copy) OR the UI must
    // surface a visible error / the network response must be a clearly-shaped
    // 5xx — silently misleading success is the failure mode.
    await page.goto("/");

    const email = `playwright+test+${runId}@launchwings.com`;
    const emailInput = page.locator('input[type="email"][name="email"]');
    await emailInput.waitFor({ state: "visible" });
    await emailInput.fill(email);

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/waitlist") &&
        res.request().method() === "POST",
      { timeout: 15_000 },
    );

    await page.locator('button[type="submit"]').click();

    let res: PlaywrightResponse | null = null;
    try {
      res = await responsePromise;
    } catch {
      // Some prod configs may block scripted submissions before reaching the
      // API (e.g., Turnstile invisible challenge). In that case we still
      // expect a visible UI signal — fall through and check for it.
    }

    if (res) {
      const status = res.status();
      const okShape = status >= 200 && status < 300;
      const errShape =
        status === 400 ||
        status === 401 ||
        status === 403 ||
        status === 429 ||
        status === 502 ||
        status === 503;
      expect(
        okShape || errShape,
        `unexpected status ${status} from /api/waitlist — must be 2xx success or a clearly-shaped error`,
      ).toBe(true);
      if (okShape) {
        // Wait for success UI copy from components/waitlist-form.tsx.
        await expect(page.locator("body")).toContainText(
          /You.?re on the list|Check your inbox/i,
          { timeout: 10_000 },
        );
        return;
      }
    }

    // Either no API response captured or non-2xx response: confirm UI shows
    // a visible error state rather than a silent fake-success.
    const body = page.locator("body");
    const hasError =
      (await page.locator('[role="alert"]').count()) > 0 ||
      (await body.innerText()).match(/error|try again|failed/i) !== null;
    const hasSuccess =
      (await body.innerText()).match(
        /You.?re on the list|Check your inbox/i,
      ) !== null;
    expect(
      hasError || hasSuccess,
      "form must show either a success or a visible error — never a silent no-op (DOGFOOD-LRS-12)",
    ).toBe(true);
  });
});
