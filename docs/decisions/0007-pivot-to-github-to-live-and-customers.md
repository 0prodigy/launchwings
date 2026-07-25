# ADR-0007 — Pivot to "GitHub repo → live + acquiring customers"

## Status

**Proposed (WRITTEN UNDER AFK AUTONOMY — founder to review on return)** — 2026-05-29.

Supersedes:
- ADR-0006 (Pivot to AI Launch Concierge for Instagram + Facebook brands) — 2026-05-14.

Reverses, in part:
- ADR-0002 (No "GitHub URL → deployed" in v1) — "make it live" puts repo-to-deploy back inside v1 scope. ADR-0002's reasoning is preserved as historical caution (cannibalization risk vs Lovable/Bolt/v0/Replit; per-framework × per-target maintenance burden; pass-through secrets surface). v1 must honor those risks via the scope cuts below.

Extends:
- ADR-0003 (Internal deploy tooling) — the internal `/deploy-from-github` skill graduates from "us only" to "thin customer-facing shim," provided the boundary table in ADR-0003 §Decision is re-drawn before any tenant traffic.

**Note on same-month supersede.** ADR-0006 was accepted 2026-05-14. On 2026-05-29 the founder declared in-session that the IG-concierge direction is wrong and that the new direction is: "allow me to newly created project on github or already hosted project make it live and get customers." This is direction-pivot #3 in 2 weeks (legacy LRS → ADR-0006 IG concierge → this ADR). The supersede is recorded same-month because the call was made same-month; the cost of pivots is now non-trivial and this ADR is structured so the **next** pivot is cheaper (see §Trip-wires).

## Context

The founder's stated direction is two clauses joined by "or": **"newly created project on github OR already hosted project, make it live and get customers."** That admits at least three readings, and choosing wrong burns another two weeks:

1. **Deploy-only.** "Make it live" is the product; customer acquisition is the user's problem. This reverses ADR-0002 cleanly but is the smallest product.
2. **GTM-only.** "Get customers" is the product; deployment is assumed. Closest to the legacy LRS audit/launch concept, minus the take-rate.
3. **Both, conditional on input state.** "Newly created" implies a repo that is not yet deployed → deploy + GTM. "Already hosted" implies a live URL already exists → GTM only. The product branches on input state.

**Recommended default: reading (3).** It is the only reading that honors both clauses of the founder's sentence. Readings (1) and (2) require dropping half the sentence and should be treated as fallback cuts if the founder rejects (3) on review.

What we carry over from ADR-0006:
- The **autonomous-loop discipline** (MISSION.md §1: eval-first, atomic commits, self-verify, three-strikes hard stop).
- The **local-first / OSS preference** (MISSION.md §0 reframe table) — Postgres + pgvector or PGlite for dev; in-process scheduler; BYOK LLM keys; cassette replay in CI.
- **Founder-approved generation** — no autonomous send. Every outbound artifact (post, DM, deploy, domain purchase) requires explicit approval before it touches the world.
- **BYOK LLM** — bring-your-own `ANTHROPIC_API_KEY` for v1; no platform-billed inference.

What is dropped from ADR-0006:
- Instagram / Facebook Meta Graph focus as the primary channel. Meta API platform risk (ADR-0006 Negative §2) leaves with it.
- Independent streetwear / capsule-fashion ICP. New ICP candidates listed below; founder picks.
- Shopify-native connector as a v1 feature. Re-add only if the chosen ICP demands it.
- The six-feature spec (Brand-Voice Engine, Launch Playbook, DM/Comment Engagement, Shopify connector, Hot-Lead Inbox, Launch Dashboard).
- Three-tier flat pricing ($79/$149/$249). Pricing is open again — see QUESTIONS.md.

The one ADR-0006 element that survives as a forward-looking seed: **brand-voice-from-corpus** generalizes to "voice-from-README" — auto-generated landing copy in the project's tone. The corpus shape is different (README + commits + docs vs IG captions); the harvest from `packages/agents/src/.../voice/corpus.test.ts` still applies.

## Decision

**LaunchWings becomes a local-first OSS tool that takes a GitHub repository as input and produces (a) a live, working deployment and (b) a first batch of customer-acquisition motions — both gated on founder approval at every irreversible step.**

The product branches on input state:
- **Repo is not yet deployed** → run the deploy adapter, register a domain (or accept a user-supplied one), generate a landing page from the README, then run the GTM beat.
- **Repo is already hosted** → skip deploy; verify the live URL; run the GTM beat against the live product.

### v1 cut-line (4–5 features only)

1. **GitHub repo ingest.** Read `README.md`, `package.json` (and `pyproject.toml` / `go.mod` as cheap extensions), detect framework, extract product name, one-liner, primary value prop, screenshots if linked. Output: structured "launch brief" object. *Inherits the repo-metadata path ADR-0002 explicitly preserved as v1-OK.*
2. **One-click deploy adapter (Vercel default for v1).** Single target. Vercel is recommended because (a) the existing internal skill from ADR-0003 already targets Vercel + Cloudflare DNS, (b) Vercel's Deploy API + project-link flow is the most mature OAuth surface among the candidates, (c) the founder's own apps/api already deploys to Vercel (project CLAUDE.md "Cloud surface"), so we dogfood the same path, (d) Vercel Hobby's non-commercial restriction (called out in ADR-0002) is handled by requiring the customer to connect their own Vercel account — we never deploy to our infrastructure. Cloudflare/Fly are post-v1.
3. **Domain + SSL automation.** Connect-existing-domain in v1 (user owns the registrar, we wire DNS via their Vercel project). Purchase-new-domain via Cloudflare Registrar is deferred — Cloudflare Registrar API was still beta as of ADR-0002 (April 2026); revisit in v1.1.
4. **Landing page + waitlist auto-generated from README.** Voice-from-README extraction (the ADR-0006 brand-voice seed, generalized). Page is generated, founder edits and approves, then deployed alongside the product (or as a subdomain if the product is already live). Waitlist captures email + UTM source to a local Postgres row — no SendGrid / Mailchimp in v1.
5. **Initial GTM beat — single composed motion.** ONE pass, three artifacts: (a) an SEO blog post seeded from the README, (b) a Twitter/X thread draft, (c) an indie-directory submission packet (BetaList / Product Hunt prep / Hacker News "Show HN" draft). All three are drafted, the founder approves before anything is sent, and posts/submissions happen via copy-paste in v1 (no Twitter API, no PH API). The "compounding loop" (ADR-0006 inheritance) is a v1.1 feature, not v1.

That is 5 features. Anything else — analytics dashboard, attribution, agency multi-tenant, Stripe billing, cron-scheduled re-launches, paid-ad orchestration — is **out of scope for v1**.

### ICP candidates (TBD — founder must pick before any Phase 1 work)

Three candidates surfaced; none selected. Logged in `docs/mission/QUESTIONS.md` Q1.

- **Indie hackers shipping side projects.** Highest density on GitHub. Lowest willingness-to-pay. Best for viral / OSS-credibility flywheel; worst for day-1 cash. Cannibalization risk against Lovable / Bolt / v0 / Replit is real (ADR-0002 Strategic Fit verdict). Differentiator must be the GTM beat, not the deploy.
- **Agencies shipping client microsites.** Higher ARPU, repeat usage, "agency multi-tenant" requirement collapses the v1 spec (per-client BYOK, per-client domains, per-client billing). Day-1 cash plausible. v1 spec as written does not support multi-client; would force a Phase 0.5 multi-tenant slice.
- **No-code-to-code graduates** (people who started on Lovable/Bolt and exported to a GitHub repo). Narrow but acutely deploy-blocked — ADR-0002's "5–10% acutely blocked" cohort. Day-1 cash uncertain. Best fit for the "deploy + GTM" combined branch.

### Inheritance from ADR-0006 (what carries over verbatim)

Local-first OSS substrate (Postgres+pgvector, in-process scheduler, BYOK LLM, cassette replay). Eval-first discipline. Founder-approved generation. Atomic commits, three-strikes hard stop. Voice extraction technique generalized from IG captions to README/repo signal.

## Consequences

### Positive

- **Reuses the most-built internal asset.** The ADR-0003 internal `/deploy-from-github` skill (Vercel + Cloudflare + GitHub OAuth) becomes the v1 deploy adapter with minimal additional work. Inventory in MISSION.md §0 C1 ("Harvest reusable infra (monorepo, llm wrapper, cassette harness, db/trpc plumbing)") applies.
- **No Meta API platform risk.** The single largest external risk in the ADR-0006 pre-mortem leaves with the IG/FB pivot.
- **Sandbox-compatible.** The dev loop runs locally (per MISSION.md §0 reframe). Real Vercel deploys still need founder creds (sandbox-limits corollary, CLAUDE.md), but the rest is reproducible locally with cassettes.
- **Cheaper next pivot.** v1 scope is 5 features, all decoupled. If GTM is the value (reading 2) the deploy adapter is cut without disturbing GTM; if deploy is the value (reading 1) the GTM beat is cut without disturbing deploy. Either fallback survives.

### Negative / accepted risk

- **Reverses ADR-0002, and ADR-0002's risks are still real.** Cannibalization with Lovable/Bolt/v0/Replit; per-framework × per-target maintenance; pass-through secrets surface (env vars, deploy tokens). Mitigations baked in: (1) Vercel-only, single target. (2) Customer connects their own Vercel account via OAuth — we hold short-lived tokens, never long-lived deploy credentials. (3) No DB/Redis provisioning in v1 (Coolify territory, explicitly out per ADR-0003 §Negative).
- **ICP is unpicked.** Phase 1 cannot start until founder picks (or rejects all three and supplies a fourth). This is the single largest blocker.
- **Direction-pivot #3 in 2 weeks.** Team trust in scope is eroding. Mitigation: the trip-wires below are explicit and the v1 cut-line is fewer features than ADR-0006's six.
- **GTM beat in v1 is shallow.** A single one-pass motion is not a "growth team." Setting customer expectations to match (this is a launch helper, not Klaviyo) is a brand task that this ADR does not solve.

### Neutral

- Domain `launchwings.com` retained (ADR-0004 stands; "launch" + "wings" maps to repo-to-live).
- BACKLOG.md (Phase 0 baseline + local data substrate + adapter seam + OSS hygiene) survives intact. Phase 1+ (Brand-Voice Engine for IG, Launch Playbook, etc.) is rewritten by a separate implementer pass — not by this ADR.
- The legacy LRS code (audit / discovery / directory submission) which MISSION.md §0 C1 marked as "mostly killed scope" is **partially un-killed** — the directory-submitter and the SEO post draft are exactly the GTM beat in feature 5. Harvest before deleting.

## Trip-wires (re-open this ADR if any of)

- Founder picks "deploy only" on review → collapse to reading (1); drop features 4 and 5; rename product accordingly.
- Founder picks "GTM only" on review → collapse to reading (2); drop features 2 and 3; closer to legacy LRS minus take-rate.
- Founder picks an ICP whose deploy target is not Vercel (e.g. agencies on Netlify, no-code graduates on Cloudflare Pages) → feature 2 default target changes; v1 ships with that target instead, not both.
- 4 weeks pass and no paying customer has used the end-to-end loop on their own repo → scope is still wrong; re-open before adding feature 6.
- Lovable / Bolt / v0 ships an in-product "GTM beat" before us → cannibalization realized; the deploy half of v1 dies and we pivot to pure GTM against their output.
- Founder declares pivot #4 → enforce a hard pause: no new ADR for 14 days; current ADR must be falsified by operating data, not by a fresh idea.

## Open questions

Appended to `docs/mission/QUESTIONS.md` (note: file does not yet exist as of 2026-05-29; the implementer agent is creating it in parallel with this ADR). Founder-only resolutions:

- Q1. ICP — indie hackers, agencies, no-code graduates, or other? (blocks Phase 1)
- Q2. Reading (3) confirmed, or collapse to (1) deploy-only or (2) GTM-only?
- Q3. Deploy target for v1 — Vercel as recommended, or Cloudflare Pages / Fly / Netlify?
- Q4. Single-tenant self-host (OSS user runs their own instance) vs hosted multi-tenant? ADR-0006 implied hosted; the OSS reframe implied self-host; this is unresolved.
- Q5. Pricing — open. Free OSS + paid hosted? Paid OSS license? Take-rate (killed in ADR-0006)? Flat tier?
- Q6. Paid acquisition channels in v1 — yes / no? Recommendation: no (founder-approved organic only).
- Q7. Domain purchase in v1 — connect-existing only (recommended) or include Cloudflare Registrar buy-flow?
- Q8. Agency multi-tenant — in v1, deferred, or never?
- Q9. Customer support model — Discord / GitHub issues / email / none in v1?
- Q10. What does "get customers" mean as a success metric — waitlist signups, paid signups, MRR, or PH/HN front page?

## References

- MISSION.md §0 (reconciled direction + local-first reframe) and §0 C1 (legacy code harvest list)
- ADR-0006 (superseded)
- ADR-0002 (partially reversed) + ADR-0003 (extended)
- BACKLOG.md Phase 0 (baseline + local substrate + adapter seam) — survives intact
- CLAUDE.md "Sandbox-limits corollary" — real deploy validation requires founder-supplied creds outside the sandbox

## Date

2026-05-29
