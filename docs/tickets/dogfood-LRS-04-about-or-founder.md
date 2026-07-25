## DOGFOOD-LRS-04 — Add founder section + `/about` route

**Intent**: Stage 1 item 5 fails — no `/about` page and no founder section on the landing. Solo-founder products live and die on the human story. Ship it on launchwings.com AND ship the audit evaluator.

**Acceptance (site)**:
- New route `apps/web/app/about/page.tsx` with: founder photo (≥256px, served from `/public/founder-akash.jpg`), 3-paragraph "why we're building this" written in first person, contact via `mailto:social@launchwings.com`.
- Homepage `/` gains a compact "Built by" section above the footer — single sentence, founder name, link to `/about`.
- Sitemap includes `/about`.
- Verified post-deploy: `curl -I https://launchwings.com/about` returns 200; homepage HTML contains string matching `/built by|i'm|founder/i`.

**Acceptance (evaluator)**:
- `aboutOrFounder` evaluator: HEAD `${origin}/about`, `${origin}/team`, `${origin}/founders`. If none 200, scan home HTML for a `<section>` containing first-person pronouns (`I|we|my|our`) and ≥ 60 chars of body text. Fail otherwise.
- Eval set: 6 landing pages (3 with /about, 1 with inline founder, 2 without).

**Estimate**: 1d site + 0.5d evaluator. **Owner**: founder + AI eng.
