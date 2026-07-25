# LRC-01 — Audit Agent harness (closeout)

> Spec: `docs/tickets/SPRINT_02.md` § LRC-01.

## Status

Most of the harness already shipped under SETUP-01 / build-platform PR1:
- `Evaluator` interface in `packages/lrs/src/types.ts` (id, stage, weight,
  evaluate(target, ctx)).
- `runEvaluators` parallel runner with 8-way concurrency, retry-once on
  `RetryableError`, swallow-and-record on other throws, persistence via
  `withTenant`.
- `auditTarget` Trigger.dev task that wraps the runner.

## Closed in this commit

- **60s wall-clock budget** on the runner. Any evaluator still in-flight
  when the deadline hits is recorded as a `severity: "fail"` row with
  `evidenceJson.error = "harness_timeout"` so the founder UI surfaces
  WHICH evaluator stalled. Configurable via `RunnerOptions.budgetMs`;
  set to 0 to disable. 2 new tests cover the timeout + disabled paths.
- **Daily bulk re-run cron** `dailyAuditRerun` at 07:00 UTC. Fans out to
  every product where `metadata.discovery` is populated AND `url IS NOT
  NULL`. Fire-and-forget per tenant.

## Still deferred

- Per-evaluator "last checked" tRPC query — folded into LRC-03 (UI
  ticket) since the founder dashboard is the only consumer.
- Re-run-on-demand UI button — also LRC-03.

## Founder follow-ups

- Confirm `dailyAuditRerun` registers in Trigger.dev once the next
  worker deploy lands. Verify the cron shows up alongside
  `daily-morning-brief` in the Trigger.dev dashboard.
