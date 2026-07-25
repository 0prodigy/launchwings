import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// LRC-02 — Twitter card meta validation.
//
//   fail   no twitter:card OR card not in {summary, summary_large_image}
//   warn   card present but title or description missing
//   pass   card + title + description all set
// Image is captured for evidence but not required (og:image is the canonical
// fallback used by Twitter when twitter:image is absent).

const VALID_CARDS = new Set(["summary", "summary_large_image"]);

export type TwitterCardEvidence = {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
};

function metaByName($: cheerio.CheerioAPI, name: string): string | null {
  const v = $("meta")
    .filter((_, el) => $(el).attr("name")?.toLowerCase() === name)
    .first()
    .attr("content");
  return typeof v === "string" ? v : null;
}

export function judgeTwitterCardFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: TwitterCardEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);
  const card = metaByName($, "twitter:card");
  const title = metaByName($, "twitter:title");
  const description = metaByName($, "twitter:description");
  const image = metaByName($, "twitter:image");
  const evidence: TwitterCardEvidence = { card, title, description, image };

  if (!card || !VALID_CARDS.has(card)) {
    return {
      severity: "fail",
      score: 0,
      evidence,
      fixActionMarkdown:
        "Add `<meta name=\"twitter:card\" content=\"summary_large_image\">` to your `<head>`. Without it, Twitter renders a plain link with no preview.",
    };
  }
  if (!title || !description) {
    const missing = [!title && "twitter:title", !description && "twitter:description"]
      .filter(Boolean)
      .join(" + ");
    return {
      severity: "warn",
      score: 70,
      evidence,
      fixActionMarkdown: `\`twitter:card\` is set to \`${card}\` but ${missing} is missing. Add both so Twitter doesn't fall back to og: tags inconsistently.`,
    };
  }
  return {
    severity: "pass",
    score: 100,
    evidence,
    fixActionMarkdown: `Twitter card is \`${card}\` with title + description set. No action needed.`,
  };
}

export const twitterCardEvaluator: Evaluator = {
  id: "stage1-twitter-card",
  title: "Twitter card meta",
  checklistRef: "Stage 1 — twitter:card valid",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgeTwitterCardFromHtml(html);
    return {
      evaluatorId: "stage1-twitter-card",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
