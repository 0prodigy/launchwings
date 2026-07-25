import { z } from "zod";
import { baseAgentPayload, defineAgent, type AgentHelpers } from "../runtime";

// SETUP-04: smallest agent — proves the runtime end-to-end.
// SETUP-05: extended with an optional `tone` switch that exercises the
// llm wrapper. When tone is set we round-trip the LLM (cassette in CI,
// real call in dev with keys); when unset we keep the static greeting so
// the cron + smoke tests stay fast and key-free.
//
// Acceptance (combined SETUP-04 + SETUP-05 surface for this task):
// - helloAgent returns a greeting object regardless of tone presence.
// - When tone="formal" or tone="casual", llm() is invoked and its output
//   becomes the greeting text. Cost is auto-rolled into agent_runs by the
//   runtime's wrapped llm helper.
// - The pure run body is exported as `runHelloAgent` so unit tests can
//   exercise it without Trigger.dev's task harness.

export const helloPayloadSchema = baseAgentPayload.extend({
  name: z.string().min(1).max(100).optional(),
  tone: z.enum(["formal", "casual"]).optional(),
});

export type HelloPayload = z.infer<typeof helloPayloadSchema>;
export type HelloOutput = { greeting: string; ts: string; costUsdMicros: number };

/**
 * Pure run body. Takes `helpers` directly so tests can pass a stub.
 *
 * Why pull this out: defineAgent wraps the body in agent_runs INSERT/UPDATE
 * + RLS scoping, both of which need a live DB. Tests that just want to
 * assert the LLM-formatted greeting shouldn't have to spin up Postgres.
 */
export async function runHelloAgent(
  payload: HelloPayload,
  helpers: AgentHelpers,
  meta: { agentRunId: string; triggerRunId: string; tenantId: string },
): Promise<HelloOutput> {
  const subject = payload.name ?? "world";
  const ts = new Date().toISOString();
  let greeting: string;
  let costUsdMicros = 0;

  if (payload.tone) {
    // Cheap path: Haiku is the right tool for a one-line greeting. The system
    // prompt is short but exists to prove the cache wiring on the wrapper.
    const tone = payload.tone;
    const resp = await helpers.llm({
      model: "anthropic:claude-haiku-4-5",
      system:
        "You generate one-line greetings. Output ONLY the greeting line, no preamble.",
      messages: [
        {
          role: "user",
          content: `Greet "${subject}" in a ${tone} tone. One short line.`,
        },
      ],
      maxOutputTokens: 80,
      temperature: 0.2,
    });
    greeting = resp.text.trim();
    costUsdMicros = resp.costUsdMicros;
  } else {
    greeting = `hello, ${subject}`;
  }

  helpers.logEvent({
    source: "agents.hello",
    level: "info",
    message: "hello_agent_invoked",
    greeting,
    tone: payload.tone ?? null,
    costUsdMicros,
    ts,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  return { greeting, ts, costUsdMicros };
}

export const helloAgent = defineAgent({
  name: "hello-agent",
  schema: helloPayloadSchema,
  run: async (payload, runCtx) => {
    return runHelloAgent(payload, runCtx.helpers, {
      agentRunId: runCtx.agentRunId,
      triggerRunId: runCtx.triggerRunId,
      tenantId: runCtx.tenantId,
    });
  },
});
