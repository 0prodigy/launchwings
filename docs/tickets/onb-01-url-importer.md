# ONB-01 — URL importer (Firecrawl + screenshot)

> Spec source of truth: `docs/tickets/SPRINT_02.md` § ONB-01.
> Branch: `claude/solopreneur-launch-platform-JwOOq` (per-task), to be
> cherry-picked onto default with founder approval.

## Acceptance (verbatim from SPRINT_02)

- POST `/products/import` with a URL.
- Firecrawl crawl (5 pages depth-1) + Browserbase screenshot of homepage.
- Detected fields: title, meta description, primary CTA text, hero
  headline, framework hints.
- Build-platform auto-detect: subdomain regex (`*.lovable.app`,
  `*.bolt.new`, `*.v0.app`, `*.replit.app`, `*.paperclip.so`,
  `*.pickaxe.co`) + `meta[name='generator']`.
- Result persisted to `products.metadata`.
- Failure modes (404, robots.txt deny, timeout) return graceful error
  and the user can retry.

## Sub-tasks

- [ ] **DB migration 0008**: add `metadata jsonb` (default `'{}'::jsonb`)
      to `products`. Stage migration file only — founder applies.
- [ ] **Schema**: add `metadata` column to `products` in
      `packages/db/src/schema.ts`.
- [ ] **Env vars**: extend `apps/api/src/env.ts` with optional
      `FIRECRAWL_API_KEY`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`.
      Optional so api still boots without them; the import mutation
      throws `PRECONDITION_FAILED` if unset (mirrors insight router
      pattern).
- [ ] **Firecrawl client**: thin REST wrapper at
      `packages/agents/src/clients/firecrawl.ts`. `crawlSite(url, { maxPages: 5, depth: 1 })`
      returns `{ pages: [{ url, html, markdown, metadata }] }`. Honour
      404 / robots.txt deny / timeout → typed error.
- [ ] **Browserbase client**: thin wrapper at
      `packages/agents/src/clients/browserbase.ts` exposing
      `screenshotHomepage(url): Promise<{ pngBase64, viewport }>`.
- [ ] **Field extractors** (pure functions, unit-testable): title,
      meta description, primary CTA text, hero headline, framework
      hints. Live in `packages/agents/src/extractors/` so they can be
      reused by ONB-04.
- [ ] **Build-platform detection**: reuse existing
      `detectBuildPlatform` in `packages/lrs/src/detect/build-platform.ts`.
      Persist tuple to `product_build_platform_detections` (tenant-scoped,
      no `lrs_run_id`).
- [ ] **tRPC router**: `packages/trpc/src/routers/products.ts` with
      `import` (protected mutation, input `{ url }`). Wire into
      root router. Wraps writes in `withTenant`.
- [ ] **Failure modes**: surface 404 / robots / timeout as typed tRPC
      errors with `code: "BAD_REQUEST"` / `"PRECONDITION_FAILED"` /
      `"TIMEOUT"`. Founder UI re-uses retry. Don't persist a half-row.
- [ ] **Unit tests**: extractors + Firecrawl error mapping. Stub
      external HTTP via fetch mock — no live network in CI.
- [ ] **Build + type-check**: `pnpm turbo run build --filter=@launchwings/api`.

## Non-scope (explicit cuts to keep this 4d)

- No founder UI in this ticket — that lands in ONB-06.
- No agent-runtime wiring (Trigger.dev) yet; the import runs in-process
  inside the tRPC mutation. ONB-04 introduces the agent task.
- No screenshot persistence to R2 yet — return base64 to caller for
  now and let ONB-02 introduce R2 in the same PR family.
- No GitHub repo connect — that's ONB-03.

## Founder follow-ups (must do before this is "done")

- Set `FIRECRAWL_API_KEY`, `BROWSERBASE_API_KEY`,
  `BROWSERBASE_PROJECT_ID` on the `dot-api` Vercel project.
- Apply migration 0008 against Neon production.
