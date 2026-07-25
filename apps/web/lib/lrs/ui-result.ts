// T4 — UI-facing shape of an lrs_results row as it comes out of tRPC.
//
// The runtime `EvalResult` from `@launchwings/lrs` is the harness contract
// (latencyMs/fixActionMarkdown/evidenceJson all required). Drizzle's selected
// row, however, types those columns as nullable because the schema columns
// are nullable at the DB level. Rather than narrow at every call-site, the UI
// consumes this looser shape and renders defensively.
import type { Severity } from "@/components/lrs/severity-icon";

export type UiEvalResult = {
  evaluatorId: string;
  severity: Severity;
  score: number;
  latencyMs: number | null;
  costUsdMicros: number;
  evidenceJson?: unknown;
  fixActionMarkdown: string | null;
};
