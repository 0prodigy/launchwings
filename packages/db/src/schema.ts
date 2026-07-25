import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Multi-tenant root. Every tenant is the billable unit. A user belongs to
// exactly one active tenant for v1 (PRD §"Out of scope": no multi-org workspaces).
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUq: uniqueIndex("tenants_slug_uq").on(t.slug),
}));

// Clerk owns auth; this is our shadow record. clerk_user_id is the foreign id.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clerkUq: uniqueIndex("users_clerk_user_id_uq").on(t.clerkUserId),
  tenantIdx: index("users_tenant_idx").on(t.tenantId),
}));

// The product the user is launching with LaunchWings. One per tenant for v1.
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url"),
  description: text("description"),
  // ONB-01: URL-importer payload (Firecrawl pages, Browserbase screenshot,
  // extracted fields). Schema-less by design so ONB-04 / ONB-06 can iterate
  // on the shape without another migration.
  metadata: jsonb("metadata").notNull().default({}),
  // ONB-02: founder-supplied brief text (extracted from PDF or pasted MD).
  briefText: text("brief_text"),
  // R2 attachment refs (PDF embedded images). Populated by the R2 follow-up;
  // empty array until then.
  briefAttachments: jsonb("brief_attachments").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("products_tenant_idx").on(t.tenantId),
}));

// Status for an agent run. Mirrors Trigger.dev terminology so the join is cheap
// when SETUP-04 wires the runner.
export const agentRunStatus = pgEnum("agent_run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

// One row per agent invocation. Trigger.dev is the source of truth for the
// runtime; this table is our durable record + observability join target.
export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull(),
  triggerRunId: text("trigger_run_id"),
  status: agentRunStatus("status").notNull().default("pending"),
  inputJson: jsonb("input_json"),
  outputJson: jsonb("output_json"),
  costUsdMicros: integer("cost_usd_micros").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("agent_runs_tenant_idx").on(t.tenantId),
  triggerIdx: uniqueIndex("agent_runs_trigger_run_id_uq").on(t.triggerRunId),
  statusIdx: index("agent_runs_status_idx").on(t.status),
}));

// Append-only audit log. Hashed prev row for tamper-evidence (full Merkle chain
// can land later if we need it; the per-row hash is the cheap defence).
// Per docs/architecture/TRUST_SAFETY.md.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  metadataJson: jsonb("metadata_json"),
  prevHash: text("prev_hash"),
  rowHash: text("row_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("audit_log_tenant_idx").on(t.tenantId),
  actorIdx: index("audit_log_actor_idx").on(t.actorUserId),
  createdAtIdx: index("audit_log_created_at_idx").on(t.createdAt),
}));

// Waitlist table — stand-in for the Resend-only storage tier today. When we
// pass HANDOFF_NEXT_PHASE.md's "50 signups" trigger, the /api/waitlist route
// starts persisting here too.
export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  source: text("source"),
  emailDomain: text("email_domain"),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUq: uniqueIndex("waitlist_email_uq").on(t.email),
  createdAtIdx: index("waitlist_created_at_idx").on(t.createdAt),
}));

// LRC-01 — Launch Readiness Checklist audit harness.
//
// `lrs_runs` is one row per audit invocation (one URL, one tenant, one Trigger.dev
// task run). `lrs_results` is one row per evaluator inside that run. Both are
// tenant-scoped via RLS — see `0002_lrs.sql`.
//
// `summary_json` mirrors the runtime `RunSummary` shape from
// `packages/lrs/src/types.ts`; `evidence_json` is the per-evaluator artefact
// (e.g. `{ description: "...", length: 172 }`) that the founder UI renders.
export const lrsRunStatus = pgEnum("lrs_run_status", [
  "running",
  "completed",
  "failed",
]);

export const lrsResultSeverity = pgEnum("lrs_result_severity", [
  "pass",
  "warn",
  "fail",
]);

export const lrsRuns = pgTable("lrs_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: anonymous /audit demo runs from apps/web have no tenant.
  // RLS policy mirrors audit_log_tenant_scope (`tenant_id IS NULL OR ...`)
  // — see migration 0003_anon_lrs.sql.
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  targetUrl: text("target_url").notNull(),
  status: lrsRunStatus("status").notNull().default("running"),
  summaryJson: jsonb("summary_json"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("lrs_runs_tenant_idx").on(t.tenantId),
  statusIdx: index("lrs_runs_status_idx").on(t.status),
}));

export const lrsResults = pgTable("lrs_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => lrsRuns.id, { onDelete: "cascade" }),
  evaluatorId: text("evaluator_id").notNull(),
  severity: lrsResultSeverity("severity").notNull(),
  score: integer("score").notNull(),
  evidenceJson: jsonb("evidence_json"),
  fixActionMarkdown: text("fix_action_markdown"),
  latencyMs: integer("latency_ms"),
  costUsdMicros: integer("cost_usd_micros").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  runIdx: index("lrs_results_run_idx").on(t.runId),
  evaluatorIdx: index("lrs_results_evaluator_idx").on(t.evaluatorId),
}));

// F2 PR1 — social drafts.
//
// One row per generated draft. Channel-agnostic: the `channel` enum gates which
// per-channel UX rendering / posting agent picks the row up later. PR1 ships
// generation + persistence for X + LinkedIn; the schema accommodates the rest
// so PR2+ can add prompts without another migration.
//
// Tenant-scoped only — unlike lrs_runs we do NOT support anonymous social
// drafts. The /audit anonymous demo path was a deliberate landing-page
// affordance; drafts come from a logged-in founder generating from their
// product brief, so tenantId is non-null and RLS enforces strict isolation.
//
// `body_md` is markdown to allow the founder UI to render emphasis without
// smart-quote substitution mangling links. The agent's system prompt instructs
// the LLM to keep markdown minimal (no headings on tweet bodies) so X
// rendering is a no-op.
//
// `body_char_count` is denormalised: the founder UI sorts by closest-to-limit
// to surface drafts that are already at the channel's hard cap.
//
// `metadata_json` carries per-channel hints — for X: `{ hashtagSuggestions,
// threadIndex }`; for LinkedIn: `{ docStyle: boolean }`. Schema-less by design
// so PR2+ channels can iterate on hint shape without migrations.
export const socialChannel = pgEnum("social_channel", [
  "x",
  "linkedin",
  "reddit",
  "bluesky",
  "threads",
]);

export const socialDraftStatus = pgEnum("social_draft_status", [
  "draft",
  "approved",
  "scheduled",
  "posted",
  "rejected",
]);

// F2 PR2 — Insight Agent daily morning briefs.
//
// One row per (tenant, brief_for) UTC day. Idempotent on that pair so the
// per-tenant fan-out task can re-run without duplicating rows (the cron may
// fire twice in odd ops scenarios — restart, manual replay — and we want the
// second run to UPDATE rather than INSERT).
//
// `kpis_json` is the raw snapshot the LLM reasoned over. We persist it
// alongside the headline + recommendation so a future founder UI can show
// "here's what the agent saw" without re-querying the per-tenant tables (some
// of which would have shifted by the time the founder reads the brief).
//
// `read_at` is set when the founder marks the brief read in the UI. Until F2
// PR3 ships that surface, the column is purely a placeholder; the cron does
// not touch it.
//
// Tenant-scoped only. RLS mirrors `social_drafts_tenant_scope` (strict tenant
// isolation, no null-tenant fallback) since briefs are always for an active
// tenant.
export const insightDailyBriefs = pgTable("insight_daily_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  // Nullable: if the LLM call fails entirely we still upsert a degraded brief
  // before we have an agent run id (defensive — defineAgent guarantees the
  // run id is available, but a future hand-authored entry path shouldn't be
  // forced to fabricate one).
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
  // Date column (no time component). The cron fan-out passes the UTC day this
  // brief covers — kept as date so range queries from the founder UI ("show me
  // last week") are simple SARGable predicates. We pin mode: "string" so the
  // value round-trips as YYYY-MM-DD instead of a JS Date that drifts under
  // local-tz coercion (the agent payload is a UTC date string by spec).
  briefFor: date("brief_for", { mode: "string" }).notNull(),
  headline: text("headline").notNull(),
  recommendationMd: text("recommendation_md").notNull(),
  kpisJson: jsonb("kpis_json").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One brief per tenant per UTC day. The agent task does ON CONFLICT
  // DO UPDATE on this constraint for idempotent re-runs.
  tenantDayUq: uniqueIndex("insight_daily_briefs_tenant_day_uq").on(t.tenantId, t.briefFor),
  tenantIdx: index("insight_daily_briefs_tenant_idx").on(t.tenantId),
  briefForIdx: index("insight_daily_briefs_brief_for_idx").on(t.briefFor),
}));

export const socialDrafts = pgTable("social_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  // Nullable: a draft may be hand-authored later (PR2 founder-UI override) and
  // not be tied to a specific agent run. When the social-draft agent produces
  // a row this is set so observability can join (cost, latency, model).
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
  channel: socialChannel("channel").notNull(),
  bodyMd: text("body_md").notNull(),
  bodyCharCount: integer("body_char_count").notNull(),
  status: socialDraftStatus("status").notNull().default("draft"),
  postedUrl: text("posted_url"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("social_drafts_tenant_idx").on(t.tenantId),
  statusIdx: index("social_drafts_status_idx").on(t.status),
  channelIdx: index("social_drafts_channel_idx").on(t.channel),
  agentRunIdx: index("social_drafts_agent_run_idx").on(t.agentRunId),
}));

// F2 PR1 — directory submitter (orchestration agent #2).
//
// Two tables:
//   - directory_catalog: reference data — the static list of ~30 launch
//     directories LaunchWings supports (Product Hunt, BetaList, Indie Hackers,
//     etc.) plus their automation_kind (api / browser_form / manual) and the
//     field_schema each directory expects. NOT tenant-scoped — every founder
//     sees the same catalog. RLS deliberately disabled. Seeded by
//     `pnpm --filter @launchwings/agents seed-directory-catalog`.
//   - directory_submissions: tenant-scoped — one row per (tenant, directory)
//     pair the founder asked the agent to prepare. The agent fills payload_json
//     with the per-directory body (matching the catalog row's field_schema)
//     and the founder reviews / approves / rejects via the tRPC router.
//
// Status lifecycle:
//   draft  → queued       (founder approved, awaiting agent worker)
//   queued → in_progress  (worker picked it up — PR2/PR3)
//   in_progress → submitted | rejected | needs_manual
//   submitted persists submitted_url + submitted_at; rejected stores reason.
//   needs_manual is the terminal state for `automation_kind = 'manual'`
//   directories: the agent can prepare the copy but a human has to paste it.
//
// PR1 ships generation + draft persistence. Real submissions wait for PR2
// (API directories, e.g. Product Hunt) and PR3 (Browserbase form automation).
export const directoryAutomationKind = pgEnum("directory_automation_kind", [
  "api",
  "browser_form",
  "manual",
]);

export const directorySubmissionStatus = pgEnum("directory_submission_status", [
  "draft",
  "queued",
  "in_progress",
  "submitted",
  "rejected",
  "needs_manual",
]);

export const directoryCatalog = pgTable("directory_catalog", {
  // slug is the natural key — stable across redeploys (e.g. "product-hunt"),
  // joins from directory_submissions.directory_slug for cheap lookups.
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  submissionUrl: text("submission_url").notNull(),
  automationKind: directoryAutomationKind("automation_kind").notNull(),
  category: text("category").notNull(),
  instructionsMd: text("instructions_md"),
  // { fields: Array<{ key, label, type, maxLength?, required }> }. Schema-less
  // by design — different directories ask for wildly different fields, and
  // we need to evolve the shape without a migration each time.
  fieldSchemaJson: jsonb("field_schema_json").notNull(),
  notes: text("notes"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const directorySubmissions = pgTable("directory_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  // Nullable: a submission could be hand-authored later (founder-UI override
  // not tied to an agent run). When the directory-submitter agent produces
  // the row this is set so observability can join cost / latency / model.
  agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
  // Soft FK to directory_catalog.slug. We don't enforce the FK at the DB
  // level so the founder can keep historical submissions even if a directory
  // is removed from the catalog. The agent code DOES validate the slug
  // against the catalog before insert.
  directorySlug: text("directory_slug").notNull(),
  directoryName: text("directory_name").notNull(),
  directoryUrl: text("directory_url").notNull(),
  automationKind: directoryAutomationKind("automation_kind").notNull(),
  status: directorySubmissionStatus("status").notNull().default("draft"),
  // The shape of payload_json must match the directory's field_schema_json
  // at agent-prepare time. The agent re-truncates each free-text field to
  // the catalog's maxLength before insert.
  payloadJson: jsonb("payload_json").notNull(),
  submittedUrl: text("submitted_url"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("directory_submissions_tenant_idx").on(t.tenantId),
  statusIdx: index("directory_submissions_status_idx").on(t.status),
  slugIdx: index("directory_submissions_slug_idx").on(t.directorySlug),
  agentRunIdx: index("directory_submissions_agent_run_idx").on(t.agentRunId),
}));

// Build-Platform Integration PR1 (Level 1 — URL/HTML/header detection +
// tagging). Per docs/architecture/BUILD_PLATFORM_INTEGRATIONS.md: every
// audit run that lands on a build-platform-hosted URL gets tagged so the
// audit can tailor itself AND so partner-outreach has a longitudinal
// dataset of "who builds on what." ADR-0002 reaffirms Level 1 is in v1.
//
// Vocabulary note: the enum is a strict superset of the detection
// vocabulary (`packages/lrs/src/detect/build-platform.ts` covers seven
// platforms; the enum adds tempolabs / softgen / create-xyz so ops can
// hand-tag a row from a future detection rule without a migration).
export const buildPlatformId = pgEnum("build_platform_id", [
  "lovable",
  "bolt",
  "v0",
  "replit",
  "cursor",
  "paperclip",
  "pickaxe",
  "tempolabs",
  "softgen",
  "create-xyz",
]);

// Reference data — the partner directory. NOT tenant-scoped (every founder
// sees the same catalog); RLS deliberately disabled at migration time.
// Seeded by `pnpm --filter @launchwings/agents seed-build-platforms`.
//
// The `id` is the same enum used by detection results so a JOIN at read
// time goes platform → catalog without a cast. `status` enumerates the
// partnership state (per the design doc): 'partner' (signed),
// 'community' (we integrate but no signed partnership), 'planned'
// (in the roadmap, no integration shipped). Default 'planned' so
// adding a new enum value to detection without seeding still produces
// a sane catalog row when the seed script next runs.
export const buildPlatforms = pgTable("build_platforms", {
  id: buildPlatformId("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("planned"),
  homeUrl: text("home_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-product detection history — one row per audit run that produced a
// detection (whether the platform was matched OR null; we record nulls too
// so we can compute "what fraction of audited URLs are on a build platform").
//
// Tenant scope mirrors lrs_runs: nullable tenant_id for anonymous /audit
// demo runs, RLS policy `tenant_id IS NULL OR tenant_id = current_setting(...)`
// — matches the pattern from 0003_anon_lrs.sql.
//
// `confidence` stored as 0..100 integer (the runtime detection emits 0..1;
// the evaluator multiplies by 100 before insert) so we don't carry a float
// column for downstream analytics.
//
// `signals_json` is the full per-signal array from
// `BuildPlatformDetection.signals` so we can audit "why" any past tagging
// decision was made — important for the partner-outreach dataset.
export const productBuildPlatformDetections = pgTable("product_build_platform_detections", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: anonymous /audit demo runs have no tenant. RLS mirrors lrs_runs.
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  productUrl: text("product_url").notNull(),
  platform: buildPlatformId("platform"),
  confidence: integer("confidence").notNull(),
  signalsJson: jsonb("signals_json").notNull(),
  // Soft FK to lrs_runs for join-back to the originating audit. Nullable
  // because a future hand-authored tagging path (ops backfill) won't have
  // an lrs_run to point at.
  lrsRunId: uuid("lrs_run_id").references(() => lrsRuns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("product_build_platform_detections_tenant_idx").on(t.tenantId),
  productUrlIdx: index("product_build_platform_detections_product_url_idx").on(t.productUrl),
  platformIdx: index("product_build_platform_detections_platform_idx").on(t.platform),
}));

// Re-export for migration code + tests.
export const schema = {
  tenants,
  users,
  products,
  agentRuns,
  agentRunStatus,
  auditLog,
  waitlist,
  lrsRuns,
  lrsResults,
  lrsRunStatus,
  lrsResultSeverity,
  socialDrafts,
  socialChannel,
  socialDraftStatus,
  insightDailyBriefs,
  directoryCatalog,
  directorySubmissions,
  directoryAutomationKind,
  directorySubmissionStatus,
  buildPlatformId,
  buildPlatforms,
  productBuildPlatformDetections,
};

// Sentinel SQL for RLS bootstrap. Applied as a separate migration step in
// 0001_rls.sql so the up.sql ordering is: tables → RLS. SETUP-03 layers the
// per-procedure SET LOCAL inside the Hono middleware.
export const rlsBootstrapSql = sql`
  ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE products ENABLE ROW LEVEL SECURITY;
  ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
  ALTER TABLE lrs_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE lrs_results ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_users ON users USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  CREATE POLICY tenant_isolation_products ON products USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  CREATE POLICY tenant_isolation_agent_runs ON agent_runs USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  CREATE POLICY tenant_isolation_audit_log ON audit_log USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  CREATE POLICY tenant_isolation_lrs_runs ON lrs_runs USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  CREATE POLICY tenant_isolation_lrs_results ON lrs_results USING (run_id IN (SELECT id FROM lrs_runs WHERE tenant_id = current_setting('app.tenant_id', true)::uuid));
`;
