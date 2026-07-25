import { z } from "zod";

// Centralised env parsing. Fail fast on boot — never let a missing var manifest
// later as a confusing 500 inside a route handler. Keep the schema tiny here;
// SETUP-04+ adds TRIGGER_SECRET_KEY etc. as those tickets land.
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z
    .string()
    .default("3001")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  // Set in fly.toml [env]; surfaces in /health for deploy verification.
  GIT_SHA: z.string().default("dev"),
  // CORS allowlist. Comma-separated. Empty = same-origin only.
  ALLOWED_ORIGINS: z
    .string()
    .default("https://launchwings.com,https://www.launchwings.com,http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  // Clerk (SETUP-03). Production must have CLERK_SECRET_KEY; dev tolerates absence
  // (we boot in degraded mode and emit a startup warn so curl-style smoke tests
  // and the X-Test-* dev escape hatch still function without a real Clerk app).
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  // CLERK_JWT_KEY enables offline JWT verification (no network roundtrip to Clerk).
  // Optional; without it @clerk/backend falls back to JWKS fetch which is fine for v1.
  CLERK_JWT_KEY: z.string().min(1).optional(),
  // Trigger.dev v3 (SETUP-04). Both optional so the api boots in environments
  // without the agents runtime configured (CI, first-deploy bootstrap). The
  // /trpc/agents.* procedures assert presence and return PRECONDITION_FAILED
  // when unset — clear founder-action message rather than a confusing 500.
  TRIGGER_SECRET_KEY: z.string().min(1).optional(),
  TRIGGER_PROJECT_REF: z.string().min(1).optional(),
  // Observability (SETUP-06). All optional. initOtel/initSentry no-op (with a
  // single-line JSON warn) when their relevant vars are missing — we never
  // crash boot because telemetry isn't configured. See
  // docs/architecture/OBSERVABILITY.md for where to set each.
  SENTRY_DSN: z.string().min(1).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().min(1).optional(),
  AXIOM_TOKEN: z.string().min(1).optional(),
  AXIOM_DATASET: z.string().min(1).optional(),
  // Defaults to GIT_SHA when unset; override only if you ship synthetic
  // versioned releases (e.g. "1.4.2-rc.3") instead of commit-SHA releases.
  SERVICE_VERSION: z.string().min(1).optional(),
  // LLM provider keys (SETUP-05). Both optional; production should have at
  // least one. Cassette replay covers tests. The `llm()` wrapper throws a
  // typed LLMConfigError on first call when the key for the requested
  // provider is unset.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // ONB-01: URL importer (Firecrawl crawl + Browserbase screenshot). All
  // optional so api still boots without them; the products.import mutation
  // throws PRECONDITION_FAILED when any is unset (mirrors insightRouter's
  // ensureRuntimeConfigured pattern).
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  BROWSERBASE_API_KEY: z.string().min(1).optional(),
  BROWSERBASE_PROJECT_ID: z.string().min(1).optional(),
});

const parsed = baseSchema.parse(process.env);

// Production normally hard-requires CLERK_SECRET_KEY. During first-deploy
// bootstrap (Vercel project freshly created, Clerk app not yet provisioned),
// set LAUNCHWINGS_ALLOW_DEGRADED_AUTH=1 in the project env to allow the api
// to boot without Clerk. Auth-protected tRPC procedures will reject requests
// in this mode; only public surfaces (/health, /ready, anonymous LRS audit
// flows) remain functional. Remove the flag once Clerk is wired.
if (parsed.NODE_ENV === "production" && !parsed.CLERK_SECRET_KEY) {
  if (process.env.LAUNCHWINGS_ALLOW_DEGRADED_AUTH !== "1") {
    throw new Error(
      "@launchwings/api env: CLERK_SECRET_KEY is required in production (NODE_ENV=production). " +
        "Set CLERK_SECRET_KEY on the dot-api Vercel project, OR set " +
        "LAUNCHWINGS_ALLOW_DEGRADED_AUTH=1 to bootstrap without Clerk (auth procs will 401).",
    );
  }
  console.warn(
    JSON.stringify({
      level: "warn",
      source: "boot",
      message:
        "CLERK_SECRET_KEY missing in production but LAUNCHWINGS_ALLOW_DEGRADED_AUTH=1 — booting in degraded auth mode. Auth-protected tRPC procedures will reject all requests until Clerk is configured.",
    }),
  );
}

if (parsed.NODE_ENV !== "production" && !parsed.CLERK_SECRET_KEY) {
  // Single-line JSON so Axiom (SETUP-06) ingests it cleanly. Use console.warn so
  // it surfaces above info-level boot logs in local dev.
  console.warn(
    JSON.stringify({
      level: "warn",
      source: "boot",
      message:
        "CLERK_SECRET_KEY not set — Clerk middleware runs in degraded mode (X-Test-* headers only).",
    }),
  );
}

// SETUP-05: warn (don't throw) when both LLM keys are unset. We tolerate this
// in dev / CI where cassette replay covers the test path, but production should
// always have at least one. If you're running production without an LLM key
// you've turned every agent that calls llm() into a 500 — this warning is the
// last chance to notice before a request fails in flight.
if (!parsed.ANTHROPIC_API_KEY && !parsed.OPENAI_API_KEY) {
  if (parsed.NODE_ENV === "production") {
    console.warn(
      JSON.stringify({
        level: "warn",
        source: "boot",
        message:
          "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set in production — llm()-dependent agents will fail with LLMConfigError on first call.",
      }),
    );
  } else {
    console.warn(
      JSON.stringify({
        level: "info",
        source: "boot",
        message:
          "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set — llm() will throw on real calls. Cassette replay still works for tests.",
      }),
    );
  }
}

export const env = parsed;
export type Env = typeof env;
