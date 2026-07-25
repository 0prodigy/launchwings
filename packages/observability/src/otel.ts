// OpenTelemetry initializer. Boots the Node SDK with auto-instrumentations and
// an OTLP HTTP trace exporter pointed at whatever endpoint the env supplies
// (Axiom in production; otherwise no-op). This file MUST be imported before
// anything that creates HTTP clients / pg pools / etc., otherwise the auto
// instrumentations miss them — call sites enforce this via their own
// `instrumentation.ts` entry points.
//
// Bail-graceful contract: if the relevant env vars are absent we log a single
// warn line and return. Boot must never crash because telemetry is unconfigured.

import { logEvent } from "./log";
import type { ObservabilityEnv } from "./env";

export type InitOtelOptions = {
  serviceName: string;
  serviceVersion?: string;
  // Allow callers to thread their own env (Next runtime, edge, etc.). Defaults
  // to process.env which covers Node + Next server.
  env?: ObservabilityEnv;
};

let _started = false;

export async function initOtel(options: InitOtelOptions): Promise<void> {
  if (_started) return;
  const env = options.env ?? (process.env as ObservabilityEnv);

  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const headersRaw = env.OTEL_EXPORTER_OTLP_HEADERS;
  const axiomToken = env.AXIOM_TOKEN;
  const axiomDataset = env.AXIOM_DATASET;

  // Accept either OTEL_* (lift-and-shift from any OTLP backend) or AXIOM_*
  // (split form for founders who only have Axiom credentials handy). Either is
  // sufficient on its own. If we have neither, no-op.
  const haveOtel = Boolean(endpoint);
  const haveAxiom = Boolean(axiomToken && axiomDataset);
  if (!haveOtel && !haveAxiom) {
    logEvent({
      level: "warn",
      source: "observability.otel",
      message:
        "OTel disabled — set OTEL_EXPORTER_OTLP_ENDPOINT (+ OTEL_EXPORTER_OTLP_HEADERS) or AXIOM_TOKEN+AXIOM_DATASET to enable.",
      service: options.serviceName,
    });
    return;
  }

  try {
    // Dynamic import so packages that never enable OTel never pay the SDK cost
    // (and so Next's edge runtime build doesn't trip on the Node-only SDK).
    // The `webpackIgnore` magic comments stop Next/webpack from following the
    // import chain at build time — we want this resolved at Node runtime only.
    const { NodeSDK } = await import(
      /* webpackIgnore: true */ "@opentelemetry/sdk-node"
    );
    const { OTLPTraceExporter } = await import(
      /* webpackIgnore: true */ "@opentelemetry/exporter-trace-otlp-http"
    );
    const { getNodeAutoInstrumentations } = await import(
      /* webpackIgnore: true */ "@opentelemetry/auto-instrumentations-node"
    );

    const exporterEndpoint =
      endpoint ?? "https://api.axiom.co/v1/traces"; // Axiom default OTLP HTTP path
    const headers = parseHeaders(headersRaw, axiomToken, axiomDataset);

    const sdk = new NodeSDK({
      serviceName: options.serviceName,
      traceExporter: new OTLPTraceExporter({
        url: exporterEndpoint,
        headers,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    // NodeSDK.start() is sync in current sdk-node releases; keep awaitable to
    // tolerate future signature changes.
    await Promise.resolve(sdk.start());
    _started = true;

    logEvent({
      level: "info",
      source: "observability.otel",
      message: "OTel initialized",
      service: options.serviceName,
      endpoint: exporterEndpoint,
    });

    // Best-effort flush on shutdown so traces aren't dropped on SIGTERM.
    const shutdown = async () => {
      try {
        await sdk.shutdown();
      } catch (err) {
        logEvent({
          level: "warn",
          source: "observability.otel",
          message: "OTel shutdown failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  } catch (err) {
    // Telemetry init must never crash boot.
    logEvent({
      level: "warn",
      source: "observability.otel",
      message: "OTel init failed; continuing without traces",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function parseHeaders(
  raw: string | undefined,
  axiomToken: string | undefined,
  axiomDataset: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw) {
    // Standard OTEL_EXPORTER_OTLP_HEADERS format: key1=value1,key2=value2
    for (const pair of raw.split(",")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k) out[k] = v;
    }
  }
  if (axiomToken && !out["Authorization"]) {
    out["Authorization"] = `Bearer ${axiomToken}`;
  }
  if (axiomDataset && !out["X-Axiom-Dataset"]) {
    out["X-Axiom-Dataset"] = axiomDataset;
  }
  return out;
}

export function isOtelStarted(): boolean {
  return _started;
}
