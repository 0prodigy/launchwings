import type { NextConfig } from "next";

// Where requests to /api/* on the web origin are proxied to. Set as an env var
// on the apps/web Vercel project (NOT NEXT_PUBLIC_* — server-side only) to the
// production alias of the apps/api Vercel project, e.g. https://dot-api.vercel.app
// or a custom domain. Default falls back to the most likely Vercel alias for
// our project name; if the actual alias differs, set INTERNAL_API_URL on the
// web project and redeploy.
const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? "https://dot-api.vercel.app";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages export raw TS — Next's bundler must transpile them.
  // Add new @launchwings/* packages here as they get consumed by web.
  transpilePackages: ["@launchwings/observability", "@launchwings/lrs", "@launchwings/db"],
  // Same-origin proxy for tRPC traffic: browser hits /trpc/* on the web origin,
  // Next forwards edge-side to the apps/api project. No CORS, no second domain
  // to own, no api URL leaked into client bundles. The api's own vercel.json
  // rewrites /(.*) → /api so the Hono Function receives the original path
  // (/trpc/foo) and routes by its own tRPC mount.
  //
  // Why /trpc and not /api: apps/web/app/api/* hosts Next Route Handlers
  // (audit, waitlist) that must continue to be served by Next itself.
  // Operational endpoints on the api (/health, /ready) are reached directly
  // on the api's Vercel alias by ops/smoke tests, not via the web origin.
  async rewrites() {
    return [
      {
        source: "/trpc/:path*",
        destination: `${INTERNAL_API_URL}/trpc/:path*`,
      },
    ];
  },
  // OTel's Node SDK pulls in grpc/zlib/etc. — runtime-only. Mark the SDK and
  // its transitive Node-only friends as external so webpack does not try to
  // bundle them; Next loads them via Node require at runtime in the nodejs
  // runtime (and our instrumentation.ts is gated on NEXT_RUNTIME==='nodejs').
  serverExternalPackages: [
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/exporter-trace-otlp-http",
    "@sentry/node",
    "@grpc/grpc-js",
    "import-in-the-middle",
    "require-in-the-middle",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

// Wrap with Sentry only when a DSN is set. `withSentryConfig` injects
// source-map upload + tunnel routes; without a configured project these are
// dead weight and the upload step prints noisy warnings on every build.
// Local dev + unconfigured previews keep the plain config.
async function buildConfig(): Promise<NextConfig> {
  if (!process.env.SENTRY_DSN) return nextConfig;
  try {
    const { withSentryConfig } = await import("@sentry/nextjs");
    return withSentryConfig(nextConfig, {
      // Source-map upload requires SENTRY_AUTH_TOKEN + org/project slugs;
      // founder fills these in (see docs/architecture/OBSERVABILITY.md).
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      // Strip uploaded source maps from the public build output so we don't
      // ship them to end users; they go to Sentry only.
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      disableLogger: true,
    });
  } catch {
    // Sentry package missing or misconfigured — fall back to the plain config
    // rather than crashing the build.
    return nextConfig;
  }
}

export default buildConfig();
