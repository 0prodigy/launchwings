// LRC-04 — PostHog snippet generator.
//
// Pure function. Caller validates `projectKey` against /^phc_[A-Za-z0-9]{20,}$/
// before invoking. We re-validate here as a defence-in-depth check; the snippet
// interpolates the key directly into a <script> string and a malformed key
// could otherwise break the rendered HTML.
//
// Snippet shape mirrors the official PostHog JS install instructions:
// https://posthog.com/docs/libraries/js — the array-based deferred loader so a
// founder can paste a single block into <head>.

export type PosthogHost = "us" | "eu";

export interface PosthogSnippetInputs {
  projectKey: string;
  host: PosthogHost;
}

export interface PosthogSnippetArtifact {
  snippet: string;
}

const KEY_RE = /^phc_[A-Za-z0-9]{20,}$/;

function apiHost(host: PosthogHost): string {
  return host === "eu"
    ? "https://eu.i.posthog.com"
    : "https://us.i.posthog.com";
}

export function renderPosthogSnippet(
  inputs: PosthogSnippetInputs,
): PosthogSnippetArtifact {
  if (!KEY_RE.test(inputs.projectKey)) {
    throw new Error(
      `posthog projectKey must match /^phc_[A-Za-z0-9]{20,}$/ (got ${inputs.projectKey.slice(0, 8)}...)`,
    );
  }
  const api = apiHost(inputs.host);

  // Standard PostHog deferred-loader snippet. The init args use single-quoted
  // string literals so the regex-validated `projectKey` and our hard-coded
  // `api` URL render unambiguously inside the array form.
  const snippet = [
    `<!-- PostHog -->`,
    `<script>`,
    `  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);`,
    `  posthog.init('${inputs.projectKey}', { api_host: '${api}' });`,
    `</script>`,
    `<!-- /PostHog -->`,
  ].join("\n");

  return { snippet };
}
