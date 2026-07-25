# ADR-0003 — Build "GitHub URL → deployed" as INTERNAL tooling, not as a v1 customer feature

## Status

**Accepted** — 2026-05-07.

## Context

ADR-0002 decided that "GitHub URL → deployed → launched" is **not a v1 customer feature**. That decision stands.

The founder has clarified: we should still build the capability **for ourselves**, as automation that lets us (the LaunchWings team) launch our own marketing site, waitlist, blog, and any internal tool from a GitHub repo. The motivation:

1. We dogfood end-to-end. Every step our future v3 customer would take, we walk first.
2. We extract real learnings (auth quirks, DNS propagation timing, env-var pitfalls, framework detection edge cases) that flow directly into the eventual customer feature.
3. We move faster on our own launches — push to git, the dogfood site is updated, the waitlist captures more emails.
4. We compound experience without committing customer scope. Months later, when the question "should we ship this to customers?" returns, we have hard evidence on cost, pitfalls, and value.

This does not contradict ADR-0002. It separates **internal tooling** from **customer-facing v1 product**.

## Decision

**Build a `/deploy-from-github` skill in `.claude/skills/` and supporting scripts under `scripts/deploy/`. Use it ONLY for our own properties (launchloo.com or whatever domain we choose, and any LaunchWings-owned subdomain). Do NOT expose to customers in v1.** Capture learnings in `docs/dogfood/learnings.md`. Re-evaluate productizing as a customer feature at the end of Q3 Y1, informed by data from real dogfood usage.

Boundary tests for "is this internal tooling or customer-feature creep?":

| Question | Internal | Customer-feature creep |
|---|---|---|
| Who runs it? | Us, manually, via Claude Code | Customer, via UI, automatically |
| Where does it run? | Our laptops + our scripts | Our production multi-tenant servers |
| Who owns the credentials? | Us (in our `.env.local` / Infisical) | Customer (must store BYOK + manage permissions) |
| What's the failure surface? | Our own launches | Many tenants × many frameworks × many failure modes |
| What's the support burden? | We support ourselves | We support every customer's repo |
| What changes if it breaks? | Our marketing site is delayed | Customer churn + brand damage |

If any "Customer-feature creep" answer applies, it's outside scope of this ADR — escalate to a new ADR.

## Perspectives consulted

- **Founder direct instruction**: build for us; learn; possibly extract later.
- **@ceo** — green-lights internal tooling because it does NOT displace any MVP bundle and DOES improve dogfood velocity. Reaffirms the boundary: "us, only us, for now."
- **@cto** — green-lights with stack-manifest enforcement (Vercel API + Cloudflare DNS API + GitHub OAuth + Infisical for secrets). Demands documentation good enough for the second engineer to use without help.
- **@safety-lead** — no veto. Internal tooling that stores user credentials in the operator's `.env.local` is acceptable; production multi-tenant credential handling would need a fresh ADR. Confirm: never commit `.env.local`; never log API keys.
- **@devops-product** — owns this. Per the updated `.claude/agents/devops-product.md`, scope expands to include this internal capability while still rejecting v1 customer scope.

## Consequences

### Positive

- We deploy our own dogfood site faster and more reliably.
- Every learning captured in `dogfood/learnings.md` is real evidence for the eventual customer feature.
- We discover the *real* edge cases (DNS, SSL, env vars, framework detection) before customer support tickets.
- Engineers gain familiarity with Vercel API + Cloudflare API surface — useful for Bundle 6 (directory connectors) and Bundle 11 (BYOK validation flow).
- The "GitHub-to-launch" automation becomes a long-running internal asset that may someday extract as a Year-3 product.

### Negative / accepted risk

- **Scope-creep risk** — engineers see this internal automation and think "we should ship it." Mitigation: this ADR + the boundary table above + `/feature-gate` checks every time someone proposes exposing it.
- **Maintenance burden** — every Vercel/Cloudflare API change costs us internal-tool maintenance time. Mitigation: keep scope to Next.js + Vercel + Cloudflare DNS only. No Docker, no Railway, no DB provisioning.
- **Credential-handling drift** — the team gets used to convenient `.env.local` patterns and might extend them to customer flows. Mitigation: explicit "internal credentials only" rule in `.claude/skills/deploy-from-github/SKILL.md`; rotate credentials quarterly even though they're internal.

### Pre-mortem trip-wires this affects

- Helps **Sprint 4 velocity** trip-wire (PRE_MORTEM D1) — automates a recurring task we'd otherwise do manually weekly.
- Neutral on **founder burnout** trip-wire — we save time per deploy but invest time in scripts.
- Slightly worsens **scope-creep** trip-wire (PRE_MORTEM general). Mitigated by the boundary table.

## What this displaces from MVP

Nothing. This is internal tooling, paid for by the founder's automation budget — outside the MVP engineer-week count. We must keep it that way; if internal tooling balloons past 1 engineer-week per quarter, we escalate.

## Reversal cost

**Very low.** If we decide internal tooling isn't worth it:
- Delete `.claude/skills/deploy-from-github/` and `scripts/deploy/`.
- Resume manual `vercel deploy` + manual DNS edits in Cloudflare dashboard.
- ~0 engineer-time to revert.

## Required spec updates

1. ✅ Update `.claude/agents/devops-product.md` — scope expands to internal tooling (this ADR resolves the prior "v1 = audit/debug only" tension).
2. ✅ Create `.claude/skills/deploy-from-github/SKILL.md` — documented playbook for our own use.
3. ✅ Create `scripts/deploy/` directory with `README.md` describing the helper functions (actual code ships in DOG-XX tickets next sprint).
4. ✅ Update `docs/dogfood/LANDING_PAGE_PLAN.md` to reference the deploy automation we'll use for DOG-06.
5. ✅ Add capture rules to `docs/dogfood/learnings.md` — every internal deploy is a learning event.

## Related decisions

- **ADR-0002** — no GitHub-to-launch as customer feature in v1. Stands.
- **(future) ADR-XXXX** — productize for customers? Decide end of Q3 Y1 based on data.

## Date

2026-05-07
