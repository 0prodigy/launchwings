import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// LRC-02 — About / Founder section detector.
//
// Two signals:
//   1. <a> linking to /about, /team, /founders, /story.
//   2. Inline <h1>/<h2>/<h3> on the homepage matching About-ish wording.
// Pass if a dedicated link exists (signal 1). Warn if only the inline section
// matches (founder is talking about themselves but hasn't bothered with a
// dedicated page). Fail if neither.

const HEADING_RE =
  /^(about|our story|the team|founder['’]?s? note|why we built|meet the team)/i;

export type AboutSectionEvidence = {
  linkHref: string | null;
  headingText: string | null;
};

export function judgeAboutSectionFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: AboutSectionEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);
  let linkHref: string | null = null;
  $("a").each((_, el) => {
    if (linkHref) return;
    const href = $(el).attr("href") ?? "";
    if (/\/about|\/team|\/founders|\/story/i.test(href)) linkHref = href;
  });

  let headingText: string | null = null;
  $("h1, h2, h3").each((_, el) => {
    if (headingText) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (HEADING_RE.test(text)) headingText = text;
  });

  if (linkHref) {
    return {
      severity: "pass",
      score: 100,
      evidence: { linkHref, headingText },
      fixActionMarkdown: `About/team link found (\`${linkHref}\`). No action needed.`,
    };
  }
  if (headingText) {
    return {
      severity: "warn",
      score: 60,
      evidence: { linkHref: null, headingText },
      fixActionMarkdown: `Found an inline About section (\`${headingText}\`) but no dedicated /about page. Promote it to a real page so search engines and curious customers can deep-link.`,
    };
  }
  return {
    severity: "fail",
    score: 0,
    evidence: { linkHref: null, headingText: null },
    fixActionMarkdown:
      "Add an About page (`/about`) or a 'Meet the team' section. Solo-founders especially: a 2-paragraph founder note beats no story at all.",
  };
}

export const aboutSectionEvaluator: Evaluator = {
  id: "stage1-about-section",
  title: "About / founder section",
  checklistRef: "Stage 1 — about/team surfaced",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgeAboutSectionFromHtml(html);
    return {
      evaluatorId: "stage1-about-section",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
