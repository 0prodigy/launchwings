# Naming & Brand

## Brand: **LaunchWings** — domain `launchwings.com` (purchased 2026-05-07)

The customer-facing brand is **LaunchWings**. Canonical domain `launchwings.com` was purchased after the deliberation captured in **ADR-0004** (`docs/decisions/0004-domain-launchwings-com.md`).

The original working concept name was "LaunchLoop" (loop = launch → measure → learn → relaunch engine metaphor). When `launchloop.ai` and every common `launchloop.*` TLD turned out to be taken by ~5 unrelated operators (NextJS boilerplate, Irish founders community, hackathon platform, scheduling SaaS, AI/automation site), the brand was reconsidered. The "loop" metaphor stays internal (we still describe the iteration engine as a launch loop in product narrative); the customer-facing brand is LaunchWings, with the empowerment / lift / flight metaphor.

### Why not the alternatives

- `launchloo.com` — available but "loo" = toilet across UK / Ireland / Australia / NZ / South Africa English. Vetoed by the brand council.
- `trylaunchloop.com` / `uselaunchloop.com` / `launchloop.run` — preserved the working name but inherited permanent SEO + branded-search pollution from the existing 5 unrelated `launchloop.*` operators.
- `launchcrew.com` — top brand-evaluation score (38/40); founder did not pick.
- `launchhand.com` — runner-up (36/40); reserved as defensive backup.
- `thelaunchos.com` / `launchos.tech` / `launchergrid.com` / `launchedpilot.com` — rejected (see ADR-0004 for per-name reasons).

### Top candidates evaluated (full table in ADR-0004)

| Name | Brand score (40) | .com status | Notes |
|---|---|---|---|
| **launchwings** ⭐ | 34 | **PURCHASED** ✓ | Empowerment metaphor; clean phonetics; .com/.app/.dev all available. Red Bull mental adjacency mild concern. |
| launchcrew | 38 | NXDOMAIN ✓ | Top brand score; founder did not pick. |
| launchhand | 36 | NXDOMAIN ✓ | Defensive backup; warm tone, low TM risk. |
| launchchorus | 35 | NXDOMAIN ✓ | Multi-channel orchestration metaphor. Slightly long. |
| launchcraft | 34 | NXDOMAIN ✓ | On-brand. |
| shipchorus | 35 | NXDOMAIN ✓ | Indie-hacker register. |
| shipcrew | 36 | RESOLVES ✗ | Strong brand but domain TAKEN. |
| shipfire | 34 | RESOLVES ✗ | TAKEN. |
| trylaunchloop | n/a | NXDOMAIN ✓ | Path B (rejected). |
| uselaunchloop | n/a | NXDOMAIN ✓ | Path B (rejected). |
| launchloop.run | n/a | NXDOMAIN ✓ | Path B (rejected). |
| launchloo | 21 | NXDOMAIN | **VETOED** — "loo" = toilet in 5 English markets. |
| launchedpilot | 21 | NXDOMAIN | **REJECTED** — past tense awkward, compound parsing ambiguous. |
| thelaunchos | 25 | NXDOMAIN | **REJECTED** — `launchos.com` resolves; `the-` prefix is "second-class." |
| launchos.tech | 25 | NXDOMAIN | **REJECTED** — `.tech` TLD = permanent traffic leak. |
| launchergrid | 24 | NXDOMAIN | **REJECTED** — "grid" reads infrastructure/dev-tool, wrong metaphor for solopreneur ICP. |
| Liftoff / Orbit / Boost / Beacon / Signal / Echo | varied | TAKEN | Trademark-crowded. |

### Engine metaphor preservation

The **"loop" metaphor stays internal** to product narrative (the iteration engine: launch → measure → learn → relaunch). The customer-facing brand is LaunchWings; the product still describes its work as running launch loops on your behalf. No conceptual loss — just a brand name change.

The **"wings" metaphor** is the new customer-facing voice cue — empowerment, lift, flight. "We give your launch wings." Use sparingly to avoid sounding promotional; it lives at the brand-voice layer, not in every UI string.

## Positioning statement

> For solopreneurs who can build but can't get traction, LaunchWings is the AI-orchestrated launch platform that runs your launch end-to-end and brings your first 1,000 customers. Unlike Product Hunt or BetaList — which give you a single day of attention — LaunchWings runs an always-on growth loop with specialist AI agents across every channel.

## Tagline candidates

Per **ADR-0002** (`docs/decisions/0002-no-github-deploy-in-v1.md`), we do NOT promise deploy capability in v1; the homepage must reflect that.

**Primary** (per ADR-0002 + ADR-0004):

> **Your always-on growth team for solo founders. Point us at your live product; we run a launch-readiness audit, then ship you to 30+ channels and keep compounding until you hit your first paying customers.**

**Hero one-liner candidates** (test in order):

1. **Your always-on growth team for solo founders.** (clearest, ICP-explicit)
2. **Launch like you have a marketing team.** (outcome-first)
3. **The AI launch platform that won't let you launch broken.** (checklist as wedge)
4. **Stop building. Start launching.** (snappy)

**Rejected** (post-ADR-0002):
- ~~"From `git push` to first 1,000 customers."~~ — implies deploy capability we're not building in v1.
- ~~"Your first customers, on autopilot."~~ — over-promises and triggers the demand-failure trip-wire (`PRE_MORTEM A4`).

Lead with #1 on the homepage; A/B test against #2.

## Voice & tone

- Direct, founder-to-founder. No corporate fluff.
- Numbers-forward (we will show real customer-acquisition numbers).
- Slightly irreverent toward "growth gurus."
- The "wings" metaphor sits in the brand voice, not every UI string. Resist puns ("take flight," "lift off," "soar") past the homepage hero.
- Never: "synergy", "leverage", "10x", "unlock potential."

## Trademark posture

Per ADR-0004 action items: USPTO TESS + EUIPO + WIPO searches in Class 9 + Class 42 are mandatory before any logo spend. Red Bull "Gives You Wings" is in Class 32 (beverages); distinguishable from our Class 42 (downloadable software for marketing automation), but worth a documented clearance pass. File USPTO ITU within 30 days of clean search results.
