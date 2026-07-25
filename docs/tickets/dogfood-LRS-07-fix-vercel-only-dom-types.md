# dogfood-LRS-07 — Fix Vercel-only DOM-type errors in lrs

**Status:** deferred (deploy is healthy; tickets are queued for batching)
**Surface:** `packages/lrs/src/evaluators/analytics-beacon-static.ts`,
            `packages/lrs/src/detect/build-platform.ts`
**Created:** 2026-05-08 (arc 2 follow-up)

## What's broken

On Vercel's typecheck, the following errors appear (truncated):

```
packages/lrs/src/evaluators/analytics-beacon-static.ts(279,13):
  Property 'status' does not exist on type 'Response'.
packages/lrs/src/evaluators/analytics-beacon-static.ts(283,19):
  Property 'text' does not exist on type 'Response'.
packages/lrs/src/detect/build-platform.ts(312,35):
  Property 'get' does not exist on type 'Headers'.
packages/lrs/src/detect/build-platform.ts(313,36):
  Property 'get' does not exist on type 'Headers'.
```

The deploy completes (Vercel bundles via esbuild/swc, which doesn't gate on
`tsc --noEmit`), but the errors leak into the build log and into any consumer
of `@launchwings/lrs` that runs strict typechecks.

## What's NOT broken

- `pnpm --filter @launchwings/lrs type-check` is green locally (verified
  2026-05-08).
- `pnpm --filter @launchwings/api type-check` is green locally.
- The deployed api responds; `dot-api` is healthy on Vercel.

So this is a **Vercel-only environment delta**, not a runtime defect.

## Suspected cause

`packages/lrs/tsconfig.json` declares `lib: ["ES2022"]` only — no `DOM` or
`WebWorker` lib. The code uses `Response.status`, `Response.text()`,
`Headers.get()` which come from `lib.dom.d.ts` or `lib.webworker.d.ts`. Locally
something pulls those types into resolution (likely transitively via
`@types/node`'s newer undici types, or hoist-side-effects), making the
typecheck pass. On Vercel the resolution graph differs — possibly because the
drizzle-orm hoist (commit `d4385ad`) moved hoisted packages to root, changing
which `@types/*` are visible from `packages/lrs/`.

## Probable fix (to validate when this is picked up)

Add `"DOM"` to the `lib` list in `packages/lrs/tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM"]
  }
}
```

`DOM` is type-only; it doesn't pull DOM globals into the runtime, just makes
`Response`/`Headers`/`fetch` typed correctly. The same may be needed in
`apps/api/tsconfig.json` if its tsc still surfaces these errors after the
package-side fix.

Alternative: replace `Response`/`Headers` typings with explicit imports from
`undici` (Node's bundled fetch impl). Heavier; only do this if `DOM` causes
unrelated regressions.

## Validation steps when picked up

1. Add `DOM` to `lib` in `packages/lrs/tsconfig.json`.
2. `pnpm -r type-check` → still green locally.
3. Push, wait for Vercel auto-deploy on `dot-api` and `dot-web`.
4. Confirm the `analytics-beacon-static.ts` and `build-platform.ts` lines no
   longer appear in the Vercel build log.

## Why deferred

- Deploy is green; `/health` and tRPC mount serve correctly.
- These errors don't block any other ticket.
- Batching with the next LRS-touching ticket avoids a noisy single-purpose PR.

## Linked

- Drizzle dedupe fix that may have surfaced this delta: `d4385ad`.
- Stack arch §4 (TS strict everywhere) — eventually we want zero noise.
