# MISSION.md — autonomous build control plane

> Single source of truth for the autonomous LaunchWings build. Any Claude Code
> session (fresh or resumed) reads THIS first, then the latest handoff at
> `docs/mission/HANDOFF.md`. Update both at every checkpoint. If this file and
> a doc under `docs/` conflict, the **more recent ADR** wins (Rule 7).

---

## 0. What we are building (reconciled direction)

**LaunchWings** = the AI launch concierge for **Instagram + Facebook native
product brands** (ICP: independent streetwear / capsule-fashion labels,
5K–50K followers, $100K–$2M rev, Shopify/Etsy, ≥monthly drops). Canonical:
`docs/decisions/0006-pivot-to-ig-launch-concierge.md` + `docs/operations/CHARTER_2026_05_14.md`.

**v1 = six features (and only these):**
1. **Brand-Voice Engine** — RAG over the merchant's captions/product-copy/DM
   history (pgvector) + tone-card extraction; learn-from-edits flywheel. *The moat.*
2. **Launch Playbook** — multi-beat drop/restock/capsule/flash/pre-order
   sequences, each beat drafted in voice, founder-approved before send.
3. **DM + Comment Engagement** — Meta-Graph-native IG/FB DM + comments, 24h-window compliant.
4. **Shopify-Native Connector** — order/shipping/abandoned-cart/restock in brand voice.
5. **Hot-Lead Inbox** — high-intent threads surfaced to founder for personal reply.
6. **Launch Dashboard** — mobile-first PWA: posts out, DMs flowing, hot leads, revenue live.

### Reframe from the original cloud spec → local-first / open-source
The user's standing requirement: **runs fully locally, standalone, open-source.**
The ADR-0006 spec was cloud-architected (Vercel + Neon + Clerk + Stripe +
Trigger.dev). We keep the product, swap the substrate to self-hostable OSS:

| Cloud original | Local-first / OSS target | Status |
|---|---|---|
| Neon Postgres + pgvector | local Postgres + pgvector (docker-compose) or PGlite for dev | TODO |
| Clerk auth | local email/password (lucia/better-auth) — auth optional in single-tenant self-host | TODO |
| Stripe billing | OPTIONAL, off by default in OSS build | TODO |
| Trigger.dev scheduler | in-process scheduler (node-cron / BullMQ-on-local-redis) | TODO |
| Vercel / Fly deploy | `docker compose up` + plain `pnpm dev`; deploy adapters optional | TODO |
| Meta Graph API / Shopify | **adapter interface**: mock+fixture impl for local, real impl when creds present | TODO |
| Claude Opus/Haiku | bring-your-own `ANTHROPIC_API_KEY`; cassette replay in tests/CI | partial (cassettes exist) |

### CONFLICTS SURFACED (do not silently resolve)
- **C1 — code vs direction.** Inherited code (audit / LRS evaluators /
  directory-submitter / discovery / positioning) is **legacy solopreneur/LRS era**,
  predating ADR-0006. It is mostly *killed scope*. Harvest reusable infra
  (monorepo, llm wrapper, cassette harness, db/trpc plumbing) and retire the rest.
  The one forward-looking seed is `packages/agents/src/.../voice/corpus.test.ts`.
- **C2 — sandbox limits.** This environment cannot run Meta Graph / Shopify /
  Stripe live calls, can't open external dashboards. "Usable end-to-end" is
  achievable **locally against mocks/fixtures**; real-integration validation
  needs the founder to supply creds and run outside the sandbox. We never fake
  green on an integration we couldn't actually call (A2, Rule 12).
- **C3 — agents.** `.claude/agents` here are company personas (ceo/cto/...),
  not the build agents (implementer/reviewer/validator/eval-author). Build
  agents are driven from the orchestrator session for now; porting a build-agent
  set into this repo is a backlog item.

---

## 0.1 Direction pivot (2026-05-29)

Founder declared in-session that ADR-0006 (IG launch concierge) is the wrong
product. New direction, in his words: "allow me to newly created project on
github or already hosted project make it live and get customers."

Resolution per Rule 7 (more recent wins): ADR-0006 is superseded by
**ADR-0007** (`docs/decisions/0007-pivot-to-github-to-live-and-customers.md`).
Read ADR-0007 for the new product cut. Anything in §0 above that conflicts
with ADR-0007 is deferred to ADR-0007.

What carries over from §0: the autonomous-loop discipline (§1-4), local-first
OSS preference, founder-approved generation, BYOK LLM, cassette-driven tests.

What is dropped: streetwear/IG-fashion ICP, six-feature IG/Shopify spec,
Meta-Graph-native posture. Phase 1-4 of BACKLOG.md is paused pending the
new v1 cut from ADR-0007; Phase 0 (baseline + local-first foundation +
adapter seam) stays — it's direction-agnostic.

This is direction-pivot #3 in 2 weeks. The cost discipline this implies:
overlays not rewrites. The next pivot should also be one ADR + one section.

---

## 1. The autonomous loop (self-paced + handoffs)

Each **tick** = one vertical slice toward a shippable feature. Protocol:

1. **Pick** the top unblocked item from `docs/mission/BACKLOG.md`.
2. **Evals first (A8)** — for any LLM-touching slice, write/extend eval cases
   in `evals/<feature>.{yaml,jsonl}` BEFORE the code. Slice ships only when green.
3. **Implement** the minimum slice (Rules 2/3). Delegate to a subagent; keep
   main context clean.
4. **Self-verify (A3)** — typecheck + unit test + execute the changed surface.
   For UI, load it. Never fake green.
5. **Review** — diff vs acceptance criteria (reviewer agent) before commit.
6. **Commit** — atomic, one concept, working HEAD (A6). Identity:
   `Akash Pathak <akash@lyric.tech>`.
7. **Checkpoint** — update `docs/mission/HANDOFF.md` (state, verified, next) and
   tick `BACKLOG.md`. Then schedule the next tick.

**Three-strikes hard stop (A4):** same class of error twice → STOP, restate
known-vs-assumed, surface the missing fact, propose ONE evidenced fix. Never a
third blind retry.

**Resume protocol:** a fresh session reads MISSION.md → HANDOFF.md → BACKLOG.md,
runs `git log --oneline -10` + the baseline check, and continues from the
"Next" line. Nothing lives only in chat.

---

## 2. Quality gates (non-negotiable, from CLAUDE.md doctrine)
- A2 no silent failure · A3 self-verify every change · A6 atomic commits /
  working HEAD · A8 evals before features · A10 surface uncertainty.
- HEAD is always green. A red HEAD is a P0 — fix before any new slice.
- No sloppy/speculative code (Rules 2/3). Match inherited conventions (Rule 11).

## 3. Harness discipline (steipete / Karpathy / Paperclip influences)
- **Tight feedback loops** (steipete): smallest verifiable slice; run it; never
  "I think this works." Cassette/replay so the loop is deterministic and cheap.
- **Eval-driven dev** (Karpathy "70% problem"): the eval set is the spec for
  every model-touching change; regressions become eval cases within 24h.
- **Proactive flywheel** (Paperclip): every tick ends with an explicit next
  step or a named blocker (A1) — never a silent stop.
- **Token-efficient by construction** (A5): grep before read; batch reads;
  Sonnet default, Opus only for load-bearing design/debug/review.

## 4. Pointers
- Backlog & status: `docs/mission/BACKLOG.md`
- Latest handoff: `docs/mission/HANDOFF.md` (+ dated archives in `docs/mission/handoffs/`)
- Product canon: `docs/decisions/0006-*` · `docs/operations/CHARTER_2026_05_14.md` · `docs/product/PRODUCT.md`
- Pre-pivot history: dot repo, branch `claude/launchwings-2` (this repo starts at its snapshot `d166010`).
