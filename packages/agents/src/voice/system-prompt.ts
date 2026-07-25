// F2 PR1 — system prompt builder for the social-draft agent.
//
// One module instead of inlining string literals inside the agent so the
// prompt is unit-testable (we assert the deny list and channel limits show
// up verbatim) and so PR2+ channels just add a branch here.
//
// Voice rules are derived from the existing build-in-public corpus
// (`docs/dogfood/posts/*.md`):
//   - lowercase-leaning ("shipped today, in one AFK session…")
//   - dry, concrete, technical-founder tone
//   - no exclamation marks, no emoji
//   - short paragraphs separated by blank lines
//   - dashes (— or `—`) for asides
//
// The deny list mirrors `apps/web/scripts/copy-review.config.json`. We do NOT
// load it from disk inside the prompt builder — the prompt has to be stable
// across runs for cassette replay (hashes the system text). Instead we pin a
// curated subset (the "loud" ones humans-in-the-loop catch) and keep a
// repo-side test that asserts every entry in copy-review.config.json shows
// up here too. That way drift is loud rather than silent.

import type { VoiceSample, SocialChannelLiteral } from "./corpus";

export interface BuildSystemPromptInput {
  channel: SocialChannelLiteral;
  voiceSamples: VoiceSample[];
}

// Channel limit table. Posts longer than this get rejected by the LLM-side
// validator (and the agent's output schema). Single source of truth.
export const CHANNEL_LIMITS: Record<SocialChannelLiteral, number> = {
  x: 280,
  linkedin: 3000,
  // PR2+ — values approximate; the agent rejects per-channel cards entirely
  // until the prompts here are tuned.
  reddit: 40_000,
  bluesky: 300,
  threads: 500,
};

// Pinned subset of the copy-review deny list. Anything that absolutely should
// never reach customer eyes from a draft. The corpus_test asserts every
// pattern in apps/web/scripts/copy-review.config.json that's a literal phrase
// (not a regex) appears here.
export const FORBIDDEN_PHRASES: ReadonlyArray<string> = [
  "north star",
  "north-star metric",
  "the wedge",
  "wedge boundary",
  "anti-icp",
  "icp",
  "tam",
  "arr",
  "burn rate",
  "runway",
  "investor deck",
  "any deck we ever write",
  "pre-mortem",
  "premortem",
  "founders take pity",
  "is the only one we plan to publish",
  "is the only one we plan to put",
];

function channelGuidance(channel: SocialChannelLiteral): string {
  switch (channel) {
    case "x":
      return [
        `Channel: X (Twitter). Hard limit ${CHANNEL_LIMITS.x} characters per tweet.`,
        "If a thread is requested by the user, return one draft per tweet with a 1-indexed `threadIndex`.",
        "No hashtag spam. At most 1 hashtag, only if it fits the founder's voice.",
        "Lowercase preferred for prose; proper nouns stay cased.",
      ].join("\n");
    case "linkedin":
      return [
        `Channel: LinkedIn. Hard limit ${CHANNEL_LIMITS.linkedin} characters.`,
        "Slightly more formal than X but still concrete and technical-founder voice.",
        "Lead with one tight first sentence (people see only the first 2 lines before 'see more').",
        "Use blank lines between short paragraphs; no headings or markdown bullets.",
        "If `metadata.docStyle: true` is requested, return one document-style draft (carousel-friendly), otherwise normal post.",
      ].join("\n");
    case "reddit":
      return `Channel: Reddit. Hard limit ${CHANNEL_LIMITS.reddit} characters. Title + body shape; PR1 stub — return one draft with title in the first line, body after a blank line.`;
    case "bluesky":
      return `Channel: Bluesky. Hard limit ${CHANNEL_LIMITS.bluesky} characters. Same lowercase, dry tone as X.`;
    case "threads":
      return `Channel: Threads. Hard limit ${CHANNEL_LIMITS.threads} characters. Same lowercase, dry tone as X.`;
  }
}

function renderVoiceSamples(samples: VoiceSample[]): string {
  if (samples.length === 0) {
    return "(No voice samples available — fall back to the rules above.)";
  }
  return samples
    .map((s, i) => `--- voice sample ${i + 1} (channel: ${s.channel}, slug: ${s.slug}) ---\n${s.body}`)
    .join("\n\n");
}

/**
 * Build the system prompt the LLM uses to generate drafts. Stable string
 * (no timestamps / random ids) so cassettes hash deterministically.
 */
export function buildSocialDraftSystemPrompt(input: BuildSystemPromptInput): string {
  const { channel, voiceSamples } = input;

  return [
    `You are the social-draft writer for a solo technical founder.`,
    `You write build-in-public posts that match the founder's voice exactly.`,
    ``,
    `Voice rules (NON-NEGOTIABLE):`,
    `- lowercase-leaning prose; proper nouns and product names stay cased`,
    `- dry, concrete, technical-founder tone (think 'shipped today: …')`,
    `- no exclamation marks anywhere`,
    `- no emoji`,
    `- no hype words (revolutionary, game-changer, unleash, supercharge)`,
    `- short paragraphs separated by blank lines`,
    `- en-dash (—) or em-dash for asides; not double-hyphen`,
    `- never include the founder's name or first-person 'I' in headlines; 'we' is OK`,
    ``,
    `Forbidden phrases (these are internal-strategy / investor-deck terms — NEVER use):`,
    FORBIDDEN_PHRASES.map((p) => `- "${p}"`).join("\n"),
    ``,
    channelGuidance(channel),
    ``,
    `Output format: a single JSON object, no prose preamble, matching this TypeScript type:`,
    `{ drafts: Array<{ body: string; charCount: number; hashtags?: string[]; threadIndex?: number }> }`,
    ``,
    `- "body" is the post text exactly as it should ship.`,
    `- "charCount" MUST equal body.length and MUST be <= the channel limit.`,
    `- "hashtags" is optional, only for X/Bluesky/Threads, max 1 entry.`,
    `- "threadIndex" is only set when the user asked for a thread.`,
    `Return strictly valid JSON. No code fences. No comments.`,
    ``,
    `Voice corpus (recent posts the founder has shipped — match this voice):`,
    renderVoiceSamples(voiceSamples),
  ].join("\n");
}
