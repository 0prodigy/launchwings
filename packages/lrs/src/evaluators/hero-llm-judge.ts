import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// dogfood-LRS-02 — hero-headline LLM-judge evaluator.
//
// Per docs/tickets/dogfood-LRS-02-hero-llm-judge.md:
//
// Stage 1 item 2 ("hero names audience + problem") cannot be settled by
// regex. The judge calls Claude Haiku and scores the hero copy on five
// criteria:
//
//   1. Promise clarity        (1-10)
//   2. ICP specificity        (1-10)
//   3. Concrete-vs-vague      (1-10)
//   4. Calls out an outcome   (binary 0|10)
//   5. CTA proximity          (binary 0|10)
//
// We fold (4) and (5) onto the 0-10 scale so the avg has a single unit. The
// avg drives the verdict ladder:
//
//   pass   avg ≥ 7
//   warn   5 ≤ avg < 7
//   fail   avg < 5
//
// Plus three deterministic edge cases:
//
//   - Missing <h1>:        warn (we can't score what isn't there).
//   - ctx.llm undefined:   warn, evidence_json.skipped = "llm_not_configured".
//   - LLM responded with   fail (with diagnostic in evidence) — protects us
//     unparseable JSON:    against silent regressions in the judge prompt.
//
// Cassette/cost: this is the first per-audit-cost evaluator. Haiku at
// ~$1/$5 per 1M in/out tokens, ~600 tokens per call → ~$0.0001/call. Fits
// the per-audit budget headroom. The runner records cost via
// EvalResult.costUsdMicros.
//
// Why we extract just the first <h1> + first paragraph below it: that's the
// "hero" by convention (ICP + promise + above-the-fold scroll). PR4+ may
// extend to subhead detection but for now the simple shape captures the
// 80% case across the launchwings.com / typical SaaS marketing tree.

// Model selection — was hardcoded `anthropic:claude-haiku-4-5` at PR3 time.
// Founder authorization (2026-05-08): default to OpenAI when only OPENAI_API_KEY
// is set so the judge actually produces a real result instead of failing on a
// missing Anthropic key.
//
// Why a local helper (vs importing from @launchwings/agents):
//   - LRC-01 PR1 broke the agents↔lrs cycle via DI. Importing pickAvailableModel
//     here would re-introduce it. The logic is small enough to inline; the
//     contract is mirrored by `packages/agents/src/llm.ts pickAvailableModel`.
//
// Override precedence (highest first):
//   1. `AuditContext.judgeModel` — caller (auditTarget Trigger task) can pin
//      a specific model for a run.
//   2. `LLM_OPENAI_DEFAULT_MODEL` env — same lever as the agents helper.
//   3. Provider-key-presence routing (OpenAI > Anthropic when only one is set;
//      OpenAI wins when both are).
//   4. Final fallback: anthropic:claude-haiku-4-5 (legacy default).

const FALLBACK_MODEL = "anthropic:claude-haiku-4-5";

export function pickJudgeModel(opts: { override?: string } = {}): string {
  if (opts.override && opts.override.length > 0) return opts.override;
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (hasOpenAI) {
    const envOverride = process.env.LLM_OPENAI_DEFAULT_MODEL;
    if (envOverride === "openai:gpt-5" || envOverride === "openai:gpt-4o-mini") {
      return envOverride;
    }
    return "openai:gpt-5";
  }
  if (hasAnthropic) return "anthropic:claude-haiku-4-5";
  // No keys configured. Returning a fallback string is safe — the actual
  // failure surfaces inside ctx.llm, which raises LLMConfigError. The
  // evaluator's catch path renders a clean fail-state.
  return FALLBACK_MODEL;
}

export const HERO_JUDGE_SYSTEM = `You are a landing-page copy reviewer. The user gives you a hero (h1 + lede paragraph). Score it on five axes and return ONE valid JSON object — no prose, no code fences, no commentary.

Schema (every field required):
{
  "promiseClarity": 1-10,        // is the value-prop unambiguous in <8 sec?
  "icpSpecificity": 1-10,        // does it name an audience precisely?
  "concreteLanguage": 1-10,      // 10=concrete numbers / nouns; 1=vague jargon
  "outcomeNamed": 0 | 10,        // does it call out a result/outcome? binary
  "ctaProximity": 0 | 10,        // does the lede hand off to a CTA? binary
  "recommendation": "<= 220 chars, one sentence, imperative — what to change."
}

Calibration:
- Vague taglines like "the future of work" score 1-3 on promiseClarity and concreteLanguage.
- "Ship a launch in a weekend, even if you've never deployed before." scores 8-10 on promiseClarity, 8 on icpSpecificity (solo non-deployers), 10 on outcomeNamed.

Output ONLY the JSON. Do not wrap in backticks.`;

export type HeroScores = {
  promiseClarity: number;
  icpSpecificity: number;
  concreteLanguage: number;
  outcomeNamed: number;
  ctaProximity: number;
  recommendation: string;
};

export type HeroJudgeEvidence = {
  h1: string | null;
  lede: string | null;
  scores: HeroScores | null;
  averageScore: number | null;
  rawLlmText: string | null;
  parseError: string | null;
  modelUsed: string | null;
  skipped?: "llm_not_configured" | "missing_h1";
};

/** Pure: parse the first <h1> and the first paragraph that follows it. */
export function parseHeroFromHtml(html: string): {
  h1: string | null;
  lede: string | null;
} {
  const $ = cheerio.load(html);
  const firstH1 = $("h1").first();
  if (firstH1.length === 0) return { h1: null, lede: null };
  const h1 = firstH1.text().trim().replace(/\s+/g, " ");
  // Find the first <p> that appears AFTER the first h1 in document order.
  // cheerio's nextAll() walks following siblings of the same parent; that's
  // good enough for typical hero markup (h1 + p inside the same wrapper).
  // Fallback: any <p> whose source position is after this h1.
  let lede: string | null = null;
  const followingP = firstH1.nextAll("p").first();
  if (followingP.length > 0) {
    lede = followingP.text().trim().replace(/\s+/g, " ");
  } else {
    // Look one level up — common when h1 + p are wrapped in nested divs.
    const wrapper = firstH1.parent();
    const wrapperP = wrapper.find("p").first();
    if (wrapperP.length > 0) {
      lede = wrapperP.text().trim().replace(/\s+/g, " ");
    }
  }
  return { h1, lede: lede && lede.length > 0 ? lede : null };
}

function average(scores: HeroScores): number {
  // Five axes, each 0-10. Simple mean; surfaced as 1-decimal in evidence.
  const sum =
    scores.promiseClarity +
    scores.icpSpecificity +
    scores.concreteLanguage +
    scores.outcomeNamed +
    scores.ctaProximity;
  return sum / 5;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Parse the LLM's JSON response into HeroScores. Throws on shape drift. */
export function parseHeroScoresFromLlm(text: string): HeroScores {
  // Be tolerant of accidental code-fence wrapping — strip ```json / ``` if
  // present. The system prompt forbids it but models drift; we'd rather
  // recover than fail an audit because of formatting.
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const num = (k: string): number => {
    const v = parsed[k];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`hero-llm-judge: missing/non-numeric field "${k}" in LLM response`);
    }
    return v;
  };
  const recommendation = parsed.recommendation;
  if (typeof recommendation !== "string") {
    throw new Error("hero-llm-judge: missing/non-string recommendation in LLM response");
  }
  return {
    promiseClarity: clamp(num("promiseClarity"), 1, 10),
    icpSpecificity: clamp(num("icpSpecificity"), 1, 10),
    concreteLanguage: clamp(num("concreteLanguage"), 1, 10),
    outcomeNamed: num("outcomeNamed") >= 5 ? 10 : 0,
    ctaProximity: num("ctaProximity") >= 5 ? 10 : 0,
    recommendation: recommendation.slice(0, 400),
  };
}

const HAND_CRAFTED_FIX_PARA =
  "Rewrite the hero so a stranger can name your audience and the outcome you deliver in under 8 seconds. " +
  "One sentence: who it's for + the concrete win. Drop adjectives like 'powerful', 'seamless', 'next-gen' — they earn nothing. " +
  "Put a single primary CTA within one viewport of the h1.";

export const heroLlmJudgeEvaluator: Evaluator = {
  id: "dogfood-LRS-02",
  title: "Hero-headline LLM judge",
  checklistRef: "Stage 1 item 2 (hero names audience + problem)",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const { h1, lede } = parseHeroFromHtml(html);

    const baseEvidence: HeroJudgeEvidence = {
      h1,
      lede,
      scores: null,
      averageScore: null,
      rawLlmText: null,
      parseError: null,
      modelUsed: null,
    };

    if (!h1) {
      const evidence: HeroJudgeEvidence = { ...baseEvidence, skipped: "missing_h1" };
      return {
        evaluatorId: "dogfood-LRS-02",
        severity: "warn",
        score: 30,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown:
          "Page has no `<h1>` — the hero judge can't score what isn't there. Add a single, descriptive `<h1>` " +
          "that names the audience and the outcome (e.g. \"Ship a launch in a weekend, even if you've never deployed before.\").",
      };
    }

    if (!ctx.llm) {
      const evidence: HeroJudgeEvidence = { ...baseEvidence, skipped: "llm_not_configured" };
      return {
        evaluatorId: "dogfood-LRS-02",
        severity: "warn",
        score: 50,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown:
          "LLM judge is not configured (no `ctx.llm` injected). The hero copy was extracted but not scored. " +
          "Wire the agents `helpers.llm` into the audit context (production runs do this via the `auditTarget` Trigger task).",
      };
    }

    // Build the user message. Keep it compact — Haiku tokens add up at scale.
    const userContent =
      `H1: ${h1}\n\n` +
      `Lede: ${lede ?? "(no paragraph found below the h1)"}\n\n` +
      `Score this hero per the rubric. Return ONLY the JSON object.`;

    let llmText: string;
    let costUsdMicros = 0;
    const judgeModel = pickJudgeModel({ override: ctx.judgeModel });
    let modelUsed: string = judgeModel;
    try {
      const resp = await ctx.llm({
        // The cast widens the local string to the agents-side ModelId union
        // when LlmFn is invoked. The AuditContext.LlmFn signature accepts
        // `model: string` (no agents dependency), so we just pass through.
        model: judgeModel,
        system: HERO_JUDGE_SYSTEM,
        messages: [{ role: "user", content: userContent }],
        maxTokens: 400,
        temperature: 0.1,
      });
      llmText = resp.text;
      costUsdMicros = resp.costUsdMicros;
      modelUsed = resp.modelUsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const evidence: HeroJudgeEvidence = {
        ...baseEvidence,
        parseError: `llm_call_failed: ${message}`,
      };
      return {
        evaluatorId: "dogfood-LRS-02",
        severity: "fail",
        score: 0,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown:
          `LLM call failed: ${message}. ${HAND_CRAFTED_FIX_PARA} (Re-run the audit once the upstream issue is resolved.)`,
      };
    }

    let scores: HeroScores;
    try {
      scores = parseHeroScoresFromLlm(llmText);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const evidence: HeroJudgeEvidence = {
        ...baseEvidence,
        rawLlmText: llmText,
        parseError: message,
        modelUsed,
      };
      return {
        evaluatorId: "dogfood-LRS-02",
        severity: "fail",
        score: 0,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown:
          `LLM judge returned an unparseable response (${message}). This is a harness-side regression — file a bug. ${HAND_CRAFTED_FIX_PARA}`,
      };
    }

    const avg = average(scores);
    const evidence: HeroJudgeEvidence = {
      h1,
      lede,
      scores,
      averageScore: Number(avg.toFixed(2)),
      rawLlmText: llmText,
      parseError: null,
      modelUsed,
    };

    // Verdict ladder. Score on the 100-scale: avg*10 (10→100, 5→50).
    let severity: EvalResult["severity"];
    let fixAction: string;
    if (avg >= 7) {
      severity = "pass";
      fixAction = `Hero scores ${avg.toFixed(1)}/10 average — within the pass band. No action needed.`;
    } else if (avg >= 5) {
      severity = "warn";
      fixAction =
        `Hero is in the warn zone (avg ${avg.toFixed(1)}/10). ${HAND_CRAFTED_FIX_PARA} ` +
        `Judge's specific recommendation: ${scores.recommendation}`;
    } else {
      severity = "fail";
      fixAction =
        `Hero scored avg ${avg.toFixed(1)}/10 — below the launch bar. ${HAND_CRAFTED_FIX_PARA} ` +
        `Judge's specific recommendation: ${scores.recommendation}`;
    }

    return {
      evaluatorId: "dogfood-LRS-02",
      severity,
      score: Math.round(avg * 10),
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros,
      evidenceJson: evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: fixAction,
    };
  },
};
