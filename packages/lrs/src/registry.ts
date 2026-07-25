import type { Evaluator } from "./types";

// Typed registry of evaluator IDs → Evaluator instances.
//
// Stage 1 evaluators are statically registered at module load (see
// `./evaluators/index.ts`). The registry is intentionally mutable — PR2/PR3
// will register the remaining 9 dogfood-LRS evaluators against the same
// instance — but reads should go through the helpers below to keep the
// surface narrow.
//
// We keep this its own module (vs co-locating in evaluators/index.ts) so
// callers that want only the registry (e.g. apps/api admin route to list
// known evaluators) can import without pulling cheerio in.

const _registry = new Map<string, Evaluator>();

export function registerEvaluator(evaluator: Evaluator): void {
  if (_registry.has(evaluator.id)) {
    throw new Error(
      `lrs registry: duplicate evaluator id "${evaluator.id}". This is a programming error — evaluator ids must be globally unique.`,
    );
  }
  _registry.set(evaluator.id, evaluator);
}

export function getEvaluator(id: string): Evaluator | undefined {
  return _registry.get(id);
}

export function listEvaluators(): Evaluator[] {
  return Array.from(_registry.values());
}

/** Test-only helper: drop a registration. Production code never calls this. */
export function _unsafeUnregisterEvaluator(id: string): void {
  _registry.delete(id);
}

/** Test-only helper: clear the registry entirely. */
export function _unsafeClearRegistry(): void {
  _registry.clear();
}
