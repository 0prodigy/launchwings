// Public surface of @launchwings/agents.
//
// Importers split by purpose:
// - apps/api (server, invokes agents): imports the task handles and calls
//   `helloAgent.trigger({...})`. Trigger.dev's SDK uses the import only for
//   typing — actual dispatch hits the trigger.dev API over HTTP.
// - packages/agents (worker): trigger.dev CLI walks ./src and registers every
//   exported task with the v3 runtime; no manual registry needed.
//
// We re-export from the explicit subpaths (./tasks, ./crons) so consumers can
// also import them via @launchwings/agents/tasks and /crons.

export {
  defineAgent,
  baseAgentPayload,
  type BaseAgentPayload,
  type AgentRunContext,
  type AgentHelpers,
  type DefineAgentParams,
} from "./runtime";

export {
  llm,
  pickAvailableModel,
  pickStrongModel,
  computeCostUsdMicros,
  LLMConfigError,
  LLMProviderError,
  type LLMRequest,
  type LLMResponse,
  type LLMMessage,
  type LLMRole,
  type ModelId,
} from "./llm";

export {
  withCassette,
  getCassetteMode,
  hashMessages,
  CASSETTE_ROOT,
  type CassetteMode,
} from "./cassettes";

export { helloAgent, runHelloAgent, helloPayloadSchema } from "./tasks/hello";
export type { HelloPayload, HelloOutput } from "./tasks/hello";
export { auditTarget, auditTargetPayloadSchema } from "./tasks/audit-target";
export type { AuditTargetPayload, AuditTargetOutput } from "./tasks/audit-target";
export {
  generateHeroImage,
  runDesignerAgent,
  designerPayloadSchema,
  buildPollinationsUrl,
} from "./tasks/designer";
export type { DesignerPayload, DesignerOutput } from "./tasks/designer";
export {
  socialDraftAgent,
  runSocialDraftAgent,
  socialDraftPayloadSchema,
  socialDraftOutputSchema,
} from "./tasks/social-draft";
export type {
  SocialDraftPayload,
  SocialDraftOutput,
  SocialDraftLLMOutput,
  ProductBrief,
  PersistedDraft,
} from "./tasks/social-draft";
export {
  directorySubmitterAgent,
  runDirectorySubmitterAgent,
  directorySubmitterPayloadSchema,
} from "./tasks/directory-submitter";
export type {
  DirectorySubmitterPayload,
  DirectorySubmitterOutput,
  DirectoryProductBrief,
  PreparedSubmission,
} from "./tasks/directory-submitter";
export {
  DIRECTORY_CATALOG,
  getDirectoryBySlug,
  listDirectorySlugs,
  listEnabledDirectories,
  type DirectoryCatalogEntry,
  type DirectoryFieldSpec,
  type DirectoryAutomationKind,
  type DirectoryCategory,
} from "./directories";
export {
  loadVoiceCorpus,
  parseVoiceFile,
  resolveCorpusDir,
  buildSocialDraftSystemPrompt,
  CHANNEL_LIMITS,
  FORBIDDEN_PHRASES,
  type VoiceSample,
  type SocialChannelLiteral,
} from "./voice";
export {
  insightDailyBrief,
  runInsightAgent,
  gatherKpis,
  buildInsightUserMessage,
  buildDegradedBrief,
  insightPayloadSchema,
  insightLlmOutputSchema,
  INSIGHT_SYSTEM_PROMPT,
} from "./tasks/insight";
export type {
  InsightPayload,
  InsightOutput,
  InsightLlmOutput,
  KpiSnapshot,
} from "./tasks/insight";
export { dailyMorningBrief } from "./crons/daily-morning-brief";
export { dailyAuditRerun } from "./crons/daily-audit-rerun";

// ONB-04 — Discovery Agent.
export {
  discoveryAgent,
  runDiscoveryAgent,
  buildDiscoveryUserMessage,
  buildDegradedDiscoveryOutput,
  discoveryPayloadSchema,
  discoveryOutputSchema,
  DISCOVERY_SYSTEM_PROMPT,
  DISCOVERY_COST_CAP_USD_MICROS,
} from "./tasks/discovery";
export type {
  DiscoveryPayload,
  DiscoveryOutput,
  DiscoveryAgentOutput,
  DiscoveryProductInput,
} from "./tasks/discovery";

// ONB-05 — Positioning Agent.
export {
  positioningAgent,
  runPositioningAgent,
  buildPositioningUserMessage,
  buildDegradedPositioningOutput,
  scoreTaglineUnder12,
  positioningPayloadSchema,
  positioningOutputSchema,
  POSITIONING_SYSTEM_PROMPT,
  POSITIONING_COST_CAP_USD_MICROS,
  PositioningInputError,
} from "./tasks/positioning";
export type {
  PositioningPayload,
  PositioningOutput,
  PositioningAgentOutput,
  PositioningProductInput,
  TaglineJudgeScore,
} from "./tasks/positioning";

// ONB-01 (migration) — URL importer Trigger.dev task. Replaces the synchronous
// path inside the products.import tRPC mutation; that mutation is now a thin
// dispatcher that triggers this task with an idempotency key.
export {
  importProductTask,
  importProductPayloadSchema,
  mergeProductMetadata,
} from "./tasks/import-product";
export type {
  ImportProductPayload,
  ImportProductOutput,
} from "./tasks/import-product";

// ONB-01 — URL importer building blocks. Re-exported so @launchwings/trpc
// can import them by package name (Node ESM strict, no relative cross-pkg
// paths). The clients are thin REST wrappers; the extractors are pure.
export {
  crawlSite,
  FirecrawlError,
  type FirecrawlPage,
  type FirecrawlCrawlResult,
  type FirecrawlErrorKind,
} from "./clients/firecrawl";
export {
  screenshotHomepage,
  BrowserbaseError,
  type BrowserbaseScreenshot,
  type BrowserbaseErrorKind,
} from "./clients/browserbase";
export {
  extractTitle,
  extractMetaDescription,
  extractHeroHeadline,
  extractPrimaryCta,
  extractFrameworkHints,
} from "./extractors";

// ONB-02 — PDF text extractor.
export {
  extractPdfText,
  PdfParseError,
  MAX_PDF_BYTES,
  type PdfExtractResult,
  type PdfParseErrorKind,
} from "./extractors";
