// F2 PR1 — directorySubmitterAgent.
//
// Prepares per-directory submissions in the founder's voice. For each
// requested directory:
//   1. Look up the catalog entry (slug → DirectoryCatalogEntry).
//   2. Map the founder's productBrief onto the catalog's field_schema.
//      - Plain fields (name, url, email, screenshot_url, …) are mapped 1:1.
//      - Free-text fields (tagline, description, body, pitch, first_comment,
//        body_markdown, …) get an LLM blurb generated in the founder's voice
//        with a hard maxLength budget. The agent re-truncates after the LLM
//        call (the model occasionally overshoots by a handful of chars).
//   3. INSERT a directory_submissions row with status:
//      - "needs_manual" for `automation_kind === 'manual'` — the daily brief
//        will surface it to the founder with copy-pastable text.
//      - "draft" for `'api'` and `'browser_form'` — PR2/PR3 wires the worker.
//
// PR1 deliberately does NOT actually submit anything live. We're proving the
// 30-channels claim (catalog breadth) + the prepared-payload story.
//
// Tests use a stub `loadCatalog` so they don't touch the live catalog table.
// Production reads from the in-code DIRECTORY_CATALOG (the seed script keeps
// the DB row in sync, but the agent treats the in-code list as canonical for
// PR1 — it's faster, deterministic for cassette tests, and avoids a public
// SELECT round-trip per agent run).

import { z } from "zod";
import { directorySubmissions } from "@launchwings/db";
import { baseAgentPayload, defineAgent, type AgentHelpers } from "../runtime";
import {
  DIRECTORY_CATALOG,
  getDirectoryBySlug,
  type DirectoryCatalogEntry,
  type DirectoryFieldSpec,
} from "../directories/catalog";
import {
  buildSocialDraftSystemPrompt,
  loadVoiceCorpus,
  type VoiceSample,
} from "../voice";
import type { DbPool } from "@launchwings/db";
import type { LLMRequest, ModelId } from "../llm";

// ----- Payload schema ------------------------------------------------------

const productBriefSchema = z.object({
  name: z.string().min(1).max(120),
  oneLiner: z.string().min(1).max(400),
  longDescription: z.string().min(1).max(4000),
  url: z.string().url(),
  audience: z.string().min(1).max(400),
  valueProp: z.string().min(1).max(800),
  pricingHint: z.string().max(200).optional(),
  launchDate: z.string().optional(),
  screenshotUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  categoryHint: z.string().max(120).optional(),
  founderEmail: z.string().email(),
});

const voiceProfileSchema = z.object({
  samples: z.array(z.string().min(1)),
  guidelines: z.string().max(2000).optional(),
});

export const directorySubmitterPayloadSchema = baseAgentPayload.extend({
  productBrief: productBriefSchema,
  directorySlugs: z.array(z.string()).min(1).max(40),
  voiceProfile: voiceProfileSchema.optional(),
});

export type DirectorySubmitterPayload = z.infer<typeof directorySubmitterPayloadSchema>;
export type DirectoryProductBrief = z.infer<typeof productBriefSchema>;

// ----- Public output type --------------------------------------------------

export interface PreparedSubmission {
  id: string;
  slug: string;
  status: "draft" | "needs_manual";
  payload: Record<string, unknown>;
}

export interface DirectorySubmitterOutput {
  runId: string;
  prepared: PreparedSubmission[];
}

// ----- Helpers -------------------------------------------------------------

// Free-text field types the LLM should generate copy for. Every other field
// type (url, email, image_url, date, select) is mapped from the brief or
// left blank — no LLM round-trip needed.
const LLM_FIELD_TYPES = new Set<DirectoryFieldSpec["type"]>(["text", "longtext"]);

// Field keys that are 1:1 mappable from the productBrief — never sent to the
// LLM. Keep this map narrow; anything not listed here either gets an LLM blurb
// (text/longtext) or is left undefined.
function plainBriefValue(
  fieldKey: string,
  brief: DirectoryProductBrief,
): string | undefined {
  switch (fieldKey) {
    case "name":
      return brief.name;
    case "url":
      return brief.url;
    case "email":
      return brief.founderEmail;
    case "screenshot_url":
      return brief.screenshotUrl;
    case "logo_url":
      return brief.logoUrl;
    case "cover_image_url":
      return brief.screenshotUrl;
    case "launch_date":
      return brief.launchDate;
    case "pricing":
      return brief.pricingHint;
    case "category":
    case "alternative_to":
    case "topics":
    case "tags":
    case "flair":
      return brief.categoryHint;
    default:
      return undefined;
  }
}

function truncate(s: string, max: number | undefined): string {
  if (!max) return s;
  if (s.length <= max) return s;
  // Hard truncate at maxLength. The directory side will reject anything
  // longer; we don't try to be clever about word boundaries because the
  // LLM was already told to stay under the limit. A clean break at maxLength
  // is preferable to silently submitting a too-long blob.
  return s.slice(0, max);
}

interface BlurbInput {
  brief: DirectoryProductBrief;
  directory: DirectoryCatalogEntry;
  field: DirectoryFieldSpec;
  voiceSamples: VoiceSample[];
  helpers: AgentHelpers;
  model: ModelId;
}

/**
 * Generate a single free-text blurb for one (directory, field) pair.
 *
 * We reuse `buildSocialDraftSystemPrompt` for the voice rules block (deny
 * list, lowercase-leaning, no emoji) by treating the directory blurb as a
 * `linkedin`-channel-ish post. The system prompt is appended with a directory-
 * specific instruction line that scopes the output to a single field. The
 * LLM returns plain text (no JSON wrapper) because we're filling exactly one
 * field; less ceremony, fewer parse-failure paths.
 */
async function generateBlurb(input: BlurbInput): Promise<string> {
  const { brief, directory, field, voiceSamples, helpers, model } = input;
  const max = field.maxLength ?? 500;

  // Use linkedin as a stand-in channel for the voice-rules portion. The blurb
  // generator never targets a social channel directly — we just want the deny
  // list + tone rules. A "directory" channel literal would be cleaner; left
  // as a follow-up to keep the prompt module untouched.
  const systemBase = buildSocialDraftSystemPrompt({
    channel: "linkedin",
    voiceSamples,
  });

  const directoryBlock = [
    "",
    "You are NOT writing a social-media post. You are filling exactly one",
    `field on a directory submission for "${directory.name}".`,
    "",
    `Directory context: ${directory.instructionsMd}`,
    "",
    `Field: "${field.label}" (key: ${field.key}).`,
    `Hard limit: ${max} characters. Stay STRICTLY under this; do not include the limit number in your output.`,
    "",
    "Output ONLY the field text. No JSON. No code fences. No labels. No markdown.",
  ].join("\n");

  const system = systemBase + "\n\n" + directoryBlock;

  const userMessage = [
    `Generate the "${field.label}" copy for the directory submission.`,
    ``,
    `Product name: ${brief.name}`,
    `One-liner: ${brief.oneLiner}`,
    `URL: ${brief.url}`,
    `Audience: ${brief.audience}`,
    `Value prop: ${brief.valueProp}`,
    `Long description: ${brief.longDescription}`,
    brief.pricingHint ? `Pricing: ${brief.pricingHint}` : null,
    brief.categoryHint ? `Category: ${brief.categoryHint}` : null,
    ``,
    `Return ONLY the field text. Stay under ${max} characters.`,
  ]
    .filter(Boolean)
    .join("\n");

  const req: LLMRequest = {
    model,
    system,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: Math.max(256, Math.ceil(max / 2)),
    temperature: 0.4,
  };

  const resp = await helpers.llm(req);
  // Strip surrounding quotes / leading "Field:" labels the LLM occasionally
  // adds despite the instruction. Cheap defensive cleanup; truncation below
  // catches over-length cases.
  let text = resp.text.trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) {
    text = text.slice(1, -1).trim();
  }
  if (text.length > max) {
    helpers.logEvent({
      level: "warn",
      source: "agents.directory-submitter",
      message: "directory_blurb_over_limit_truncating",
      directory: directory.slug,
      field: field.key,
      generated: text.length,
      max,
    });
    text = truncate(text, max);
  }
  return text;
}

// ----- Pure run body (testable) -------------------------------------------

/**
 * Pure run body. Same shape as runSocialDraftAgent — takes helpers + a tx +
 * an agentRunId so unit tests can pass stubs for each. Mirrors social-draft.ts.
 */
export async function runDirectorySubmitterAgent(
  payload: DirectorySubmitterPayload,
  helpers: AgentHelpers,
  meta: {
    agentRunId: string;
    triggerRunId: string;
    tenantId: string;
    /** RLS-scoped tx from defineAgent. Tests pass a minimal mock. */
    tx: Pick<DbPool, "insert">;
    /** Loader for voice samples; injected so tests can pass an in-memory list. */
    loadCorpus?: () => VoiceSample[];
    /**
     * Loader for the catalog. Defaults to the in-code DIRECTORY_CATALOG. Tests
     * inject a smaller list. Production COULD load from `directory_catalog`
     * via dbHttp, but PR1 keeps the in-code list canonical (see file header).
     */
    loadCatalog?: () => ReadonlyArray<DirectoryCatalogEntry>;
    /** LLM model id. Defaults to pickAvailableModel("openai") when unset. */
    model: ModelId;
  },
): Promise<DirectorySubmitterOutput> {
  const { productBrief, directorySlugs } = payload;

  helpers.logEvent({
    level: "info",
    source: "agents.directory-submitter",
    message: "directory_submitter_start",
    requestedDirectories: directorySlugs.length,
    productName: productBrief.name,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  const catalog = meta.loadCatalog ? meta.loadCatalog() : DIRECTORY_CATALOG;
  const catalogBySlug = new Map(catalog.map((d) => [d.slug, d]));

  const voiceSamples = (() => {
    if (meta.loadCorpus) return meta.loadCorpus();
    if (payload.voiceProfile) {
      // Adapt voiceProfile.samples → VoiceSample[]. We treat each user-supplied
      // sample as a "linkedin" channel sample for the system-prompt builder;
      // the builder doesn't read channel for the corpus block beyond labeling.
      return payload.voiceProfile.samples.map((s, i) => ({
        slug: `voice-profile-${i}`,
        channel: "linkedin" as const,
        body: s,
      }));
    }
    return loadVoiceCorpus({ sampleCap: 5 });
  })();

  const prepared: PreparedSubmission[] = [];

  for (const slug of directorySlugs) {
    const entry = catalogBySlug.get(slug) ?? getDirectoryBySlug(slug);
    if (!entry) {
      helpers.logEvent({
        level: "warn",
        source: "agents.directory-submitter",
        message: "directory_submitter_unknown_slug",
        slug,
      });
      continue;
    }
    if (!entry.enabled) {
      helpers.logEvent({
        level: "info",
        source: "agents.directory-submitter",
        message: "directory_submitter_skipping_disabled",
        slug,
      });
      continue;
    }

    // Build payload_json field-by-field.
    const submissionPayload: Record<string, unknown> = {};
    for (const field of entry.fieldSchemaJson.fields) {
      // Plain mapping first — never burns an LLM call when we already know
      // the value from the brief.
      const plain = plainBriefValue(field.key, productBrief);
      if (plain !== undefined && !LLM_FIELD_TYPES.has(field.type)) {
        submissionPayload[field.key] = plain;
        continue;
      }

      // Long/short free-text fields → LLM blurb.
      if (LLM_FIELD_TYPES.has(field.type)) {
        // For some text fields the brief already has a verbatim short answer
        // (e.g. "name" → product name). Prefer the brief value if it fits.
        if (plain !== undefined) {
          const fits = !field.maxLength || plain.length <= field.maxLength;
          if (fits) {
            submissionPayload[field.key] = plain;
            continue;
          }
        }
        const blurb = await generateBlurb({
          brief: productBrief,
          directory: entry,
          field,
          voiceSamples,
          helpers,
          model: meta.model,
        });
        submissionPayload[field.key] = blurb;
        continue;
      }

      // url/email/image_url/date/select with no plain mapping → leave absent
      // (founder fills it in at review time, or the field is `required: false`).
    }

    // Decide initial status. PR1 doesn't actually call APIs or drive a browser,
    // so api + browser_form both stay in `draft` until PR2/PR3. Manual jumps
    // to `needs_manual` immediately so the daily brief surfaces it.
    const initialStatus: "draft" | "needs_manual" =
      entry.automationKind === "manual" ? "needs_manual" : "draft";

    const inserted = await meta.tx
      .insert(directorySubmissions)
      .values({
        tenantId: meta.tenantId,
        agentRunId: meta.agentRunId,
        directorySlug: entry.slug,
        directoryName: entry.name,
        directoryUrl: entry.submissionUrl,
        automationKind: entry.automationKind,
        status: initialStatus,
        payloadJson: submissionPayload,
      })
      .returning({ id: directorySubmissions.id });

    const row = inserted[0];
    if (!row) {
      throw new Error(
        `directory-submitter: insert returned no row for slug "${entry.slug}"`,
      );
    }

    prepared.push({
      id: row.id,
      slug: entry.slug,
      status: initialStatus,
      payload: submissionPayload,
    });

    helpers.logEvent({
      level: "info",
      source: "agents.directory-submitter",
      message: "directory_submitter_directory_prepared",
      slug: entry.slug,
      automationKind: entry.automationKind,
      status: initialStatus,
      fields: Object.keys(submissionPayload).length,
    });
  }

  helpers.logEvent({
    level: "info",
    source: "agents.directory-submitter",
    message: "directory_submitter_complete",
    prepared: prepared.length,
  });

  return {
    runId: meta.agentRunId,
    prepared,
  };
}

// ----- Trigger.dev task ---------------------------------------------------

export const directorySubmitterAgent = defineAgent({
  name: "directory-submitter",
  schema: directorySubmitterPayloadSchema,
  run: async (payload, runCtx) => {
    // Lazy import so cassette-replay tests that import this module don't
    // need OPENAI_API_KEY at import time.
    const { pickAvailableModel } = await import("../llm");
    const model = pickAvailableModel("openai");

    return runDirectorySubmitterAgent(payload, runCtx.helpers, {
      agentRunId: runCtx.agentRunId,
      triggerRunId: runCtx.triggerRunId,
      tenantId: runCtx.tenantId,
      tx: runCtx.tx,
      model,
    });
  },
});
