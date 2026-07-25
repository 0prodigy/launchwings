import { registerEvaluator, listEvaluators } from "../registry";
import { metaDescriptionEvaluator } from "./meta-description";
import { ogImageEvaluator } from "./og-image";
import { mixedContentEvaluator } from "./mixed-content";
import { faviconEvaluator } from "./favicon-presence";
import { dnsProxyPostureEvaluator } from "./dns-proxy-posture";
import { domainAgeEvaluator } from "./domain-age";
import { heroLlmJudgeEvaluator } from "./hero-llm-judge";
import { criticalPathEnvEvaluator } from "./critical-path-env";
import { analyticsBeaconStaticEvaluator } from "./analytics-beacon-static";
import { buildPlatformEvaluator } from "./build-platform";
import { primaryCtaEvaluator } from "./primary-cta";
import { pricingPageEvaluator } from "./pricing-page";
import { aboutSectionEvaluator } from "./about-section";
import { twitterCardEvaluator } from "./twitter-card";
import { titleLengthEvaluator } from "./title-length";
import { legalLinksEvaluator } from "./legal-links";
import { emailCaptureStaticEvaluator } from "./email-capture-static";

// Stage 1 evaluator self-registration. Importing this module is the only
// public way to populate the registry; subsequent PRs add the remaining
// LLM-judge / multiregion / analytics-beacon evaluators here.
//
// Order matters cosmetically (the registry preserves insertion order), but
// the runner doesn't care — concurrency is the contract.

registerEvaluator(metaDescriptionEvaluator);
registerEvaluator(ogImageEvaluator);
// PR2 additions:
registerEvaluator(mixedContentEvaluator);
registerEvaluator(faviconEvaluator);
registerEvaluator(dnsProxyPostureEvaluator);
registerEvaluator(domainAgeEvaluator);
// PR3 additions:
registerEvaluator(heroLlmJudgeEvaluator);
registerEvaluator(criticalPathEnvEvaluator);
// PR5 addition:
registerEvaluator(analyticsBeaconStaticEvaluator);
// Build-Platform Integration PR1 — Level 1 detection (informational).
registerEvaluator(buildPlatformEvaluator);
// LRC-02 DOM-scan batch:
registerEvaluator(primaryCtaEvaluator);
registerEvaluator(pricingPageEvaluator);
registerEvaluator(aboutSectionEvaluator);
registerEvaluator(twitterCardEvaluator);
registerEvaluator(titleLengthEvaluator);
registerEvaluator(legalLinksEvaluator);
registerEvaluator(emailCaptureStaticEvaluator);

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
  primaryCtaEvaluator,
  pricingPageEvaluator,
  aboutSectionEvaluator,
  twitterCardEvaluator,
  titleLengthEvaluator,
  legalLinksEvaluator,
  emailCaptureStaticEvaluator,
};
export {
  judgePrimaryCtaFromHtml,
  type PrimaryCtaEvidence,
} from "./primary-cta";
export {
  judgePricingPageFromHtml,
  type PricingPageEvidence,
} from "./pricing-page";
export {
  judgeAboutSectionFromHtml,
  type AboutSectionEvidence,
} from "./about-section";
export {
  judgeTwitterCardFromHtml,
  type TwitterCardEvidence,
} from "./twitter-card";
export {
  judgeTitleLengthFromHtml,
  type TitleLengthEvidence,
} from "./title-length";
export {
  judgeLegalLinksFromHtml,
  type LegalLinksEvidence,
} from "./legal-links";
export {
  judgeEmailCaptureFromHtml,
  type EmailCaptureEvidence,
} from "./email-capture-static";
export {
  evaluateBuildPlatform,
  detectedPlatformFixAction,
  BUILD_PLATFORM_EVALUATOR_ID,
  type BuildPlatformEvaluatorEvidence,
} from "./build-platform";
export {
  detectBuildPlatform,
  type BuildPlatformDetection,
  type BuildPlatformDetectionSignal,
  type BuildPlatformDetectInput,
  type BuildPlatformId,
} from "../detect/build-platform";
export {
  evaluateMetaDescriptionFromHtml,
  type MetaDescriptionEvidence,
} from "./meta-description";
export {
  parseOgImageFromHtml,
  probeOgImage,
  type OgImageEvidence,
  type OgImageProbeOptions,
} from "./og-image";
export {
  findMixedContent,
  judgeMixedContent,
  type MixedContentEvidence,
  type MixedContentFinding,
} from "./mixed-content";
export {
  parseFaviconLinks,
  probeIcon,
  type FaviconEvidence,
  type FaviconLinkRef,
  type FaviconProbeOptions,
  type FaviconProbeResult,
} from "./favicon-presence";
export {
  evaluateDnsProxyPosture,
  isCloudflareIp,
  type DnsProbeDeps,
  type DnsProxyEvidence,
  type DnsRecordEvidence,
} from "./dns-proxy-posture";
export {
  evaluateDomainAge,
  judgeDomainAge,
  _unsafeClearDomainAgeCache,
  type DomainAgeEvidence,
  type DomainAgeOptions,
  type WhoisFn,
  type WhoisRecord,
} from "./domain-age";
export {
  parseHeroFromHtml,
  parseHeroScoresFromLlm,
  pickJudgeModel,
  HERO_JUDGE_SYSTEM,
  type HeroJudgeEvidence,
  type HeroScores,
} from "./hero-llm-judge";
export {
  parseDeclaredEndpointsFromHtml,
  probeEndpoint,
  probeWaitlist,
  type CriticalPathEvidence,
  type DeclaredEndpoint,
  type EndpointProbeResult,
  type CriticalPathProbeDeps,
} from "./critical-path-env";
export {
  extractScriptsFromHtml,
  shouldScanScript,
  fetchScriptBody,
  detectProviders,
  detectPlaceholders,
  type AnalyticsBeaconStaticEvidence,
  type AnalyticsBeaconStaticOptions,
  type AnalyticsProvider,
  type ScriptScanResult,
} from "./analytics-beacon-static";

/** The pre-populated registry as an array. Convenience for the runner. */
export function stage1Evaluators() {
  return listEvaluators();
}
