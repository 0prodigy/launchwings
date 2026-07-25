# LRS Stage 1 Evaluator Stack — Pinned Choices

> Status: ratified per `docs/architecture/SETUP-01-monorepo-design.md` §9. Authored 2026-05-07 to stop the 18 Stage 1 evaluator tickets (`dogfood-LRS-NN-*.md`) from re-litigating tooling decisions.
>
> If a new evaluator needs something not listed here, add a row + rationale; do not silently introduce a parallel tool. The cost we are explicitly avoiding is two crawlers, three HTML parsers, and four rendering paths.

## Stack pins (Stage 1 evaluators)

| Concern | Tool | When to use it | When NOT to use it |
|---|---|---|---|
| **HTTP fetch — single URL** | Node native `fetch` (in `apps/api`) | All single-URL probes: SSL, headers, status, asset HEADs, redirect chains, OG/Twitter image fetch. | Any time you need crawl/discovery (use Firecrawl). Any time JS must execute (use Browserbase). |
| **HTTP fetch — crawl/discovery** | **Firecrawl** (Apache 2.0) | Discovering pages on a user's site (sitemap, internal links, pricing/about page detection), markdown extraction. | A single-page probe — overkill, costs an API call. Authenticated areas (Firecrawl can't auth). |
| **HTML parsing** | **cheerio** | All DOM-heuristic evaluators: CTA detector, pricing block, OG/Twitter meta extraction, footer presence, nav structure. | Anywhere we need full DOM + JS execution (use Browserbase). Anywhere we need stable AST manipulation (use unified — Stage 2 only). |
| **Headed browser** | **Browserbase** (already in research stack) | Analytics-beacon detection (`dogfood-LRS-11`), screenshots for OG/social-card visual eval, Lighthouse-as-Browser if PSI insufficient. Uses our existing Browserbase budget. | Any evaluator where cheerio + raw fetch already gives the answer. We do NOT spin a browser to read a `<title>`. |
| **Lighthouse / Core Web Vitals** | **PageSpeed Insights API** (free, 25k/day, runs from Google's infra) | All Lighthouse-derived scores (`perfScore`, `seoScore`, `a11yScore`, LCP/CLS/INP audits). Default for v1 of every Stage 1 evaluator that needs Lighthouse. | When PSI quota is exhausted or we need scenario-based runs (logged-in flows). At that point, swap to Browserbase + `lighthouse` library. Do NOT self-host Lighthouse-CI — see ADR-0002 spirit. |
| **DNS lookup** | Node `node:dns/promises` (`resolve4`, `resolve6`, `resolveCname`, `resolveTxt`, `resolveMx`) | All DNS-posture evaluators (`LRS-DNS-001`, future `LRS-CRITICAL-PATH-001`): proxy posture, MX presence, SPF/DKIM/DMARC discovery. | Anything that needs traceroute / packet-level inspection (out of scope; not a Stage 1 concern). |
| **WHOIS / domain age** | `whois-json` (npm) calling IANA referral chain | `dogfood-LRS-09` domain-age-blacklist evaluator. | Long-running monitoring — cache the answer (TTL 7d) since WHOIS rate-limits per registry. |
| **Multiregion HTTP probe** | `apps/api` HTTP client invoked from a curated Fly.io region list (initially `iad`, `lhr`, `sin`) | `dogfood-LRS-01` multiregion-probe. | We do NOT use third-party uptime services for Stage 1; Fly's existing regions are sufficient and avoid an extra vendor. |
| **LLM-as-judge** | `packages/agents/llm.ts` wrapper (planned in `SETUP-05`) calling Sonnet for judging, Haiku for cheap evaluator-side classification | `dogfood-LRS-02` hero-llm-judge and any evaluator scoring "voice/clarity/promise-strength". | Any rule-based evaluator (regex / DOM presence) — these must NOT use an LLM. LLM cost is the main runaway risk per `PRE_MORTEM`. |
| **Image probe + decode** | `sharp` (already a dep for OG generation) | Favicon, OG, Twitter image dimension/aspect-ratio checks. Reads bytes off `fetch()`'s `arrayBuffer()`. | Anything outside dimensions / format / file-size. We do not run image classification in Stage 1. |
| **TLS / SSL inspection** | Node `tls.connect` direct, with `peerCertificate` parsing | SSL validity, expiry, chain, SAN coverage. | Any evaluator that needs to test the cipher suite negotiated by a real browser — defer to Stage 2 / `qualys-ssl-labs` API on demand. |
| **Robots / sitemap parse** | Raw `fetch` + small parsers (`robots-parser`, `fast-xml-parser`) | `robots.txt` presence + parse, sitemap discovery + URL extraction. | Crawler scheduling — that's Firecrawl's job, not ours. |

## Hard rules

1. **No JS rendering unless an evaluator's acceptance criterion explicitly requires it.** Every browser session costs $$ and seconds. Default to raw fetch + cheerio.
2. **No new outbound vendor without a row in this table.** If an evaluator requires a tool not pinned above, the ticket must add a row + a "why this not an existing tool" sentence + a cost projection.
3. **Stage 1 evaluators run from `apps/api` (Fly.io).** No Stage 1 evaluator runs in a Vercel Function — see `SETUP-01-monorepo-design.md` §4 for the egress-IP and 60s-budget reasons. The static egress IP allows vendor allowlisting (`T&S-002`).
4. **Cassette every LLM-judge evaluator.** Per `SETUP-05`/`SETUP-12`. Replay-from-cassette is the only acceptable test execution mode in CI.
5. **PSI ≠ scenario test.** PageSpeed Insights probes the public landing page only. If a Stage 1 evaluator needs to be authenticated or pass through a form, it's NOT a PSI evaluator — skip and surface as Stage 2.

## Pinned versions (suggested at first use; revise via `package.json` caret pins per learnings #8)

| Package | Pin | Notes |
|---|---|---|
| `firecrawl-js` (or REST API direct) | latest stable; caret pin | Decide between SDK and direct REST when first Stage 1 evaluator imports. |
| `cheerio` | `^1.0.0` (modern API, no jQuery deprecations) | Avoid `1.0.0-rc.x` pre-releases in production. |
| `robots-parser` | latest stable | Pure Node, no surprises. |
| `fast-xml-parser` | latest stable | For sitemap.xml; we already need `xml-stream` posture for RSS Stage 2 — same dep. |
| `whois-json` | latest stable | Cache 7d server-side. |
| `sharp` | inherits from web's existing dep | Reuse the Vercel function's `sharp` install footprint. |

## Migration triggers

- **Swap PSI → Browserbase + lighthouse**: when `LRC-02` runs >25k probes/day (we'd be at >800 customers). Until then, free PSI is correct.
- **Swap cheerio → linkedom or jsdom**: only if we hit a real DOM-spec correctness bug. cheerio's API is stable and fast enough for evaluator-grade parsing.
- **Add a second crawler beside Firecrawl**: only if a customer's anti-bot posture defeats Firecrawl AND we can't pre-flight via Browserbase. At that point, Crawl4AI is the listed overflow (per `docs/research/07-oss-stack.md` line 24).
- **Self-host any of this**: never, until we can't fit on the free or cheap tier. ADR-0002's spirit applies — we are not in the infra business.

## What this doc deliberately does NOT pin

- **Stage 2/3 evaluators** — those have different needs (deeper crawls, auth flows, JS heavy SPAs). Will get their own STACK.md section once Stage 1 lands and we know which assumptions broke.
- **Agent runtime** (Trigger.dev v3 vs alternatives) — pinned in `SETUP-01-monorepo-design.md` §7.
- **DB / ORM / auth** — pinned in `SETUP-01-monorepo-design.md` §5–§6.
- **CI / deploy** — pinned in `SETUP-01-monorepo-design.md` §10–§12.

## Cross-references

- `docs/architecture/SETUP-01-monorepo-design.md` §9 — origin of this pin.
- `docs/research/07-oss-stack.md` — broader stack manifest. STACK.md is the operationally-narrow subset relevant to Stage 1 evaluators only.
- `docs/tickets/dogfood-LRS-01-multiregion-probe.md` … `dogfood-LRS-11-analytics-beacon.md` — consumers of these pins.
- `docs/decisions/0002-no-github-deploy-in-v1.md` — wedge boundary that drove "PSI not self-host" and "Browserbase not headless infra."
