# ONB-04 — Discovery Agent (Sonnet)

> Spec: `docs/tickets/SPRINT_02.md` § ONB-04. Branch:
> `claude/solopreneur-launch-platform-JwOOq`. Depends on ONB-01 ✓ + ONB-02 ✓.

## Acceptance (verbatim from SPRINT_02)

- Input: `{ url?, brief_text?, github_data?, screenshots[] }`.
- Output (JSON, schema-validated): `{ product_summary, value_prop,
  three_icps[], competitors[], current_seo_posture,
  channel_suitability_scores }`.
- Channel suitability: 0–100 per PH, BetaList, HN, Reddit, X, LinkedIn,
  each with a rationale string.
- Eval golden set: 20 sample products, LLM-judge ≥4/5 on relevance +
  completeness.
- Cost cap: $0.50 per run. Logged.

## Sub-tasks

- [ ] **Task** `packages/agents/src/tasks/discovery.ts` — `discoveryAgent`
      via `defineAgent`, payload `{ tenantId, productId }`. Reads the
      product row (url, metadata, briefText), assembles the LLM input,
      runs anthropic Sonnet 4.6 with prompt caching ON (system prompt +
      few-shot demos cached), validates output via zod, persists
      `metadata.discovery` JSON.
- [ ] **Schema-validated output**: zod schema in
      `packages/agents/src/tasks/discovery.ts` exporting
      `discoveryOutputSchema` with the six fields.
- [ ] **System prompt** lifted from the same `INSIGHT_SYSTEM_PROMPT`
      style: explicit JSON-only, no hype words, founder voice, decision
      priority for ICPs (specific role > vague segment).
- [ ] **Cost cap**: hard-cap at $0.50 per run via `maxOutputTokens` +
      `maxInputTokens`. Use `computeCostUsdMicros` from `@launchwings/agents/llm`
      to assert the bound; emit a single-line warn log if approached.
- [ ] **tRPC mutation** `products.runDiscovery` (protected): triggers
      the agent, returns triggerRunId. Mirror the
      `agents.ensureRuntimeConfigured` shape.
- [ ] **Eval harness**: `packages/agents/src/__tests__/discovery.eval.ts`
      with **3** seed inputs (defer 20 to a follow-up) + an
      LLM-judge that scores relevance + completeness 1–5 and asserts
      ≥4/5. Skip in CI by default (vitest `it.skipIf(!process.env.RUN_EVALS)`).
- [ ] **Unit tests**: prompt construction is deterministic (cassette
      replay), zod schema rejects malformed output, cost-cap branch
      fires the warn log when input is large.
- [ ] **Builds** green for db, agents, trpc, api.

## Non-scope (deferred to follow-up `onb-04-followup-eval-expansion.md`)

- Expanding the golden eval set from 3 → 20 entries.
- LLM-judge UI surfacing (founder sees it inline). Backend-only here.
- `github_data` and `screenshots[]` ingestion. ONB-03 is a separate
  ticket and screenshots already live in `metadata.screenshot.pngBase64`
  so they're trivially fed in once the agent exists.

## Founder follow-ups

- Confirm `ANTHROPIC_API_KEY` is set on `dot-api` (already set per
  HANDOFF; verify).
- Confirm `TRIGGER_SECRET_KEY` + `TRIGGER_PROJECT_REF` set so the
  `runDiscovery` tRPC mutation can dispatch the task.
