import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// LRC-02 — Privacy + Terms link presence.
//   pass   both privacy and terms present
//   warn   exactly one present
//   fail   neither

export type LegalLinksEvidence = {
  privacyHref: string | null;
  termsHref: string | null;
};

export function judgeLegalLinksFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: LegalLinksEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);
  let privacyHref: string | null = null;
  let termsHref: string | null = null;

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text();
    if (!privacyHref && (/\/privacy/i.test(href) || /privacy/i.test(text))) {
      privacyHref = href || text.trim() || null;
    }
    if (!termsHref && (/\/terms|\/tos/i.test(href) || /terms/i.test(text))) {
      termsHref = href || text.trim() || null;
    }
  });

  const evidence: LegalLinksEvidence = { privacyHref, termsHref };

  if (privacyHref && termsHref) {
    return {
      severity: "pass",
      score: 100,
      evidence,
      fixActionMarkdown: "Privacy + Terms links both present. No action needed.",
    };
  }
  if (privacyHref || termsHref) {
    const missing = !privacyHref ? "Privacy Policy" : "Terms of Service";
    return {
      severity: "warn",
      score: 60,
      evidence,
      fixActionMarkdown: `Missing a ${missing} link. Add it to the footer — Stripe, Google OAuth and most app stores require both.`,
    };
  }
  return {
    severity: "fail",
    score: 0,
    evidence,
    fixActionMarkdown:
      "Add Privacy Policy and Terms of Service links to your footer. Required by Stripe, Google OAuth, and the App Store.",
  };
}

export const legalLinksEvaluator: Evaluator = {
  id: "stage1-legal-links",
  title: "Privacy + Terms links",
  checklistRef: "Stage 1 — legal links present",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgeLegalLinksFromHtml(html);
    return {
      evaluatorId: "stage1-legal-links",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
