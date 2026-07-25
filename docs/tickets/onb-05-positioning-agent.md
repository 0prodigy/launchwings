# ONB-05 — Positioning Agent

> Spec: `docs/tickets/SPRINT_02.md` § ONB-05. Branch:
> `claude/solopreneur-launch-platform-JwOOq`. Depends on ONB-04 ✓.

## Acceptance (verbatim from SPRINT_02)

- Input: Launch Brief.
- Output: `{ icps: [{ name, role, pains, gains }],
  taglines: [{ text, judge_score }] }`.
- Tagline judge scores each on (a) audience mentioned, (b) problem
  mentioned, (c) unique mechanism mentioned, (d) under 12 words.
  ≥4/4 wins; 3/4 ok; <3 rejected.
- Founder UI to edit/reject/regenerate (deferred to ONB-06).
- Cost cap: $0.20 per run.

## Sub-tasks

- [ ] **Task** `packages/agents/src/tasks/positioning.ts` —
      `positioningAgent`, payload `{ tenantId, productId }`. Reads
      `products.metadata.discovery` (lands from ONB-04). Errors if
      discovery hasn't been run.
- [ ] **Output schema** zod: `positioningOutputSchema`:
      - `icps: z.array(z.object({ name, role, pains: string[], gains: string[] })).length(3)`
      - `taglines: z.array(z.object({ text: z.string().min(3).max(120), judge_score: z.object({ audience, problem, mechanism, under12: z.boolean(), total: z.number().int().min(0).max(4) }) })).length(5)`
- [ ] **System prompt** in same style as Discovery's. Encode the
      4-point judge rubric for the LLM to self-score; we then re-run
      the judge deterministically server-side over the text and
      reconcile (server's score wins).
- [ ] **Server-side judge**: pure function `scoreTagline(tagline, brief)`
      that returns the 4 booleans + total. `under12` is a word count
      check; `audience`/`problem`/`mechanism` use a tiny LLM judge
      pass (Haiku) batched across all 5 taglines for cost.
- [ ] **Cost cap**: $0.20 → `200_000` micros. Sonnet primary draft
      pass + Haiku batch judge stays well under.
- [ ] **Persistence**: merge into `products.metadata.positioning`.
- [ ] **tRPC mutation** `products.runPositioning` (protected) —
      mirrors `products.runDiscovery` shape.
- [ ] **Tests** at `packages/agents/src/__tests__/positioning.test.ts`:
      prompt snapshot, schema rejection, judge under12 correctness,
      degraded fallback validity, persistence with stubbed llm.
- [ ] **Builds** green for db, agents, trpc, api.

## Non-scope

- Founder UI (ONB-06).
- Taglines below 3/4 are NOT auto-rejected by the agent — we keep them
  with a `total < 3` flag so the UI can present the rejection. Quietly
  filtering would lose information the founder might still want.

## Founder follow-ups

- None new — uses existing ANTHROPIC_API_KEY / OPENAI_API_KEY +
  TRIGGER_*.
