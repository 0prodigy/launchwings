import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// LRC-02 — pricing page detector. Pass if the homepage links to a pricing
// surface; fail otherwise. No warn band — either a founder has surfaced
// pricing or they haven't.

const TEXT_RE = /^(pricing|plans|pricing & plans)$/i;

export type PricingPageEvidence = {
  matchedHref: string | null;
  matchedText: string | null;
};

export function judgePricingPageFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: PricingPageEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);
  let match: { href: string; text: string } | null = null;
  $("a").each((_, el) => {
    if (match) return;
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const hrefHit = /\/pricing|\/plans/i.test(href);
    const textHit = TEXT_RE.test(text);
    if (hrefHit || textHit) match = { href, text };
  });

  if (match) {
    const m = match as { href: string; text: string };
    return {
      severity: "pass",
      score: 100,
      evidence: { matchedHref: m.href || null, matchedText: m.text || null },
      fixActionMarkdown: `Pricing link found (\`${m.text || m.href}\`). No action needed.`,
    };
  }
  return {
    severity: "fail",
    score: 0,
    evidence: { matchedHref: null, matchedText: null },
    fixActionMarkdown:
      "Add a Pricing link in your nav. Even a single transparent tier beats 'Contact us' for trust.",
  };
}

export const pricingPageEvaluator: Evaluator = {
  id: "stage1-pricing-page",
  title: "Pricing page link",
  checklistRef: "Stage 1 — pricing surfaced",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgePricingPageFromHtml(html);
    return {
      evaluatorId: "stage1-pricing-page",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
