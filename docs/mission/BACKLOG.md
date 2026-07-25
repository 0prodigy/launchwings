# BACKLOG.md — LaunchWings autonomous build

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked
(needs a fact/cred only the founder can supply).

Ordered. Each item is one vertical, verifiable slice. Tick on completion and
record the verifying evidence. See `MISSION.md` §1 for the loop protocol.

## Status as of 2026-05-29 — direction pivot

ADR-0006 superseded by ADR-0007. Phase 1-4 below is **paused** pending
ADR-0007's v1 cut. Phase 0 continues — its items (baseline-green, local
data substrate, local run path, adapter seam, harvest legacy, OSS hygiene)
are direction-agnostic and still required.

Next backlog rewrite: after ADR-0007 lands + the founder reviews on return.
Until then, the loop works Phase 0 + writes ADR-0007-derived tickets into a
new `## Phase 1' — proposed (ADR-0007)` section as they emerge.

## Phase 0 — Baseline & local-first foundation
- [~] **P0-1 Baseline-green** — `pnpm install`; run typecheck + tests on the
  inherited tree; record what's green vs broken; inventory which code maps to
  v1 features vs legacy LRS scope. *Evidence: baseline report in HANDOFF.*
- [ ] **P0-2 Local data substrate** — docker-compose Postgres+pgvector (or PGlite
  for dev); wire `packages/db` Drizzle to it; reversible migration runs locally.
- [ ] **P0-3 Local run path** — `pnpm dev` boots web + api locally with no cloud
  creds (auth/billing/integrations off or mocked). Document in `docs/DEV_SETUP.md`.
- [ ] **P0-4 Integration adapter seam** — define `MetaGraph` + `Shopify` + `LLM`
  interfaces with mock/fixture impls (local) and real impls gated on creds.
- [ ] **P0-5 Retire/harvest legacy** — quarantine killed LRS/directory/discovery
  scope; keep monorepo, llm wrapper, cassette harness, db/trpc plumbing.
- [ ] **P0-6 OSS hygiene** — LICENSE (MIT), `.env.example`, README rewrite for
  local-first IG-concierge, CONTRIBUTING. Strip any secrets/proprietary refs.

## Phase 1 — Brand-Voice Engine (the moat)
- [ ] **BV-1 Corpus ingest (fixtures)** — load sample captions/product-copy/DM
  threads into per-tenant corpus; embed into pgvector. Eval cases first.
- [ ] **BV-2 Tone-card extraction** — Opus derives tone card from corpus; eval'd.
- [ ] **BV-3 Voiced draft + RAG retrieval** — generate a caption grounded in corpus.
- [ ] **BV-4 Learn-from-edits** — capture founder edits as correction pairs; re-weight.

## Phase 2 — Launch Playbook
- [ ] **LP-1 Playbook FSM** — draft→scheduled→pre→drop→live→urgency→recap states.
- [ ] **LP-2 Beat drafting** — each beat auto-drafted in voice; founder approve.
- [ ] **LP-3 Local scheduler** — beats fire on schedule via in-process scheduler.

## Phase 3 — Engagement + Shopify (adapter-gated)
- [ ] **EN-1 DM/comment classify + draft** (Haiku intent → Opus reply), mock channel.
- [ ] **EN-2 Auto/approve/manual per-thread modes** + audit log.
- [ ] **SH-1 Shopify connector** — order/shipping/abandoned-cart in voice (mock store).

## Phase 4 — Hot-Lead Inbox + Dashboard
- [ ] **HL-1 Composite lead scorer** (Haiku) + surfacing + won/lost feedback.
- [ ] **DB-1 Launch dashboard** — posts/DMs/hot-leads/revenue, mobile-first.

## Cross-cutting (do alongside, not last)
- [ ] **X-1 Eval suite in CI** runs on every model-touching slice (A8).
- [ ] **X-2 Build-agent set** — port implementer/reviewer/validator/eval-author
  into this repo's `.claude/agents` (currently company personas only).
