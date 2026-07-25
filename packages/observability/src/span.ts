// Thin wrapper around OTel's `startActiveSpan` so call sites stay uniform
// regardless of whether OTel is initialized. When OTel isn't started we just
// run the function — no try/catch overhead, no zombie spans.

import { trace, SpanStatusCode } from "@opentelemetry/api";
import { isOtelStarted } from "./otel";

export type SpanAttributes = Record<string, string | number | boolean>;

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  attributes?: SpanAttributes,
): Promise<T> {
  if (!isOtelStarted()) {
    return await fn();
  }
  const tracer = trace.getTracer("@launchwings/observability");
  return await tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        for (const [k, v] of Object.entries(attributes)) {
          span.setAttribute(k, v);
        }
      }
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
