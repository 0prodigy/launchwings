# ADR-0004 — Rename to LaunchWings; canonical domain `launchwings.com`

## Status

**Accepted** — 2026-05-07. Domain `launchwings.com` purchased by founder.

## Context

Original working concept name: **LaunchLoop** (loop = launch → measure → learn → relaunch engine metaphor). Intended domain: `launchloop.ai`.

Reality forced re-evaluation:

- `launchloop.ai` — taken.
- `launchloop.com / .io / .app / .co / .xyz / .org / .info / .dev / .so` — all taken; multiple unrelated operators including a NextJS boilerplate, an Irish founders community, a hackathon platform, a scheduling SaaS, and an AI/automation site. SEO for branded "LaunchLoop" search is fundamentally polluted regardless of TLD.
- Founder's considered fallback `launchloo.com` was vetoed by brand evaluation: "loo" = toilet across UK / Ireland / Australia / NZ / South Africa English (~100M-person audience). Every podcast / HN / Twitter mention reads as "launch toilet"; competitors weaponize within 24 hours.

Decision needed before:
- Logo / OG image work
- Social handle reservations
- Trademark filing
- Any landing-page deploy

## Decision

**Rename the brand to LaunchWings. Canonical domain: `launchwings.com` (purchased 2026-05-07). Defensive secondaries pending: `launchwings.app`, `launchwings.dev`.**

Internal product narrative still uses "loop" as the iteration metaphor (launch → measure → learn → relaunch). Customer-facing brand is **LaunchWings** with the empowerment / lift / flight metaphor ("we give your launch wings").

Updated tagline:

> **LaunchWings — your always-on growth team for solo founders. Point us at your live product; we run a launch-readiness audit, then ship you to 30+ channels and keep compounding until you hit your first paying customers.**

## Path that was taken

The deliberation considered three paths:

### Path A — Rename to LaunchCrew (`launchcrew.com`)

Brand-evaluation top score (38/40). Matches "growth team for solo founders" hero copy verbatim ("crew" = team). DNS NXDOMAIN. **Founder did not pick this.**

### Path A-alt — Rename to LaunchWings (`launchwings.com`) ✅ **CHOSEN**

Founder-proposed alternative. Brand-evaluation score 34/40. Strengths:

- Empowerment metaphor ("we give your launch wings") emotionally resonant for solopreneurs.
- Cleanest phonetics of all candidates — two single-syllable words.
- Triple-TLD defensive coverage available (`.com / .app / .dev`).
- Universal positive across major languages.
- Founder conviction (decisive — small brand-score gap to LaunchCrew is dominated by founder preference).

Mild concern: Red Bull "Gives You Wings" mental adjacency. Different Nice class (Class 32 beverages vs our Class 42 software); "LaunchWings" the compound is distinguishable. **Class 9 + Class 42 USPTO clearance is mandatory before any logo spend.**

### Path B — Keep LaunchLoop with a prefix or alternate TLD

Considered: `trylaunchloop.com`, `uselaunchloop.com`, `launchloop.run`. **Rejected** because of the severe SEO + branded-search pollution from existing unrelated launchloop.* operators. Permanent traffic leak when founders default-type `launchloop.com`.

### Other founder-proposed candidates evaluated

| Name | Score | Status |
|---|---|---|
| `launchedpilot.com` | 21 | Rejected — past tense awkward; compound parsing ambiguous |
| `thelaunchos.com` | 25 | Rejected — `launchos.com` resolves to existing operator; `the-` prefix is "second-class" workaround |
| `launchos.tech` | 25 | Rejected — `.tech` TLD = permanent traffic leak |
| `launchergrid.com` | 24 | Rejected — "grid" reads infrastructure/dev-tool; wrong metaphor for non-technical solopreneurs |
| `launchwings.com` ⭐ | 34 | **Accepted** — purchased |

## Perspectives consulted

- **Brand & phonetic evaluation (research agent a2a3c456…)** — scored 35+ candidates; vetoed launchloo; original top picks launchcrew (38), launchhand (36), launchchorus (35). Re-scored founder's later 5 proposals; launchwings (34) ranked #3 overall.
- **Domain availability scout (research agent a5d22517…)** — confirmed `launchloop.*` broadly taken; flagged the SEO pollution; identified premium domain pricing surprises elsewhere.
- **Internal deploy playbook agent (research agent aff02560…)** — confirmed Vercel + Cloudflare DNS deploy flow works on any standard `.com`; no operational concern with launchwings.com vs launchcrew.com.
- **Direct DNS check (Bash, this session)** — confirmed `launchwings.com / .app / .dev` NXDOMAIN at decision time; founder verified availability and purchased at registrar checkout.
- **@ceo** — green-lit. Brand-score gap to launchcrew (38 → 34) is small enough that founder conviction dominates. "Wings" empowerment metaphor still on-message for the ICP.
- **@growth-lead** — confirmed clean SEO (no prominent "launchwings" SaaS competitor in web search). AI-search citation friendly.
- **@safety-lead** — TM clearance Class 9 + 42 mandatory before logo spend. Red Bull adjacency is mild but worth a USPTO TESS check.
- **@cto** — operationally indifferent; deploy-from-github skill works identically on any `.com`.

## Consequences

### Positive

- Clean `.com` (AI-search-citation default, email deliverability default).
- "Wings" metaphor is universal and emotionally lifting — strong brand voice fit with solopreneurs.
- Triple-TLD defensive coverage (`.com / .app / .dev`) is unusually clean — register all three as cheap insurance.
- ~$10–15/yr standard registration at Cloudflare Registrar.
- Avoids the launchloop.* SEO pollution (5+ unrelated operators).
- One syllable shorter than "LaunchLoop" — easier to say in a podcast or pitch.

### Negative / accepted risk

- **Brand reset cost** — global find-replace across docs/agents/skills (~1 day work, completed in one commit per this ADR).
- **Red Bull mental adjacency** — Class 32 vs 42 distinguishable, but TM clearance is non-optional.
- **Loses "crew matches hero copy verbatim"** advantage that launchcrew would have had. The "wings" metaphor is one degree more abstract.

### Pre-mortem trip-wires this affects

- Improves **F3 trademark/brand takedown** trip-wire — proactive TM clearance is mandatory before logo work.
- Neutral on every other trip-wire.

## What this displaces from MVP

Nothing. Naming + domain selection sits outside the engineering MVP cut. ~$30/yr in registrar fees + 1 day of doc rewrites. Founder time, not engineer-week.

## Reversal cost

**Medium-high** now that the domain is purchased. The brand has been written into all docs and agents in a single commit (this commit). If we discover within 30 days that LaunchWings has a hard TM blocker:

- Reverse to `launchhand.com` or `launchcrew.com` — ~1 day of repo-wide find-replace.
- Cost ~$10 sunk on the abandoned domain.
- Brand confusion if any external materials shipped (mitigated: nothing has shipped externally yet — no logo, no landing page, no waitlist, no social posts).

After 30 days (logo, OG image, social handles seeded, first 100 waitlist signups):
- Reversal becomes 1–2 weeks of engineering + brand confusion + waitlist re-comms.
- Reverse only on hard TM forced rename.

## Action items

### Already complete
- [x] Buy `launchwings.com` (founder, 2026-05-07).
- [x] Global find-replace LaunchLoop → LaunchWings across all docs, agents, skills, and tickets.
- [x] Update tagline in `docs/brand/NAMING.md` and elsewhere.

### To do this week
- [ ] Buy `launchwings.app` defensively (~$14/yr at Cloudflare).
- [ ] Buy `launchwings.dev` defensively (~$13/yr at Cloudflare).
- [ ] Reserve `@launchwings` social handles on X / LinkedIn / GitHub / ProductHunt / Bluesky / Threads / Mastodon.
- [ ] Set Cloudflare auto-renew ON, 1+ year horizon.
- [ ] Enable WHOIS privacy + 2FA on registrar account.

### To do within 30 days
- [ ] USPTO TESS search for "launchwings" / "launch wings" in Class 9 + Class 42; document.
- [ ] EUIPO eSearch + WIPO Global Brand Database checks; document.
- [ ] If clear, file USPTO ITU application.
- [ ] Run our own LRS Stage 1 audit on `launchwings.com` once the dogfood landing ships (DOG-09).

## Required spec updates (this commit)

- ✅ Global find-replace LaunchLoop → LaunchWings across `docs/`, `.claude/`, `scripts/`, `README.md`.
- ✅ `launchloop.ai` → `launchwings.com` in all our intended-domain references.
- ✅ Preserved `launchloop.*` references in this ADR's Context section that describe the *external operators* with the LaunchLoop name (those companies still exist; they are not us).
- ✅ ADR file renamed `0004-domain-launchcrew-com.md` → `0004-domain-launchwings-com.md`.

## Related decisions

- ADR-0001 — template.
- ADR-0002 — no GitHub-deploy as customer feature in v1.
- ADR-0003 — internal-only GitHub-deploy tooling.
- ADR-0005 — outcome-aligned take-rate.

## Date

2026-05-07
