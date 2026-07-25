// Public surface of @launchwings/lrs.
//
// Importers split by purpose:
// - apps/api / packages/agents (server, runs the audit): import `runEvaluators`
//   + `stage1Evaluators` and trigger via the auditTarget Trigger.dev task.
// - apps/web (display): currently does not import this package; LRC-01 PR3
//   adds a results-rendering UI that imports the types only.
// - tests: import the pure evaluator helpers (`evaluateMetaDescriptionFromHtml`,
//   `parseOgImageFromHtml`) so they can run without a DB or network.

export type {
  AuditTarget,
  AuditContext,
  Evaluator,
  EvalResult,
  LlmFn,
  RunSummary,
  Severity,
} from "./types";
export { RetryableError } from "./types";

export { runEvaluators, type RunnerOptions, type RunResult } from "./runner";

export {
  registerEvaluator,
  getEvaluator,
  listEvaluators,
} from "./registry";

export {
  metaDescriptionEvaluator,
  ogImageEvaluator,
  mixedContentEvaluator,
  faviconEvaluator,
  dnsProxyPostureEvaluator,
  domainAgeEvaluator,
  heroLlmJudgeEvaluator,
  criticalPathEnvEvaluator,
  analyticsBeaconStaticEvaluator,
  buildPlatformEvaluator,
  evaluateBuildPlatform,
  detectedPlatformFixAction,
  BUILD_PLATFORM_EVALUATOR_ID,
  detectBuildPlatform,
  evaluateMetaDescriptionFromHtml,
  parseOgImageFromHtml,
  probeOgImage,
  findMixedContent,
  judgeMixedContent,
  parseFaviconLinks,
  probeIcon,
  evaluateDnsProxyPosture,
  isCloudflareIp,
  evaluateDomainAge,
  judgeDomainAge,
  parseHeroFromHtml,
  parseHeroScoresFromLlm,
  pickJudgeModel,
  HERO_JUDGE_SYSTEM,
  parseDeclaredEndpointsFromHtml,
  probeEndpoint,
  probeWaitlist,
  extractScriptsFromHtml,
  shouldScanScript,
  fetchScriptBody,
  detectProviders,
  detectPlaceholders,
  stage1Evaluators,
  type MetaDescriptionEvidence,
  type OgImageEvidence,
  type OgImageProbeOptions,
  type MixedContentEvidence,
  type MixedContentFinding,
  type FaviconEvidence,
  type FaviconLinkRef,
  type FaviconProbeOptions,
  type FaviconProbeResult,
  type DnsProbeDeps,
  type DnsProxyEvidence,
  type DnsRecordEvidence,
  type DomainAgeEvidence,
  type DomainAgeOptions,
  type WhoisFn,
  type WhoisRecord,
  type HeroJudgeEvidence,
  type HeroScores,
  type CriticalPathEvidence,
  type DeclaredEndpoint,
  type EndpointProbeResult,
  type CriticalPathProbeDeps,
  type AnalyticsBeaconStaticEvidence,
  type AnalyticsBeaconStaticOptions,
  type AnalyticsProvider,
  type ScriptScanResult,
  type BuildPlatformEvaluatorEvidence,
  type BuildPlatformDetection,
  type BuildPlatformDetectionSignal,
  type BuildPlatformDetectInput,
  type BuildPlatformId,
} from "./evaluators";
