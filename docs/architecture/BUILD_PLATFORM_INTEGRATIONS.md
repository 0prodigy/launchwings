# Build-Platform Integrations — Architecture

> The AI-build-platform layer is our distribution moat. We integrate with platforms where solopreneurs build their products today, becoming the official launch partner.

## Target partners (priority order)

1. **Lovable** — Full-stack AI app builder; large indie cohort; public roadmap accessible.
2. **Bolt.new** — StackBlitz-backed; one-shot full-stack from prompt.
3. **v0 by Vercel** — Component-first; Vercel is friendly to integration partners.
4. **Replit** — Replit Agent + huge user base; existing Bounties and Deployments APIs.
5. **Cursor** — Project export; partnership via "Cursor Tab" extension SDK.
6. **Paperclip** — AI project platform (per user request); officially partner once GA.
7. **Pickaxe** — No-code AI app builder.
8. **Tempolabs**, **Softgen**, **Create.xyz** — second wave.

## Integration shapes (from cheapest to deepest)

### Level 1 — URL import (no partnership needed)

User pastes the deployed URL of their build-platform project. We crawl with Firecrawl and infer:
- Framework (from `meta`, `Powered-by` headers, or HTML hints — `lovable.app`, `bolt.new`, `v0.app`, `replit.app` subdomains).
- Screenshots via Browserbase render.
- Build platform tagged automatically in our DB → we know to suggest the relevant flows.

**Effort**: built into our generic URL importer. Already in MVP.

### Level 2 — Public webhook + import API

User adds our webhook to their project (or pastes a project ID). We pull README/docs/screenshots via the platform's public API if it exists.

- **Replit** has a `replit.com/data/repls/@user/repl` endpoint usable with personal token.
- **Lovable** projects have a public preview URL; we crawl it.
- **v0** has shareable project links → metadata via OG tags.

**Effort**: 2–3 days per platform.

### Level 3 — OAuth + read scopes

Founder authorizes LaunchWings to read their projects on the platform. We can:
- List all their projects.
- Pre-fill the Launch Readiness Checklist from project metadata + AST/file scan (e.g. "no `/pricing` route detected").
- Subscribe to project events (publish, deploy) to auto-prompt launch.

**Effort**: blocked on partner OAuth availability; 1–2 weeks per platform once enabled.

### Level 4 — Co-branded "Launch" button inside the partner's UI

The partner adds a "Launch with LaunchWings" CTA inside their build canvas. Click → OAuth → opens our onboarding pre-populated.

- Co-marketing: "Built on Lovable, Launched with LaunchWings" badge.
- Joint launches: each side highlights successful launches in their newsletter.
- Optional revenue share (10–20% of first-year revenue from referred customers).

**Effort**: 4–8 weeks of partnership work + integration. Ship to top 2 partners by Month 6.

### Level 5 — Build-time hooks (most ambitious)

We provide a `LaunchWings.tsx` component or SDK that partners embed in scaffolds. The component:
- Captures founder voice samples while they build (with consent).
- Tracks "launch-readiness" as the founder writes code (e.g. flags when a route is added but no analytics call is wired).
- Surfaces a "Ready to launch?" button when threshold crossed.

Effort: aspirational — 6 months from now if 2 partners want it.

## Data model additions

```sql
-- partners directory
build_platforms (
  id text primary key,         -- 'lovable' | 'bolt' | 'v0' | 'replit' | 'paperclip' | ...
  name text,
  status text,                  -- 'partner' | 'community' | 'planned'
  oauth_authorize_url text,
  oauth_token_url text,
  scopes text[],
  webhook_signing_key_kms_id text
);

-- per-tenant connection
build_platform_connections (
  tenant_id uuid,
  platform_id text references build_platforms(id),
  user_handle text,
  oauth_token_encrypted bytea,
  oauth_refresh_encrypted bytea,
  expires_at timestamptz,
  scopes text[],
  primary key (tenant_id, platform_id)
);

-- imported projects
imported_projects (
  id uuid primary key,
  tenant_id uuid,
  platform_id text,
  external_id text,
  metadata jsonb,               -- title, framework, repo, deployed_url, screenshots
  imported_at timestamptz,
  last_synced_at timestamptz
);
```

## Onboarding flow with build-platform

```
[Sign up]
   → "Where did you build your product?"
        ┌── "I have a URL" ──▶ Firecrawl crawl → discover platform → suggest deeper integration if available
        ┌── "Lovable / Bolt / v0 / Replit / Paperclip / Pickaxe / Cursor" ──▶ OAuth
        │      └── Pull list of projects
        │      └── Founder picks one
        │      └── Pre-fill brief, ICP guess, screenshots, framework
        └── "Other / GitHub repo" ──▶ GitHub OAuth → README + landing
   → Discovery Agent runs
   → Audit Agent runs Stage 1 checklist
   → Dashboard
```

## Co-marketing playbook (per partner)

1. Joint launch landing page on launchwings.com/partners/[platform].
2. Co-authored case study every 30 days featuring a builder who used both.
3. Newsletter cross-promo (we feature in our weekly; they feature in theirs).
4. Shared affiliate code: 10% lifetime to the partner on every paid signup originating from their flow.
5. "Built on X, Launched with LaunchWings" embeddable badge — drives backlinks.

## Risk notes

- **Partners won't sign exclusive deals.** Keep all relationships non-exclusive.
- **Partner shutdowns**: Bolt/Lovable/Paperclip themselves churn. Diversify across ≥5 partners; design degradation path: when a connection breaks, fall back to URL crawl.
- **ToS**: never scrape behind login walls. If the platform doesn't expose APIs, stick at Level 1 (URL crawl) until they do.
- **Brand association**: avoid being seen as "the launch tool for low-quality vibe-coded apps." Curate partner list; do not integrate with platforms with high spam reputation.

## Definition of "officially integrated"

A build platform is "officially integrated" once:
- OAuth flow complete + e2e test green.
- Project metadata import covers ≥80% of fields needed by Stage 1 checklist.
- A partner-co-signed announcement post is published.
- We've successfully launched ≥3 of their builders' products within 60 days.

## Order of operations

| Quarter | Partners |
|---|---|
| Q1 | Level 1 URL crawl auto-detection works for all 7. Lovable + Bolt Level 2 (public API import). |
| Q2 | Lovable Level 3 OAuth. v0 + Replit Level 2. |
| Q3 | Lovable Level 4 (co-branded button) signed. Bolt Level 3. Paperclip launch partner if GA. |
| Q4 | Replit Level 4 negotiation. Cursor extension shipped. |

## Why this is a moat

- **ProductHunt cannot replicate**: they are a destination, not a build surface.
- **HubSpot won't bother**: wrong ICP.
- **Each new partner compounds**: a Lovable user lands in LaunchWings pre-warmed; our retention on those users is ~3× higher than cold URL imports per the metrics dossier's prediction.
- **Switching cost rises**: once a founder's launch history, analytics, and benchmarks live in LaunchWings, even if they switch build platforms, they keep us.
