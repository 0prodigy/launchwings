import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// LRC-02 — static email capture detector.
//
// Two independent paths to "found":
//   1. A <form> containing <input type="email">.
//   2. A script src or form action whose URL host substring-matches a known
//      capture provider (loops, beehiiv, convertkit, mailchimp, getrevue,
//      substack, formspree, forms.gle, tally, cal.com).
// We do NOT probe the destination — that's the deferred follow-up
// (lrc-02-followup-email-destination.md).

const PROVIDERS = [
  "loops.so",
  "beehiiv.com",
  "convertkit.com",
  "mailchimp.com",
  "getrevue.co",
  "substack.com",
  "formspree.io",
  "forms.gle",
  "tally.so",
  "cal.com",
] as const;

export type EmailCaptureEvidence = {
  found: boolean;
  kind: "form" | "embed" | null;
  destination: string | null;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url, "https://placeholder.invalid").host;
  } catch {
    return null;
  }
}

function matchProvider(url: string): string | null {
  const lower = url.toLowerCase();
  for (const p of PROVIDERS) {
    if (lower.includes(p)) return p;
  }
  return null;
}

export function judgeEmailCaptureFromHtml(html: string): {
  severity: EvalResult["severity"];
  score: number;
  evidence: EmailCaptureEvidence;
  fixActionMarkdown: string;
} {
  const $ = cheerio.load(html);

  // Path 1: a <form> with input[type=email]. Take the form's action host as
  // the destination (or null if the form posts to the same page).
  let formMatch: { destination: string | null } | null = null;
  $("form").each((_, el) => {
    if (formMatch) return;
    const hasEmail = $(el).find("input[type=email], input[type=Email], input[type=EMAIL]").length > 0;
    if (!hasEmail) return;
    const action = $(el).attr("action") ?? "";
    formMatch = { destination: action ? hostOf(action) ?? action : null };
  });

  // Path 2: provider script/iframe/form-action substring match.
  let embedMatch: { destination: string } | null = null;
  const checkUrl = (url: string | undefined) => {
    if (embedMatch || !url) return;
    const provider = matchProvider(url);
    if (provider) embedMatch = { destination: provider };
  };
  $("script[src]").each((_, el) => checkUrl($(el).attr("src")));
  $("iframe[src]").each((_, el) => checkUrl($(el).attr("src")));
  $("form[action]").each((_, el) => checkUrl($(el).attr("action")));
  $("link[href]").each((_, el) => checkUrl($(el).attr("href")));

  if (formMatch) {
    const m = formMatch as { destination: string | null };
    return {
      severity: "pass",
      score: 100,
      evidence: { found: true, kind: "form", destination: m.destination },
      fixActionMarkdown: `Email capture form found${m.destination ? ` (posts to \`${m.destination}\`)` : ""}. No action needed.`,
    };
  }
  if (embedMatch) {
    const m = embedMatch as { destination: string };
    return {
      severity: "pass",
      score: 100,
      evidence: { found: true, kind: "embed", destination: m.destination },
      fixActionMarkdown: `Email capture embed detected (\`${m.destination}\`). No action needed.`,
    };
  }
  return {
    severity: "fail",
    score: 0,
    evidence: { found: false, kind: null, destination: null },
    fixActionMarkdown:
      "Add an email capture above the fold — a `<form>` with `<input type=\"email\">` or an embed from Loops/Beehiiv/ConvertKit/Substack. No list = no relaunch lever.",
  };
}

export const emailCaptureStaticEvaluator: Evaluator = {
  id: "stage1-email-capture-static",
  title: "Email capture (static)",
  checklistRef: "Stage 1 — email capture present",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgeEmailCaptureFromHtml(html);
    return {
      evaluatorId: "stage1-email-capture-static",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
