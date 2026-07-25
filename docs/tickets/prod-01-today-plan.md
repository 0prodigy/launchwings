# PROD-01 — Today's Plan (F1)

*Status: P0. The product. Sequencing: Phase 0 manual prototype (Wk 1–2) → AI-drafted (Wk 3–6).*

## Why this exists

`docs/product/PRD.md` F1. The product is one screen with three ranked next-actions, drafted and ready to approve, that move the founder toward the next paying customer. Read → decide → act.

## What it is

Every morning at 8am partner-local, three actions delivered to (a) the web "Today" surface, (b) an email digest via Resend, (c) `lw today` over CLI when the founder has installed it (depends on PLUG-01).

Each action carries: copy/payload, target channel, scheduled time, cohort answer (`n` + confidence) or `INSUFFICIENT_COHORT`, expected `paying_customers_delta`, estimated execution time. One-click approve dispatches through the safety pipeline (SAFE-01).

## Inputs

- **Build context** — GitHub OAuth read: README, recent commits, package.json, screenshot of landing page.
- **Public state** — X / Reddit / LinkedIn / ProductHunt OAuth read scopes. Hourly poll.
- **Signal surface** — Stripe / Polar / Lemon Squeezy customer-event webhooks, Resend / Beehiiv subscribe events, Plausible / PostHog conversion funnel.
- **Cohort answer** — `tRPC cohort.benchmark` from WHSE-01 (returns `INSUFFICIENT_COHORT` below k+l thresholds).

## Ranker

Score = `expected_paying_customers_delta × probability_user_executes_in_next_30_min`. Initial implementation: hand-tuned weighted linear model. Cohort signal carries explicit weight and is shown to the user. Time-decay applied to opportunity age.

Evaluation set: Phase-0 founder hand-rankings on real partner-day inputs. Acceptance: AI ranker reproduces ≥70% of hand-ranking on the eval set by end of Wk 6.

## Acceptance criteria

1. By 8:00am partner-local on every weekday, three ranked actions exist in `today_plan` table for every active design partner. ≥99.5% on-time delivery rolling 14d.
2. Each action row has `(copy, channel, scheduled_time, cohort_answer | null, expected_pc_delta, est_minutes, status)`.
3. Approve / decline / edit feedback writes to `today_plan_event` and influences subsequent rankings within 24h.
4. Each rendered action shows the cohort answer (`"n=47, p<0.05"`) or `INSUFFICIENT_COHORT` — no hidden confidence claims.
5. Web "Today" surface shows the three actions in a single card-list with one Approve button per action; total UI weight under 100KB JS.
6. Email digest matches the web surface 1:1.

## Tech

- `apps/api/src/today-plan.ts` — Hono routes + tRPC procs (`today.list`, `today.approve`, `today.decline`, `today.edit`).
- `packages/agents/src/tasks/today-plan-builder.ts` — Trigger.dev task scheduled at 7:55am partner-local timezone. Fans out per active partner.
- Drizzle: `today_plan`, `today_plan_event`, `partner_timezone`.
- Resend: digest template `today-plan-digest`.
- `apps/web/app/(dashboard)/today/page.tsx` — server component reading `today.list`.

## Out of scope

- The CLI surface (PLUG-01).
- The MCP / skill surfaces (PLUG-02, PLUG-03).
- Multi-launch concurrent operation (one launch per partner in v1).

## Dependencies

- ONB-04 GitHub repo connect (read-only).
- CN-06/07/08 OAuth connectors (X, LinkedIn, Reddit). PROD-01 ships in AI-drafted mode without all three (X-only is enough to start) but quality improves with each.
- WHSE-01 cohort warehouse — required for the cohort answer surface. Until WHSE-01 lands, `today.list` returns `INSUFFICIENT_COHORT` on every action's cohort field.
- SAFE-01 safety pipeline for the approve→dispatch path.

## Tests + observability

- Unit: ranker score function on golden eval set.
- Integration: end-to-end 8am-cron → 3 rows in `today_plan` → email delivered.
- Langfuse trace on every ranker invocation with the candidate set and final pick.
- Sentry alarm on missed-cron-fire.

## Owner hand-off

When green, hand to PROD-02 (Inbox Triage) for the next ranking surface and to PLUG-01 (CLI) for the terminal surface.
