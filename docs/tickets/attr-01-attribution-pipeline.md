# ATTR-01 — Attribution pipeline (F6.b)

*Status: P0. Sequencing: Phase 3 (Wk 11–13).*

## Why this exists

`docs/product/PRD.md` F6. Net-MRR-aware attribution from `redirect_click` rows to paying-customer events. Without this, the take-rate cannot compute and the cohort warehouse has no `revenue_event` rows to anonymize.

## What it is

Hono webhook receivers in `apps/api/src/app.ts` for Stripe / Polar / Lemon Squeezy. Each receiver:

1. Verifies the provider's signature.
2. Writes the raw event idempotently keyed on `(provider, event_id)`.
3. For `customer.created` / `charge.succeeded` / equivalent: invokes the matcher.
4. For `charge.refunded` / `charge.dispute.created` / `application_fee.refunded`: updates the `revenue_event` row to reflect net MRR.

The matcher tries three strategies in order: (a) `metadata.lw_lid` round-trip through the founder's signup form; (b) device-fingerprint match against the `redirect_click` row at click time; (c) email observed at click time when the founder's signup captures email.

**Deferred re-match loop**: Stripe webhook delivery is unordered. `charge.succeeded` can arrive before `customer.created`. Rows initially written as `attribution_method='unattributed'` are re-matched 24h after `customer.created` lands. Without this, paying customers silently disappear from the cohort.

## Acceptance criteria

1. Webhook receivers for Stripe / Polar / Lemon Squeezy accept and verify signatures; reject malformed.
2. Idempotency: replaying the same `(provider, event_id)` is a no-op.
3. Matcher attribution latency p95 ≤ 5s from webhook arrival to `revenue_event` row writeable.
4. Refund / dispute / application-fee-refunded events update the net MRR base for the matched launch.
5. Deferred re-match: rows written as `unattributed` are re-evaluated 24h after the next `customer.created` arrives for the same tenant.
6. Confirmed `lw_lid` share ≥ 70% of matched paying customers across the design-partner cohort by 2026-07-15.
7. Recovery rate on initially-unattributed rows ≥ 90% within 48h of `customer.created` arrival.

## Tech

- `apps/api/src/webhooks/stripe.ts`, `polar.ts`, `lemonsqueezy.ts` — receivers.
- `apps/api/src/attribution-matcher.ts` — matcher with the three-strategy chain.
- `packages/agents/src/tasks/deferred-rematch.ts` — Trigger.dev task running every 30 minutes.
- Drizzle: `revenue_event`, `webhook_event_raw`, `attribution_match`.

## Subscribed events

| Provider | Events |
|---|---|
| Stripe | `customer.created`, `charge.succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `application_fee.created`, `application_fee.refunded`, `invoice.paid`, `customer.subscription.deleted` |
| Polar | `subscription.created`, `subscription.canceled`, `order.created`, `refund.created` (provider-specific schema) |
| Lemon Squeezy | `subscription_created`, `subscription_cancelled`, `order_created`, `order_refunded` (provider-specific schema) |

## Out of scope

- Take-rate billing computation (BILL-01).
- Cohort warehouse anonymization (WHSE-01).
- Public dispute UI (post Phase 4).

## Dependencies

- REDIR-01 — `redirect_click` rows are the matcher's left-hand side.
- Stripe / Polar / Lemon Squeezy webhook endpoints provisioned per provider.

## Tests + observability

- Unit: idempotency on `(provider, event_id)` replay; signature verification per provider.
- Unit: matcher chain — assert each strategy fires only when prior strategy misses.
- Integration: out-of-order delivery test — fire `charge.succeeded` before `customer.created`, verify deferred re-match resolves the row within 24h.
- Langfuse trace on every match attempt with the strategy used.
- Sentry alarm on attribution-latency p95 > 10s rolling 5min.

## Owner hand-off

When green, BILL-01 consumes finalized `revenue_event` rows for take-rate computation; WHSE-01 consumes them for anonymized aggregates.
