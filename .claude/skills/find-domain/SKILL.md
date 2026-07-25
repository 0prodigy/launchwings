---
name: find-domain
description: Use when the team needs to find an available domain for a project name (or for a customer in the future). Walks through generation → phonetic + brand evaluation → availability checks → registrar choice → trademark sanity → final purchase. Codifies the playbook from ADR-0004 (LaunchWings's own naming exercise) so it can be reused.
---

# Find Domain — Playbook

> A repeatable process for taking an idea/concept and ending with a registered domain that you'd want printed on a business card. Built from LaunchWings's own naming exercise (ADR-0004).

## When to invoke

- Starting a new project, sub-brand, or feature with its own marketing surface.
- An existing project's domain is taken / sold / lost / no longer fits.
- A customer asks "help me pick a domain for my product" (this becomes a LaunchWings feature in Y2+).

## When NOT to invoke

- The domain question is settled and you're just buying the registered name. Skip to step 5.
- You're picking a subdomain of a domain you already own. Just pick one.

## The 7-step playbook

### Step 1 — Generate candidates (target 25–40)

Take 3 inputs:
- The product **concept in one sentence** ("a launch platform for solopreneurs").
- The **emotional vibe** (clear, calm, founder-friendly, slightly irreverent).
- 5 **anti-vibes** (not corporate, not buzzy, not enterprise).

Generate using these patterns (mix freely):

| Pattern | Examples |
|---|---|
| Verb + noun | LaunchWings, ShipFire, BroadcastEngine |
| Compound metaphor | RunwayLight, GlidePath, SignalFlare |
| Pronounceable invented words | Lindy, Notion, Linear, Stripe |
| Theatrical / launch-related verbs | Encore, Premiere, Ovation, Curtain, Debut |
| Verb + suffix (-ly, -fy, -er, -hq, -base, -kit, -loop) | Shipify, Launchify, Liftoffr, LaunchHQ, LaunchKit |
| Founder culture terms | Indie-X, Solo-X, Maker-X (often too generic — careful) |
| One-syllable punch | Echo, Wave, Bolt, Pulse, Kindle, Pier |
| Two-syllable rhythm | Liftoff, Beacon, Anchor, Forward |

**Hard rule: each candidate must be ≤14 letters and pronounceable on first hearing.** A founder who hears it on a podcast must be able to spell it.

### Step 2 — Phonetic + cultural sanity check

Score each candidate (1–5, 5 = best) on:

- **Phonetic clarity** — easy to say once heard; not mishearable.
- **Spelling-from-hearing** — listener types it correctly.
- **International risk** — no unfortunate meanings in Spanish, French, German, Portuguese, Mandarin, Hindi, Arabic, Korean, Japanese. **Web-search "[name] meaning [language]" for the top languages.**
- **Brand fit** — appropriate for the audience; not too cute / not too corporate.

**Veto rules** (any one = strike from list, no exception):
- Resembles a slur, vulgarity, or anatomical term in any major English dialect (UK, AU, NZ, US, IN, ZA).
  - Example killed: `launchloo` — "loo" = toilet in UK/AU/NZ English. (See ADR-0004.)
- Hard-to-spell after hearing (Quobi, Zykl, Phylos).
- Negative association in religion / politics / regional history.
- Implies a feature/promise we won't deliver ("instantly," "guaranteed," "10x," "magic").

### Step 3 — TM and SEO sanity check

For the top ~15 surviving candidates:

1. **Trademark search** — quick check at:
   - USPTO TESS (US): https://tmsearch.uspto.gov/
   - EUIPO (EU): https://euipo.europa.eu/eSearch/
   - WIPO Global Brand Database: https://branddb.wipo.int/
   Look for class 9 (software), class 35 (advertising/marketing), class 42 (SaaS/computer services).
   Document ANY hit, even adjacent — a competing TM in the same Nice class is a hard no.

2. **Search results** — Google the candidate. If the first page is dominated by a strong existing brand, you'll have a hard time ranking for branded search.

3. **Social handles** — quick check on X, Instagram, TikTok, LinkedIn, YouTube. Even if the domain is free, locked handles mean a permanent brand-fragmentation tax.

4. **AI-search** — ask Claude/ChatGPT/Perplexity "what is [name]?" If they confidently describe a different product, that's an existing brand we'd compete with.

### Step 4 — Domain availability + price check

For each surviving candidate, check **all of these TLDs** in parallel:

| TLD | Where to check | Approx Cloudflare Registrar price |
|---|---|---|
| .com | whois.com / namecheap / cloudflare | ~$10.44/yr |
| .net | same | ~$11.43/yr |
| .org | same | ~$10.50/yr |
| .io | namecheap / cloudflare | ~$36.90/yr (premium) |
| .ai | porkbun (Cloudflare doesn't sell .ai) | ~$60+/yr |
| .app | cloudflare | ~$14/yr |
| .dev | cloudflare | ~$13/yr |
| .so | namecheap / porkbun | ~$45/yr |
| .co | cloudflare / porkbun | ~$25–30/yr |
| .xyz | cloudflare | ~$10/yr |

**Default to `.com`. Only consider non-.com if the .com is taken.** Reasons:
- Solopreneurs / founders default-type `.com`.
- Email deliverability is best on `.com` (less spam-flag risk).
- AI search citations skew to `.com`.
- Resale value if abandoned.

**If the .com is parked-for-sale**, check the asking price at Sedo, Afternic, Dan.com, GoDaddy auctions. Anything over $5,000 is almost never worth it for an early-stage product unless the brand is uniquely strong.

**Premium domain warning**: many short common-word .com / .io domains are registry-priced (e.g., `pulse.com` would be tens of thousands). Always check before falling in love.

### Step 5 — Register at the cheapest reputable registrar

| Registrar | Best for | Caveats |
|---|---|---|
| **Cloudflare Registrar** | renewal price (no markup, registry rate); free WHOIS privacy; integrated DNS | requires Cloudflare DNS; doesn't support `.ai`, `.dev` (until recent update — verify); no transfers in beta TLDs |
| **Porkbun** | second-cheapest; supports `.ai`, `.so`, dozens of TLDs; free WHOIS privacy | smaller team, occasional outages |
| **Namecheap** | broad TLD support; decent UI; free WHOIS privacy | renewal prices creep up |
| **GoDaddy** | broadest TLD support; aggressive upsells | most expensive; avoid unless TLD-specific need |

**Default**: Cloudflare Registrar for `.com`. Porkbun for `.ai`. Never GoDaddy unless forced.

**Always enable**:
- WHOIS privacy (default on Cloudflare and Porkbun).
- Domain lock (prevents transfer hijack).
- Two-factor auth on the registrar account.
- Auto-renewal **on** for at least 1 year out (don't wake up to an expired domain).

### Step 6 — Sanity test the chosen name + domain

**The 5 tests** before you commit (ideally before purchase, definitely before printing on business cards):

1. **The bar test** — say "I'm building [name].com" out loud to 5 people. Did anyone smirk? Misspell? Look confused?
2. **The phone test** — leave yourself a voicemail saying "go to [name].com." Listen back. Could a stranger spell it?
3. **The Twitter test** — does `@name` exist on X? On LinkedIn? On Instagram? Inconsistent handles are a tax. If `@name` is taken, are you OK with `@get[name]` or `@try[name]`?
4. **The Google test** — does Googling `[name]` in incognito surface a confusing existing brand?
5. **The 10-year test** — say it out loud as if it were 10 years old. "Oh yeah, I use [name] for my launches." Does it land?

If any test fails badly, return to step 1. **Better to spend 2 more days finding the right name than 5 years on the wrong one.**

### Step 7 — File the ADR

Record the decision as `docs/decisions/00NN-domain-[slug].md`:
- Concept + audience.
- Top 5 candidates with scores.
- Vetoes (e.g., "launchloo killed for 'loo'").
- Final pick + TLD + registrar + price.
- Social handles secured.
- Trademark check evidence (screenshots / search dates).
- Renewal date and auto-renewal status.

## What we did at LaunchWings (live example)

See **ADR-0004** for the actual decision LaunchWings's founders made when `launchwings.com` was unavailable. Key learnings to copy:

- `launchloo.com` was rejected despite being available because of the "loo" → toilet phonetic risk in UK/AU/NZ English. **Phonetics > convenience.**
- Cheap and available beats clever and expensive: a `.com` from Cloudflare at ~$10/yr beats `.io` at ~$37/yr unless the brand specifically benefits.
- Trademark search was done at TESS + EUIPO + WIPO before commitment.
- Social handles `@[name]` were secured on X, LinkedIn, GitHub, ProductHunt **on the same day as domain purchase**.

## Anti-patterns

- **Falling in love before checking TM** — you'll waste a week.
- **Buying ten domains "just in case"** — costs add up; you'll never use 9 of them.
- **Choosing a domain because the TLD is "cool"** (.so, .xyz) — most users still default-type .com.
- **Ignoring international risk** — your future Spanish/French/German market expansion will hurt.
- **Buying via GoDaddy** — high renewal prices, aggressive upsells, opaque transfers.
- **Skipping the bar test** because you're in a hurry.
- **Not documenting the decision** — when the team grows, "why did we pick this name?" needs an answer.

## Coordination

- @ceo: signs off on the final pick (it's a brand call).
- @growth-lead: weighs in on the SEO + AI-search citation friendliness.
- @safety-lead: weighs in on TM and international-risk vetoes.
- @cto: signs off on registrar choice (operational concern).

## Reusable for customers (Y2+)

When LaunchWings matures into a v3 customer feature ("we'll find you a domain"), this skill becomes the agent's playbook. Steps 1–7 are the script the agent walks. Eventual customer-facing version uses RDAP/WHOIS API for live availability and integrates with Cloudflare/Porkbun registrar APIs for one-click purchase. **Until then, this skill is for our internal use and our customers' explicit hand-holding only.**
