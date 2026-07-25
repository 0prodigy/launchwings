// Boot-time smoke test. Verifies the package's public surface exists without
// invoking trigger.dev (which would need TRIGGER_SECRET_KEY at runtime, not at
// boot — task() registers locally and trigger() is the network hop).
//
// Run via: pnpm --filter @launchwings/agents exec tsx scripts/smoke.ts
//
// Mirrors the SETUP-04 validation gate: import helloAgent and assert shape,
// even without TRIGGER_SECRET_KEY set. The structured-log line below is what
// the gate checks for.

import {
  auditTarget,
  helloAgent,
  dailyMorningBrief,
  defineAgent,
  baseAgentPayload,
  generateHeroImage,
} from "../src/index";

const checks = {
  helloAgent_exists: typeof helloAgent === "object" && helloAgent !== null,
  helloAgent_has_id: helloAgent.id === "hello-agent",
  helloAgent_has_trigger: typeof helloAgent.trigger === "function",
  helloAgent_has_triggerAndWait: typeof helloAgent.triggerAndWait === "function",
  dailyMorningBrief_exists: typeof dailyMorningBrief === "object" && dailyMorningBrief !== null,
  dailyMorningBrief_id: dailyMorningBrief.id === "daily-morning-brief",
  // LRC-01 PR1: auditTarget task is wired and exported.
  auditTarget_exists: typeof auditTarget === "object" && auditTarget !== null,
  auditTarget_has_id: auditTarget.id === "audit-target",
  auditTarget_has_trigger: typeof auditTarget.trigger === "function",
  // designer: generateHeroImage Trigger task is registered.
  generateHeroImage_exists:
    typeof generateHeroImage === "object" && generateHeroImage !== null,
  generateHeroImage_has_id: generateHeroImage.id === "designer-generate-hero-image",
  generateHeroImage_has_trigger: typeof generateHeroImage.trigger === "function",
  defineAgent_exists: typeof defineAgent === "function",
  baseAgentPayload_isZod: baseAgentPayload != null && typeof baseAgentPayload.parse === "function",
};
console.log(JSON.stringify({ source: "agents.smoke", level: "info", checks }));
const allGood = Object.values(checks).every(Boolean);
if (!allGood) {
  console.error(JSON.stringify({ source: "agents.smoke", level: "error", message: "SMOKE FAIL" }));
  process.exit(1);
}
console.log(
  JSON.stringify({
    source: "agents.smoke",
    level: "info",
    message: "all assertions passed",
    triggerSecretKeyConfigured: Boolean(process.env.TRIGGER_SECRET_KEY),
  }),
);
