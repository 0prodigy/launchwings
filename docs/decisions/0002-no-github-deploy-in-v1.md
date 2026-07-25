# ADR-0002 — No "GitHub URL → deployed" capability in v1

## Status

**Accepted** — 2026-05-07.

## Context

A natural-sounding wedge for LaunchWings is: take a solopreneur's GitHub repo, deploy it (Vercel/Netlify/Railway), provision a domain + DNS + SSL, then run our launch flow on the live URL. This would help the cohort that has built but not yet deployed.

The question: **Is "GitHub URL → deployed" a v1 wedge, a v2 expansion, or a non-feature?**

Decision was forced by user clarification ("we could think and start our journey how to launch a product from a github url which will include deployment, hosting, domain"). Three perspective agents (Solopreneur Needs, Engineering Reality, Strategic Fit) were invoked in parallel.

## Decision

**Do NOT build "GitHub URL → deployed" in v1. Keep the existing GitHub repo metadata ingest path** (read README + screenshots + `package.json` to populate the Launch Brief — already in spec, confirmed by `BUILD_PLATFORM_INTEGRATIONS.md` line 113). **Re-evaluate as a Q2-Q3 v2 expansion** only if onboarding telemetry shows >15% of signups drop off because they have no live URL. Even then, ship as a **thin shim** (push to user's *own* Vercel/Railway account via OAuth), never as our infrastructure.

If a user has no live URL on signup, the Launch Readiness Checklist Stage 1 refuses to launch. **That gate is the wedge, not a bug.**

## Perspectives consulted

- **Solopreneur Needs (research agent ac04b649…)** — Best estimate: 25–40% of "have-built-something" solopreneurs are pre-deployment, but the *acutely deploy-blocked* subset is ~5–10% because Lovable/Bolt/v0/Replit (the dominant non-technical builders) auto-deploy. The Cursor/Claude-Code/local-build remainder is technical enough for Vercel one-click. **Verdict: v2 expansion, not v1 wedge.**

- **Engineering Reality (research agent a9615e40…)** — Even narrow scope (Next.js + static + Vercel + Cloudflare DNS) is **6–8 engineer-weeks** for two engineers — that eats Bundle 5 (the keystone). "Everything" is **30–40+ weeks** (literally Coolify). Vercel Hobby free tier is **non-commercial only** — each user must connect their own Vercel account. Cloudflare Registrar API is in beta (April 2026), no transfers/renewals yet. **Verdict: ship none of it. Link out to "Deploy with Vercel" buttons; partner with Coolify/Vercel later.**

- **Strategic Fit (research agent a2763c7c…)** — Severe cannibalization risk: Lovable, Bolt, v0, Replit, Paperclip are the ICP cohort, and each auto-deploys today. Shipping our own deploy steps on their revenue. Stripe held wedge at "payments primitives" 8 years before horizontal expansion — same lesson. **Verdict: NO for v1; soft maybe for v2 only as a thin shim.**

- **@ceo** — Would defer regardless: doesn't displace anything in MVP cut, fails $5K MRR validation gate (we'd be building Bundle 13/expansion territory before keystone Bundle 5 ships).

- **@cto** — Touches blockers #2 (connector healthcheck), #4 (idempotency), #7 (geo residency), #14 (webhook signing). Junior estimate × 2.5 = floor of 15+ engineer-weeks even for narrow scope.

- **@safety-lead** — Pass-through secret handling for user-provided env vars (Stripe keys, DB URLs) raises ToS surface across multiple deploy targets. Refuses without a pre-pen-test.

## Consequences

### Positive

- Preserves the build-platform-partner moat (Q1 Y2 embedded SDK with Lovable/Bolt/Paperclip).
- Keeps MVP scope to 23.5 / 24 engineer-weeks; doesn't displace Bundle 5.
- Sharper wedge marketing: "your always-on growth team" vs blurry "we kind of do everything."
- Reduces operational surface (no per-framework × per-deploy-target maintenance burden).
- Avoids regulatory/PCI-adjacent surface from passing through customer secrets.

### Negative / accepted risk

- Some prospects who have only a GitHub repo will bounce in onboarding. Mitigation: friendly fallback page "haven't deployed yet? Here's our 5-min Vercel guide" (manual content, no engineering work).
- We give up a viscerally-sharp marketing line ("from `git push` to first 1000 customers"). Tagline rewrite needed (see below).
- Future competitor could build deploy + launch in one product. Mitigation: our Q1 Y2 Embedded SDK (per dossier 10 §11) inverts this — we are *inside* their build canvas, not next to it.

### Pre-mortem trip-wires this affects

- Helps **engineering velocity** trip-wire — no scope creep.
- Helps **operational reliability** trip-wire — fewer connectors to maintain.
- Worsens **Day-30 signups** trip-wire marginally, by losing the undeployed cohort.

## What this displaces from MVP

Nothing. This decision *protects* MVP scope by refusing to add 6–8 engineer-weeks of deploy work that would have eaten the F1 next-action-engine work.

## Reversal cost

**Low.** If onboarding telemetry shows >15% drop-off citing "no deployed URL" by Month 3 of public beta, we can:

1. Add a "Connect to Vercel" button (1 week, OAuth + Vercel Deploy API).
2. Add a "Connect to Railway" button (1 week).
3. Bundle into the take-rate cohort as an upsell ("Deploy + Launch in one click") with no additional charge — deploy is a feature, not a separate price.

Cost: ~2 engineer-weeks of additive work. Brand: zero — we never marketed deploy capability. Customer churn: zero — feature additive.

## Updated marketing tagline (verdict-aligned)

**Working tagline:**

> **LaunchWings — your always-on growth team. Point us at your live product; we run a launch-readiness audit, then ship you to 30+ channels and keep compounding until you hit your first paying customers.**

This replaces "From `git push` to first 1,000 customers" (the more visceral but blurrier candidate from `BRAND/NAMING.md`). The repo-metadata path is preserved in onboarding ("Other / GitHub repo → README ingest"); it just doesn't promise deployment.

## Required spec updates

1. **`.claude/agents/devops-product.md`** — agent scope is debugging deploy issues a user reports, plus future v2 design. Not v1 build.
2. **`docs/architecture/BUILD_PLATFORM_INTEGRATIONS.md`** — URL crawl + subdomain detection is v1; OAuth deeper-level is Q3+. Explicit "no deploy" line.
3. **Launch readiness audit (LRC-01 / LRC-02 tickets)** — Stage 1 prerequisite: live URL responds 200 in <2s p95.

## Related decisions

- ADR-0003 — internal deploy tooling for our own LaunchWings properties.
- ADR-0004 — domain `launchwings.com`.
- ADR-0005 — outcome-aligned take-rate.

## Date

2026-05-07
