import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// dogfood-LRS-08 — meta description length.
//
// Per docs/tickets/dogfood-LRS-08-meta-description-length.md and
// docs/dogfood/LRS_AUDIT_LOG.md item 12:
//
//   pass   length ≤ 155
//   warn   155 < length ≤ 160
//   fail   length > 160 OR meta tag missing
//
// We keep this a pure-HTML, no-network evaluator. The runner provides a
// memoised `fetchHtml` so we don't re-fetch when the og-image evaluator
// already has the page body — but if someone calls evaluateMetaDescription()
// with a target that already has `fetchedHtml` populated we use that
// directly. (This makes the unit tests trivial: feed a string of HTML.)
//
// Pixel-width upgrade is explicitly out of scope (acceptance criterion: char
// count only). PR2+ may add a Stage 2 pixel-aware variant.

const PASS_LIMIT = 155;
const WARN_LIMIT = 160;

export type MetaDescriptionEvidence = {
  description: string | null;
  length: number;
  passLimit: number;
  warnLimit: number;
};

/** Pure: parse + judge. Exposed for unit tests. */
export function evaluateMetaDescriptionFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: MetaDescriptionEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);
  // Per HTML spec, name comparison is ASCII case-insensitive. cheerio's
  // attribute selectors are case-sensitive, so query via `meta` and filter.
  const description =
    $("meta")
      .filter((_, el) => {
        const name = $(el).attr("name");
        return typeof name === "string" && name.toLowerCase() === "description";
      })
      .first()
      .attr("content") ?? null;

  const length = description?.length ?? 0;

  if (description === null) {
    return {
      severity: "fail",
      score: 0,
      evidence: { description: null, length: 0, passLimit: PASS_LIMIT, warnLimit: WARN_LIMIT },
      fixActionMarkdown:
        "Add a `<meta name=\"description\" content=\"...\">` tag to your `<head>`. Aim for 140–155 characters that name the audience and the problem.",
    };
  }

  if (length > WARN_LIMIT) {
    return {
      severity: "fail",
      score: Math.max(0, 100 - (length - WARN_LIMIT) * 4),
      evidence: { description, length, passLimit: PASS_LIMIT, warnLimit: WARN_LIMIT },
      fixActionMarkdown: `Trim the meta description to ≤ ${PASS_LIMIT} characters (currently ${length}). Google truncates around 155–160; anything longer gets cut mid-sentence on the SERP.`,
    };
  }

  if (length > PASS_LIMIT) {
    return {
      severity: "warn",
      score: 90,
      evidence: { description, length, passLimit: PASS_LIMIT, warnLimit: WARN_LIMIT },
      fixActionMarkdown: `Description is in the warn zone (${length} chars; pass at ≤ ${PASS_LIMIT}). It will probably render but you're one Google font tweak away from truncation. Aim for ≤ 152.`,
    };
  }

  // pass. Score from 100 (best) down to 80 as we approach the warn limit.
  // Empty/very-short descriptions also pass per the checklist (no minimum
  // is specified) but get a lower score — there's no SEO upside to a
  // 12-char description.
  const idealLow = 120;
  const idealHigh = PASS_LIMIT;
  let score = 100;
  if (length < idealLow) {
    score = Math.round(80 + (length / idealLow) * 20);
  } else if (length > idealHigh) {
    // Defensive — shouldn't be reachable since we'd be in warn. Keep for
    // future-proofing if PASS_LIMIT moves.
    score = 90;
  }
  return {
    severity: "pass",
    score,
    evidence: { description, length, passLimit: PASS_LIMIT, warnLimit: WARN_LIMIT },
    fixActionMarkdown: `Description is within the pass band (${length} ≤ ${PASS_LIMIT}). No action needed.`,
  };
}

export const metaDescriptionEvaluator: Evaluator = {
  id: "dogfood-LRS-08",
  title: "Meta description length",
  checklistRef: "Stage 1 item 12 (description ≤ 160 chars)",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = evaluateMetaDescriptionFromHtml(html);
    return {
      evaluatorId: "dogfood-LRS-08",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
