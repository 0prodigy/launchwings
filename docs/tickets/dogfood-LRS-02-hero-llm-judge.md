## DOGFOOD-LRS-02 — Hero-headline LLM-judge evaluator

**Intent**: Stage 1 item 2 ("hero names audience + problem") cannot be settled by regex. Build the LLM-judge so the verdict is grounded.

**Acceptance**:
- Evaluator function `judgeHero({ h1, subhead })` in `packages/agents/lrs-audit/judges/hero.ts` calls `llm({ modelHint: "haiku", system: HERO_JUDGE_SYSTEM, messages, cache: true })` and returns `{ audience_named: bool, problem_named: bool, jargon_score: 0-3, reasoning: string }`.
- `HERO_JUDGE_SYSTEM` lives in `packages/agents/lrs-audit/judges/hero.prompt.ts` and is cached via Anthropic prompt cache (system prompt + rubric in the cached prefix).
- Eval set: 12 hand-graded landing pages in `packages/agents/lrs-audit/evals/hero.jsonl` covering pass / borderline / fail. Pass criterion: agreement with hand-grade ≥ 10/12.
- Verdict on launchwings.com: re-run after `DOGFOOD-LRS-04` lands an explicit founder/about line so the h1+subhead has both audience and problem named loud.
- CI: `eval` action posts the agreement score on every PR that touches the judge.

**Estimate**: 1d. **Owner**: AI eng. **Deps**: `SETUP-12` (eval harness), `LRC-02`.
