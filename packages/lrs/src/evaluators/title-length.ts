import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// LRC-02 — <title> length.
//   pass   10..60 inclusive
//   warn   60 < length ≤ 70  OR  5..9
//   fail   missing / empty / whitespace / <5 / >70

export type TitleLengthEvidence = {
  title: string | null;
  length: number;
};

export function judgeTitleLengthFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: TitleLengthEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);
  const raw = $("title").first().text();
  const trimmed = raw.trim();
  const length = trimmed.length;

  if (!trimmed) {
    return {
      severity: "fail",
      score: 0,
      evidence: { title: null, length: 0 },
      fixActionMarkdown:
        "Add a `<title>` of 10–60 characters that names what you do for whom. The SERP cuts at ~60.",
    };
  }
  if (length > 70 || length < 5) {
    return {
      severity: "fail",
      score: 10,
      evidence: { title: trimmed, length },
      fixActionMarkdown:
        length > 70
          ? `Title is ${length} chars — Google will truncate. Aim for ≤ 60.`
          : `Title is only ${length} chars — too short to convey value. Aim for 30–60.`,
    };
  }
  if (length > 60 || length < 10) {
    return {
      severity: "warn",
      score: 70,
      evidence: { title: trimmed, length },
      fixActionMarkdown:
        length > 60
          ? `Title is ${length} chars — in the warn zone. Trim to ≤ 60 for predictable SERP rendering.`
          : `Title is ${length} chars — borderline short. Aim for 30–60 to give Google something to rank.`,
    };
  }
  return {
    severity: "pass",
    score: 100,
    evidence: { title: trimmed, length },
    fixActionMarkdown: `Title length is ${length} chars (within 10–60). No action needed.`,
  };
}

export const titleLengthEvaluator: Evaluator = {
  id: "stage1-title-length",
  title: "Title length",
  checklistRef: "Stage 1 — title 10..60 chars",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgeTitleLengthFromHtml(html);
    return {
      evaluatorId: "stage1-title-length",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
