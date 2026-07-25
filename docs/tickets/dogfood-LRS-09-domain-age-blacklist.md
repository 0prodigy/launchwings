## DOGFOOD-LRS-09 — Domain age + Spamhaus + Safe Browsing evaluator

**Intent**: Stage 1 item 13 needs WHOIS / RDAP for age and Spamhaus DBL + Google Safe Browsing API for blacklist status. Today launchwings.com is 1 day old (registered 2026-05-07) and unverified for blacklist.

**Acceptance**:
- LRS Audit Agent ships `domainTrust` evaluator with three sub-checks:
  1. **Age**: RDAP lookup via `https://rdap.org/domain/${host}` (no flaky parser). Compute `age_days = (now - events[?eventAction=='registration'].eventDate) / 86400`. Fail if `age_days < 1`; warn if `age_days < 30`.
  2. **Spamhaus DBL**: DNS query `${host}.dbl.spamhaus.org` — any A record returned = listed. Free, no API key, rate-limit-safe at our scale.
  3. **Google Safe Browsing**: v4 lookup endpoint `safebrowsing.googleapis.com/v4/threatMatches:find` with API key from secrets. Cache verdicts 24h.
- Evaluator output: `{age_days: number, spamhaus_listed: bool, safe_browsing_threat: string|null}`. Fail if any is bad.
- Egress allowlist updated: `rdap.org`, `*.spamhaus.org`, `safebrowsing.googleapis.com` added to the agent worker host allowlist (per learning #11).
- Live run on launchwings.com: report 1-day-old age (warn) and not listed.

**Estimate**: 1d. **Owner**: AI eng. **Deps**: `SETUP-11` (egress allowlist).
