# BILL-01 — Take-rate billing engine (F8)

*Status: P0. Sequencing: Phase 4 (Wk 14+) for Connect cutover; Wave-0 manual invoice runs Wk 3 onward.*

## Why this exists

`docs/product/PRD.md` F8. Implements the pricing rule from `docs/decisions/0005-outcome-aligned-take-rate.md` and `docs/brand/PRICING.md`: 10% of net attributed MRR, capped at $500 per launch, 90-day attribution window, 12-month sunset. Collected as a Stripe Connect Express application fee at charge time.

## What it is

Two paths gated by the Stripe Connect platform KYC clearance:

- **Wave-0 (manual invoice)**: while the platform application is pending (~2–4 week regulatory dependency), partners on the signed Vertical Wedge Partner Agreement are billed via Resend invoice on the agreed basis at month-end. Single dispute pauses onboarding new partners.
- **Wave-1+ (Connect application fee)**: after KYC clears, every charge fires with `application_fee_amount` calculated at the time of the charge from the current month's net-MRR-to-date for the matched launch, capped against the $500 ceiling and the 12-month sunset clock.

Month-end reconciliation: refund / dispute / chargeback events update the net MRR base, and the next-month application-fee accrual is reduced (or credit issued) to keep the cumulative collection within the cap.

## Acceptance criteria

1. Connect Express platform onboarding flow embedded in the dashboard (Stripe Connect Embedded Components or Connect Onboarding). Acceptance: 80%+ of design partners complete onboarding without support intervention.
2. For every `charge.succeeded` on a Connect connected account, `application_fee_amount` is correctly computed from the matched launch's current net MRR within the 90-day window, $500 cap, and 12-month sunset.
3. Month-end reconciliation worker processes refund / dispute / chargeback events from the prior month and credits or claws back application fees.
4. Wave-0 manual-invoice path generates a Resend-deliverable invoice on the 1st of each month with line-items per launch.
5. Country-availability gate: founders in markets where Stripe Connect Express is unavailable are routed to Polar / Lemon Squeezy Connect equivalents where available, otherwise auto-refused at signup with a clear message.
6. Take-rate computation passes property-test: cumulative collection per launch never exceeds $500; never extends beyond 12 months from launch start.

## Tech

- `apps/api/src/billing/takerate-engine.ts` — the rule engine reading from `revenue_event` (ATTR-01) and emitting `application_fee_amount` per charge.
- `apps/api/src/billing/connect-onboarding.ts` — Stripe Connect Embedded Components wiring.
- `apps/api/src/billing/reconciliation.ts` — month-end Trigger.dev task.
- `apps/api/src/billing/invoice-fallback.ts` — Wave-0 Resend-delivered invoice generator.
- Drizzle: `takerate_charge`, `partner_processor_connection`, `monthly_reconciliation_run`.
- Stripe Connect platform API (charge with `transfer_data.destination` + `application_fee_amount`).

## Why Connect Express, not Standard

- Dispute control sits with the platform, not the connected account.
- Stripe handles 1099 / KYC for the connected account.
- Embedded onboarding inside our flow.
- Standard supports `application_fee_amount` but forces the platform to manage tax and bear no dispute control — fragile under the first dispute.

## Out of scope

- BYOK billing UI (deferred indefinitely; not on the v1 surface).
- Multi-currency pricing (USD only at GA per `docs/brand/PRICING.md`).
- AppSumo LTD or other promotional pricing channels.

## Dependencies

- ATTR-01 — `revenue_event` net-MRR rows are the input.
- Stripe Connect platform application filed Wk 11 (regulatory KYC).
- Polar / Lemon Squeezy Connect-equivalent maturity verified monthly.

## Tests + observability

- Property test: cumulative collection per launch ≤ $500 across all paths.
- Property test: collection stops at 12 months from launch start.
- Property test: refund events within the window reduce net MRR and proportionally reduce billed fee.
- Integration: full happy-path — partner onboards Connect → first charge → application fee deducted → month-end reconciles cleanly.
- Sentry alarm on reconciliation worker errors.

## Owner hand-off

When green, the Wk-13 Day-90 evaluation reads from `takerate_charge` and `revenue_event` for kill-criterion adjudication.
