# LRC-02 — Stage 1 evaluators (DOM-scan batch)

> Spec: `docs/tickets/SPRINT_02.md` § LRC-02 (18 items, 8d total).

## Scope of this batch

Adds 7 pure DOM-scan / regex-style evaluators that don't need external
infra (Lighthouse, Cloudflare Workers, SMTP probes, Stripe). They
mirror the existing `meta-description` / `og-image` / `favicon-presence`
pattern: `cheerio.load(html)` → judge → `EvalResult`.

- [ ] Primary CTA detector (`primary-cta.ts`)
- [ ] Pricing page detector (`pricing-page.ts`)
- [ ] About / founder section detector (`about-section.ts`)
- [ ] Twitter card meta valid (`twitter-card.ts`)
- [ ] Title length <60 (`title-length.ts`)
- [ ] Privacy policy + Terms presence (`legal-links.ts`)
- [ ] Email capture detector (`email-capture-static.ts`)

## Deferred to follow-up tickets

Each requires external infra and is independently shippable:

- Lighthouse JS errors + mobile responsive perf → needs Lighthouse CI
  in a container (`lrc-02-followup-lighthouse.md`).
- URL response < 2s p95 (3-region) → needs Cloudflare Workers
  (`lrc-02-followup-multiregion-perf.md`).
- Email destination test (SMTP probe / webhook test) →
  (`lrc-02-followup-email-destination.md`).
- Stripe webhook reachable → needs Stripe connection per tenant
  (`lrc-02-followup-stripe-webhook.md`).
- Spamhaus + Google Safe Browsing extension to existing `domain-age` →
  (`lrc-02-followup-domain-blacklist.md`).
- Favicon ≥256px size check (extends `favicon-presence`) →
  (`lrc-02-followup-favicon-size.md`).

## Pattern (matches existing evaluators)

```ts
export const xxxEvaluator: Evaluator = {
  id: "stage1-xxx",
  stage: 1,
  weight: 1,
  evaluate: async (target, ctx) => {
    const html = target.fetchedHtml ?? (await ctx.fetchHtml(target.url)).html;
    const judged = judgeXxxFromHtml(html);
    return { evaluatorId: "stage1-xxx", ...judged, latencyMs: 0, costUsdMicros: 0 };
  },
};
```

Pure-judge function exported for unit tests; evaluator wrapper is the
network shell. Register in `packages/lrs/src/evaluators/index.ts`.
