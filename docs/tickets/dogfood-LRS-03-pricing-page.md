## DOGFOOD-LRS-03 — Ship `/pricing` on launchwings.com + pricing-presence evaluator

**Intent**: Stage 1 item 4 fails today — `/pricing` returns 404. Ship the page from `docs/brand/PRICING.md` (the outcome-aligned take-rate model: $0 base + 10% of net attributed MRR, cap $500, 90-day window, 12-month sunset) AND ship the audit evaluator.

**Acceptance (site)**:
- New route `apps/web/app/pricing/page.tsx` rendering the single pricing model from `docs/brand/PRICING.md`. Lead with "$0 to start" and the worked example. Mobile-responsive, matches existing landing visual style.
- Footer + header gain a "Pricing" link.
- Sitemap includes `/pricing` with priority 0.8.
- Copy passes `@copy-review` — only the take-rate model from `docs/brand/PRICING.md`; no tier-based pricing language; no generative-output-as-wedge framing.
- Verified post-deploy: `curl -I https://launchwings.com/pricing` returns 200.

**Acceptance (evaluator)**:
- `pricingPresence` evaluator in LRS Audit Agent: HEAD `${origin}/pricing`; if not 200, regex homepage HTML for a `$\d+` price token, a `%` take-rate token, or any "outcome / take-rate / per launch" phrasing near a number.
- Soft-fail (yellow) when product is in waitlist phase AND a `pricing-coming-soon` data attribute or page exists; hard-fail otherwise.
- Eval set: 8 landing pages (4 with `/pricing`, 2 with inline outcome-pricing, 2 missing).

**Estimate**: 1d site + 0.5d evaluator = 1.5d. **Owner**: frontend + AI eng.
