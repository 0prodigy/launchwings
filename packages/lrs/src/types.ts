// Core types for the LRS audit harness (LRC-01 PR1).
//
// These shapes are what the runner persists into `lrs_results` and what the
// founder UI renders. Keep them stable; PR2/PR3 will add new evaluators but
// must not extend the shape without bumping a schema version.
//
// Severity ladder (per docs/dogfood/LRS_AUDIT_LOG.md verdicts):
//   pass — evaluator's hard pass. Counts toward the 16/18 Stage 1 bar.
//   warn — soft fail / "near miss". Surface to the founder as a yellow item.
//   fail — hard fail. Blocks launch.
//
// `evidenceJson` is the raw artefact the evaluator captured (e.g. the
// description text + length, the og:image URL + HEAD response). It must be
// JSON-serialisable because we round-trip it through `lrs_results.evidence_json`.
//
// `fixActionMarkdown` is the founder-facing remediation text, written as a
// short imperative ("Trim the meta description to ≤ 158 chars."). The web UI
// renders this as Markdown; keep it free of HTML.

export type Severity = "pass" | "warn" | "fail";

/** What the runner is auditing. PR1 only fills `url`; the runner fetches HTML
 *  on demand and stores it on this struct so multiple HTML-parse evaluators
 *  share a single fetch. PR2 will extend with `multiregionResults`, etc. */
export type AuditTarget = {
  url: string;
  /** Populated by the runner after the first HTML fetch; subsequent
   *  evaluators reuse it instead of hitting the URL again. Optional because
   *  some evaluators (DNS, TLS) don't need HTML at all. */
  fetchedHtml?: string;
  /** The final URL after redirects, if different from `url`. */
  finalUrl?: string;
};

/** Per-evaluator result. One row in `lrs_results`. */
export type EvalResult = {
  /** Stable identifier — `dogfood-LRS-08`, `dogfood-LRS-07`, etc. Maps 1:1
   *  to a ticket in `docs/tickets/`. */
  evaluatorId: string;
  severity: Severity;
  /** 0–100. 100 = pass; 0 = catastrophic fail. UI uses this to colour-band
   *  the row independently of severity. We deliberately allow a `pass`
   *  result to score below 100 (e.g. 92 for a 155-char description in the
   *  warn zone) so cards can render gradients. */
  score: number;
  /** Wall-clock ms inside the evaluator's `evaluate()`. Excludes the
   *  runner's persistence overhead. */
  latencyMs: number;
  /** Microdollars (1 USD = 1_000_000). PR1 evaluators are zero-cost; PR3+
   *  LLM-judge evaluators will populate this. */
  costUsdMicros: number;
  evidenceJson: Record<string, unknown>;
  fixActionMarkdown: string;
};

/** Abstract LLM-fn signature. Mirrors the public contract of
 *  `packages/agents/src/llm.ts` (the `llm()` export) but is declared HERE so
 *  `packages/lrs` does not have to depend on `@launchwings/agents` and the
 *  agents↔lrs cycle stays gone (LRC-01 PR1 decision #1).
 *
 *  Concrete implementations:
 *    - production: bound to the `helpers.llm` injected by `defineAgent`
 *      inside `auditTarget` — that wrapper is cassette-aware AND increments
 *      `agent_runs.cost_usd_micros`.
 *    - tests: a small mock that returns a fixed text + cost, OR the cassette
 *      layer in replay mode.
 *
 *  The shape is intentionally narrower than `LLMRequest`: evaluators don't
 *  need streaming, tools, or `disableCache`. If we add those, extend the
 *  options object — never make existing fields required.
 */
export type LlmFn = (opts: {
  /** `provider:model` string, e.g. `anthropic:claude-haiku-4-5`. */
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** Optional system override; if not set, a leading "system" message in
   *  `messages` is used (Anthropic-style). */
  system?: string;
  maxTokens?: number;
  temperature?: number;
}) => Promise<{ text: string; costUsdMicros: number; modelUsed: string }>;

/** What the runner provides to each `evaluate()`. */
export type AuditContext = {
  /** Convenience fetcher — bypasses cold-cache when multiple evaluators want
   *  the same HTML body. Implemented by the runner; evaluators that need raw
   *  HTML should prefer this over a fresh `fetch()`. */
  fetchHtml: (url: string) => Promise<{ html: string; finalUrl: string; status: number }>;
  /** Identifier for the audit run; useful for log correlation. */
  runId: string;
  /** Stable monotonic clock for latency measurement. Tests inject a fake. */
  now: () => number;
  /** Optional LLM hook — present when the caller (production: `auditTarget`
   *  Trigger task) injects a concrete `llm` wrapper. Evaluators that need it
   *  MUST tolerate `llm` being undefined and degrade gracefully (return
   *  `severity: "warn"` with `evidence_json: { skipped: "llm_not_configured" }`
   *  and a clear `fixActionMarkdown`). PR3+. */
  llm?: LlmFn;
  /** Optional LLM-judge model override (e.g. "openai:gpt-5",
   *  "anthropic:claude-haiku-4-5"). When set, evaluators that call ctx.llm
   *  use it verbatim. When unset, the evaluator picks a sensible default
   *  based on which provider keys are configured (see hero-llm-judge.ts
   *  pickJudgeModel). Added 2026-05-08 alongside the OpenAI-default change. */
  judgeModel?: string;
};

/** The contract every evaluator must satisfy. */
export type Evaluator = {
  /** Stable id used as `lrs_results.evaluator_id`. */
  readonly id: string;
  /** Human-friendly title for the UI. */
  readonly title: string;
  /** Cross-reference to the originating ticket / checklist row. */
  readonly checklistRef: string;
  evaluate: (target: AuditTarget, ctx: AuditContext) => Promise<EvalResult>;
};

/** Aggregate summary persisted as `lrs_runs.summary_json`. */
export type RunSummary = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  errored: number;
  /** Sum of `latencyMs` across all evaluators (NOT wall-clock — they run in
   *  parallel). Useful for capacity planning. */
  totalEvaluatorMs: number;
  totalCostUsdMicros: number;
};

/** Errors thrown with this constructor are eligible for the runner's retry
 *  policy. Anything else is treated as a logic bug and surfaces as a
 *  `severity: "fail"` row with the error message in `evidenceJson.error`.
 *
 *  Use for: transient network errors (timeouts, 5xx), DNS hiccups, PSI quota
 *  blips. Do NOT use for: malformed HTML, missing tags, asset-404s — those
 *  are real evaluator findings, not infrastructure.
 */
export class RetryableError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "RetryableError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
