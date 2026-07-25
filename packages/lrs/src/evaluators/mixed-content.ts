import * as cheerio from "cheerio";
import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// dogfood-LRS-05 (regex-on-shipped-HTML half) — mixed-content evaluator.
//
// Per docs/tickets/dogfood-LRS-05-mixed-content-check.md the full ticket
// scope includes a headed-browser pass that listens for Chrome DevTools
// `Mixed Content:` events at runtime. That half is blocked on Browserbase
// wiring (SETUP-11). This evaluator covers the cheap-and-deterministic
// half: parse the shipped HTML with cheerio and flag any subresource
// reference that begins with `http://`.
//
// We deliberately ignore relative URLs, protocol-relative `//cdn.example`
// URLs (these inherit the page's protocol — fine on HTTPS), `data:` URIs
// (inline content, no network), and `blob:` URIs (in-memory). We DO
// flag bare `http://` because the browser will block (or warn on) it
// when the page is served over HTTPS.
//
// Severity ladder per ticket spec:
//   pass    zero http:// subresources
//   warn    1–2 non-script subresources (e.g. an <img> someone left
//           pointing at a dev-only host — not great, not catastrophic)
//   fail    >=3 subresources OR any of them is a <script> (script
//           injection over plaintext is the actual attack vector;
//           browsers hard-block on HTTPS pages)
//
// Network failures are not possible — this is a pure HTML parse.
//
// Tags we inspect (per ticket): script[src], link[href], img[src],
// iframe[src], source[src], audio[src], video[src]. We do NOT walk
// inline-style `url(http://...)` references in PR2 — that is a Stage 2
// CSS-AST scan, not a DOM probe. Captured for follow-up.

type WatchedTag = {
  tag: "script" | "link" | "img" | "iframe" | "source" | "audio" | "video";
  attr: "src" | "href";
};

const WATCHED_TAGS: WatchedTag[] = [
  { tag: "script", attr: "src" },
  { tag: "link", attr: "href" },
  { tag: "img", attr: "src" },
  { tag: "iframe", attr: "src" },
  { tag: "source", attr: "src" },
  { tag: "audio", attr: "src" },
  { tag: "video", attr: "src" },
];

export type MixedContentFinding = {
  tag: WatchedTag["tag"];
  attr: WatchedTag["attr"];
  url: string;
};

export type MixedContentEvidence = {
  findings: MixedContentFinding[];
  totalCount: number;
  scriptCount: number;
};

/** Pure: scan a string of HTML for http:// subresource references. */
export function findMixedContent(html: string): MixedContentFinding[] {
  const $ = cheerio.load(html);
  const findings: MixedContentFinding[] = [];
  for (const { tag, attr } of WATCHED_TAGS) {
    $(tag).each((_, el) => {
      const raw = $(el).attr(attr);
      if (typeof raw !== "string") return;
      const trimmed = raw.trim();
      // Lower-case only the scheme prefix; the rest of the URL may be
      // case-sensitive (path, query). We only need to compare the prefix.
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("http://")) {
        findings.push({ tag, attr, url: trimmed });
      }
    });
  }
  return findings;
}

/** Pure: judge a list of findings against the severity ladder. */
export function judgeMixedContent(findings: MixedContentFinding[]): {
  severity: EvalResult["severity"];
  score: number;
  evidence: MixedContentEvidence;
  fixActionMarkdown: string;
} {
  const totalCount = findings.length;
  const scriptCount = findings.filter((f) => f.tag === "script").length;
  const evidence: MixedContentEvidence = { findings, totalCount, scriptCount };

  if (totalCount === 0) {
    return {
      severity: "pass",
      score: 100,
      evidence,
      fixActionMarkdown:
        "No `http://` subresources detected. Replace these with HTTPS URLs or use protocol-relative `//` URLs if any appear later.",
    };
  }

  // Any script over http on an HTTPS page is hard-blocked by every modern
  // browser → never just a warn.
  if (scriptCount > 0 || totalCount >= 3) {
    return {
      severity: "fail",
      score: Math.max(0, 40 - totalCount * 5),
      evidence,
      fixActionMarkdown: `Found ${totalCount} subresource${totalCount === 1 ? "" : "s"} loaded over plaintext \`http://\` (${scriptCount} of which are scripts). Browsers will block these on HTTPS pages and your console will fill with mixed-content warnings. Replace these with HTTPS URLs or use protocol-relative \`//\` URLs.`,
    };
  }

  return {
    severity: "warn",
    score: 75,
    evidence,
    fixActionMarkdown: `Found ${totalCount} \`http://\` subresource${totalCount === 1 ? "" : "s"} (no scripts, so the page won't break — yet). Replace these with HTTPS URLs or use protocol-relative \`//\` URLs before they bite.`,
  };
}

export const mixedContentEvaluator: Evaluator = {
  id: "dogfood-LRS-05",
  title: "Mixed-content (HTTP subresources on HTTPS pages)",
  checklistRef: "Stage 1 item 6 (TLS + mixed-content) — HTML-scan half",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const findings = findMixedContent(html);
    const judged = judgeMixedContent(findings);
    return {
      evaluatorId: "dogfood-LRS-05",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
