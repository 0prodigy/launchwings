import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// LRC-02 — primary CTA detector. Pure DOM scan, no network.
//
// Heuristic: scan the first 50 <a>/<button> elements (DOM order — a rough
// proxy for "above the fold"; a real fold check would need rendering). Match
// text against the verb whitelist below. Pass if any matched element has
// trimmed text ≤ 8 words; warn if a match exists but is too wordy; fail if
// no match. We deliberately favour false-negatives over false-positives —
// "Get the brief" beats "Get more information about our enterprise plan".

const CTA_VERB_RE = /^(get|start|try|sign[- ]?up|join|launch|book|buy|create|build|claim|request)\b/i;
const SCAN_LIMIT = 50;
const WORD_LIMIT = 8;

export type PrimaryCtaEvidence = {
  matchedText: string | null;
  matchedTag: "a" | "button" | null;
  candidateCount: number;
};

export function judgePrimaryCtaFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: PrimaryCtaEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);
  const candidates = $("a, button").slice(0, SCAN_LIMIT);
  const candidateCount = candidates.length;

  let firstMatch: { text: string; tag: "a" | "button" } | null = null;
  let firstShortMatch: { text: string; tag: "a" | "button" } | null = null;

  candidates.each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (!CTA_VERB_RE.test(text)) return;
    const tag = (el as { tagName?: string }).tagName === "button" ? "button" : "a";
    if (!firstMatch) firstMatch = { text, tag };
    if (!firstShortMatch && text.split(/\s+/).length <= WORD_LIMIT) {
      firstShortMatch = { text, tag };
    }
  });

  const fix =
    "Add a single, specific primary CTA above the fold like 'Start free trial' or 'Get the brief in 30 seconds'.";

  if (firstShortMatch) {
    const m = firstShortMatch as { text: string; tag: "a" | "button" };
    return {
      severity: "pass",
      score: 100,
      evidence: { matchedText: m.text, matchedTag: m.tag, candidateCount },
      fixActionMarkdown: `Found a strong primary CTA (\`${m.text}\`). No action needed.`,
    };
  }
  if (firstMatch) {
    const m = firstMatch as { text: string; tag: "a" | "button" };
    return {
      severity: "warn",
      score: 60,
      evidence: { matchedText: m.text, matchedTag: m.tag, candidateCount },
      fixActionMarkdown: `Primary CTA candidate (\`${m.text}\`) is more than ${WORD_LIMIT} words. Tighten it. ${fix}`,
    };
  }
  return {
    severity: "fail",
    score: 0,
    evidence: { matchedText: null, matchedTag: null, candidateCount },
    fixActionMarkdown: fix,
  };
}

export const primaryCtaEvaluator: Evaluator = {
  id: "stage1-cta-primary",
  title: "Primary CTA above the fold",
  checklistRef: "Stage 1 — primary CTA",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgePrimaryCtaFromHtml(html);
    return {
      evaluatorId: "stage1-cta-primary",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
