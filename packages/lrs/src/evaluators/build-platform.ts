import {
  RetryableError,
  type AuditContext,
  type AuditTarget,
  type EvalResult,
  type Evaluator,
} from "../types";
import {
  detectBuildPlatform,
  type BuildPlatformDetection,
  type BuildPlatformId,
} from "../detect/build-platform";

// Build-Platform Integration PR1 — evaluator wrapper.
//
// ID: `build-platform-detected`. Always-pass severity (informational); the
// row exists so the founder UI can surface "your site is built on Lovable"
// as context. The dataset side-effect is the partner-outreach moat:
// `packages/agents/src/tasks/audit-target.ts` reads this evaluator's
// evidence_json after `runEvaluators` and inserts a row into
// `product_build_platform_detections`. See ADR-0002 + the
// BUILD_PLATFORM_INTEGRATIONS.md "Why this is a moat" section.
//
// What this evaluator does:
//   1. Fetches the target HTML via ctx.fetchHtml (memoised — other
//      evaluators on the same run share the same fetch).
//   2. Runs the pure-function `detectBuildPlatform` against URL + HTML
//      + response headers.
//   3. Always returns severity="pass". Score = round(confidence * 100).
//   4. evidence_json carries the full detection payload (platform,
//      confidence, signals[]) so downstream consumers (the audit-target
//      task; the founder UI) can render the why-we-think-this list.
//   5. fix_action_markdown:
//        - platform detected — surface a one-line context note that
//          says "your site is on Lovable, some criteria differ" so the
//          founder reads the audit through the right lens.
//        - platform not detected — empty string (no remediation needed;
//          the row is purely informational).
//
// Header capture note: the runner's default fetchHtml returns
// `{ html, finalUrl, status }` and does NOT today expose response
// headers. We accept that limitation for PR1 — most detection signal
// strength is in subdomain + HTML hints anyway, and PR2 can extend the
// fetcher's return shape to include headers without changing this
// evaluator's contract. The evaluator passes `headers: undefined` so
// the detection function gracefully degrades.

const FETCH_TIMEOUT_MS = 8_000;

export const BUILD_PLATFORM_EVALUATOR_ID = "build-platform-detected";

/** Public type re-exported so consumers (audit-target task, founder UI)
 *  can read evidence_json without re-importing from the detect/ folder. */
export type BuildPlatformEvaluatorEvidence = {
  /** The platform we landed on, or null. */
  platform: BuildPlatformId | null;
  /** 0..100 integer (the detection lib emits 0..1; we scale here so the
   *  evaluator's `score` field matches the persisted evidence). */
  confidence: number;
  signals: BuildPlatformDetection["signals"];
};

function buildEvidence(detection: BuildPlatformDetection): BuildPlatformEvaluatorEvidence {
  return {
    platform: detection.platform,
    confidence: Math.round(detection.confidence * 100),
    signals: detection.signals,
  };
}

/** Display name shown in the fix-action note. The catalog table is the
 *  authoritative source, but the evaluator runs synchronously inside the
 *  runner with no DB handle, so we hard-code the seven detected platforms
 *  here. Drift risk is bounded — these names match the seed script's
 *  `name` field; if we add an eighth detection target this map grows. */
const PLATFORM_DISPLAY_NAMES: Record<BuildPlatformId, string> = {
  lovable: "Lovable",
  bolt: "Bolt.new",
  v0: "v0 by Vercel",
  replit: "Replit",
  cursor: "Cursor",
  paperclip: "Paperclip",
  pickaxe: "Pickaxe",
};

/** Compose the fix_action_markdown copy for a detected platform. The text
 *  is deliberately concise + free of internal-strategy vocabulary (no
 *  "wedge", "icp", "north star", etc.) so the copy-review gate passes
 *  without any per-string allow-list entries. See
 *  `apps/web/scripts/copy-review.config.json` and the assertion in
 *  `__tests__/evaluators/build-platform.test.ts`. */
export function detectedPlatformFixAction(platform: BuildPlatformId): string {
  const name = PLATFORM_DISPLAY_NAMES[platform];
  return (
    `Your site is built on ${name}. Some launch-readiness criteria differ — ` +
    `for example, custom backends are managed by ${name}, so you can skip the ` +
    `infrastructure-side checks and focus on launch copy + analytics + screenshots.`
  );
}

/** Pure orchestration helper exposed for the evaluator + tests. Takes
 *  HTML + URL + optional headers and returns the persisted evaluator
 *  shape (severity, score, evidence, fixActionMarkdown) without going
 *  through the AuditContext indirection. */
export function evaluateBuildPlatform(args: {
  url: string;
  html?: string;
  headers?: Headers | Record<string, string | string[] | undefined>;
}): {
  severity: EvalResult["severity"];
  score: number;
  evidence: BuildPlatformEvaluatorEvidence;
  fixActionMarkdown: string;
} {
  const detection = detectBuildPlatform({
    url: args.url,
    ...(args.html !== undefined ? { html: args.html } : {}),
    ...(args.headers !== undefined ? { headers: args.headers } : {}),
  });
  const evidence = buildEvidence(detection);
  const score = evidence.confidence;
  const fixActionMarkdown =
    detection.platform !== null ? detectedPlatformFixAction(detection.platform) : "";
  return {
    // Informational: this evaluator never fails an audit. The /audit demo
    // simply renders the detection as context. A null detection is also
    // "pass" — there is nothing to fix.
    severity: "pass",
    score,
    evidence,
    fixActionMarkdown,
  };
}

export const buildPlatformEvaluator: Evaluator = {
  id: BUILD_PLATFORM_EVALUATOR_ID,
  title: "Build-platform detection",
  checklistRef: "docs/architecture/BUILD_PLATFORM_INTEGRATIONS.md §Level 1",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();

    let html: string | undefined;
    try {
      const fetched = await ctx.fetchHtml(target.url);
      html = fetched.html;
    } catch (err) {
      // Fetch errors are RetryableError per the runner's policy; the
      // runner already retries before reaching us. If we still get one
      // here, propagate so the runner can synthesise a fail row — same
      // shape as the other HTML-dependent evaluators.
      if (err instanceof RetryableError) throw err;
      throw new RetryableError(
        `build-platform fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    // The runner's default fetchHtml signature does not surface response
    // headers today (PR1 limitation). We pass undefined; subdomain + HTML
    // signals are usually enough.
    const judged = evaluateBuildPlatform({
      url: target.url,
      ...(html !== undefined ? { html } : {}),
    });

    return {
      evaluatorId: BUILD_PLATFORM_EVALUATOR_ID,
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};

// `FETCH_TIMEOUT_MS` is reserved for a future per-evaluator timeout wrapper
// (the runner's fetcher is unbounded; we'll move to AbortSignal.timeout in
// PR2 once we have a usage signal). Currently unused — keep the export so
// the constant lives next to the evaluator.
void FETCH_TIMEOUT_MS;
