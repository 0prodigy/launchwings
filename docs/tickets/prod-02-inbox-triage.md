# PROD-02 — Inbox Triage (F2)

*Status: P0. Sequencing: Phase 2 (Wk 7–10).*

## Why this exists

`docs/product/PRD.md` F2. F1 answers "what should I start." F2 answers "what's blowing up that needs me now." Surfaces the single inbound conversation worth 30 minutes right now, with a response drafted.

## What it is

Reads inbound traffic from X / Reddit / LinkedIn / ProductHunt / Discord OAuth (replies, mentions, comments, DMs not addressed to a thread the user started). Classifies each by ICP-fit (grounded in the build context model from PROD-01) and urgency (post-age, upvote velocity, channel-specific decay). Surfaces **one** conversation worth 30 min right now, with a response drafted in the user's voice via RAG over their public surface.

Not a queue — one surfaced conversation at a time. When the user approves or declines, the next one surfaces.

## Acceptance criteria

1. Inbound from each connected channel ingested within 10 min of source-event timestamp.
2. Per-day surfaced count ≤ 4 per partner (avoid notification fatigue).
3. ICP-fit classifier shows the signature ratio (0.0–1.0) on every surface; classifier accuracy ≥ 75% on a held-out eval set of 200 reply / comment samples.
4. Response draft generated within 10s of surface. Draft voice-fidelity score ≥ 85% on the partner's RAG corpus.
5. Send via SAFE-01 safety pipeline; one Approve button per surface.

## Tech

- `packages/agents/src/tasks/inbox-triage-ingest.ts` — Trigger.dev recurring task per channel.
- `packages/agents/src/tasks/inbox-triage-classifier.ts` — classification + urgency scoring.
- Drizzle: `inbox_item`, `inbox_classification`.
- `apps/web/app/(dashboard)/inbox/page.tsx` — single-surface view.

## Out of scope

- Multi-channel queue UX (we don't build a Gmail-style inbox).
- Auto-reply without approval (always human-in-loop in v1).

## Dependencies

- CN-06/07/08 OAuth connectors with read+write scopes.
- SAFE-01 safety pipeline.
- RAG corpus per partner (from voice samples + public surface ingest).

## Tests + observability

- Eval set of 200 labelled inbound samples; classifier accuracy reported on every model change.
- Langfuse trace on every draft generation.
- Sentry alarm on ingest-lag > 15 min rolling 1h.

## Owner hand-off

When green, hand back to PROD-01 for the ranker to consider F2 surfaces as candidate actions in F1.
