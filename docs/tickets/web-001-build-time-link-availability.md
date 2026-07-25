## WEB-001 — Build-time link-availability check

**Intent**: Catch the bug class surfaced in `learnings.md` #12: Next 15 happily ships `<meta property="og:image">` and `<link rel=icon>` URLs that point at files that do not exist anywhere in the build. Build is green, deploy is green, every share to X / LinkedIn / Slack is silently broken. `SETUP-01-monorepo-design.md` §11 calls this a "bolt-on now, ~1 hour" guard. Run it on every PR and on the production branch so a future regression cannot reach the live site.

**Acceptance**:
- `apps/web/scripts/check-shipped-assets.mjs` exists. It runs after `next build` and:
  1. Parses every `.next/server/app/**/*.html` produced by the build.
  2. Extracts URLs from `<meta property="og:image">`, `<meta name="twitter:image">`, `<link rel="icon">` / `<link rel~=icon>` / `<link rel="apple-touch-icon">` / `<link rel="manifest">`, plus any `<img src>`, `<source srcset>`, and `<link rel="preload" as="image">` in shipped HTML.
  3. For each URL: strips the production host (`https://launchwings.com`) if present; keeps fully-qualified third-party URLs out of scope.
  4. Resolves the path against `apps/web/public/<path>` OR a Next 15 file-convention route at `.next/server/app/<path>/route.js` OR a static `.next/server/app/<path>.html`. If none match, fail with a clear "URL referenced in shipped HTML but no asset is exported" message.
- `apps/web/package.json` exposes `pnpm check:assets` calling the script.
- `.github/workflows/web-001-link-check.yml` runs on `pull_request` (any branch) and on `push` to the production branch, plus a nightly `schedule` cron. It does `pnpm install --frozen-lockfile && pnpm --filter @launchwings/web build && pnpm --filter @launchwings/web check:assets`.
- The script exits non-zero on any miss; CI surfaces this as a red check on the PR.
- The current production HEAD passes the check (verified locally before merge — the OG and Twitter routes resolve via Next 15 file conventions).

**Out of scope here** (separate tickets):
- Live HTTP probing of every internal route (covered later by Playwright smoke in SETUP-07 PR8 and by the LRS Audit Agent in production).
- Crawl-based link discovery across multiple pages (lychee-style); we only validate prerendered HTML for now.
- External link validation (Twitter / LinkedIn / vendor docs) — too noisy in CI.
- Favicon production: `dogfood-LRS-06` owns brand assets. WEB-001 only validates URLs that ship; it does not require any to be present.

**Why not lychee**: the architect's design §11 suggested lychee. We picked a Node script instead because (a) lychee in default mode follows external links and would be flaky, (b) the bug class we care about is asset existence, not URL reachability, (c) a 50-line script with no extra binary dep is easier to reason about and modify. If the audit-agent surface needs lychee-grade link discovery later, that lives in the agent, not in CI.

**Estimate**: 1h. **Owner**: AI eng. **Bundle**: operational dogfood — informs the customer-side stack-template that `deploy-from-github` skill v2 will eventually generate (per `learnings.md` #5/#8/#12).
