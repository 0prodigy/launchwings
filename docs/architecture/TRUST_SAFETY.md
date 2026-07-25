# Trust, Safety & Abuse — Architecture

> Half of LaunchWings posts on a user's behalf to channels with strict anti-spam rules. One bad actor or one drift incident can damage IP reputation for the whole user base. This doc enumerates controls.

## Threat model

| Threat | Actor | Impact |
|---|---|---|
| Spammy auto-posts trigger PH/Reddit/BetaList ban | LaunchWings user | Per-user shadowban → eventually our domain blocklist |
| Cold-email abuse triggers blocklist | LaunchWings user | Mailgun/Resend domain reputation damage; SPF impact |
| Brand-damaging content (slur, false claim) auto-posted | Agent drift | User churn + PR risk |
| BYOK key exfiltrated | Compromise | Massive damage; possibly Anthropic/OpenAI quota theft |
| Prompt injection from scraped pages → SSRF or data exfil | External attacker | Account takeover or data leak |
| Cross-tenant data bleed | Bug | Existential — single biggest legal risk |

## Controls

### Outbound action gating

Every external action goes through:

```
agent → critic-refiner → monitor-model (Haiku) → policy filter → human approval gate → channel rate limiter → outbound queue → connector
```

The **monitor model** (Haiku) checks:
- PII (regex + NER): no SSN, credit cards, addresses unless explicitly marked.
- Brand-safety: no profanity, slurs, defamatory claims (LLM-judge ≥0.95).
- Prompt-injection: scan for instruction-flipping markers in source content.
- Reversibility: classify each action; irreversible (sent email, published post) → require explicit human approval if user not on autonomous mode.
- Spam fingerprint: hash-based duplicate detection across channels and tenants.

### Per-channel rules

| Channel | Hard caps | Soft rules |
|---|---|---|
| Reddit | 1 post/sub/day, 30+ day account, ≥sub karma min, no link-only posts | 95/5 value/promo |
| X | 25 posts/day/account on owned account; 0 cold DMs without prior interaction | Native content > links |
| LinkedIn | 3 posts/day company, 1/day personal, 30 connection requests/day | No gray-net auto-engagement tools |
| Cold email | 50/day/sender, warm-up domain required, SPF/DKIM/DMARC valid | Never use main brand domain for outreach |
| HN | 1 Show HN per product per year | 30+ day account, real comment history |
| BetaList | Once per product, follow Criteria 100% | Never resubmit |
| Directory RPA | Mimic human cadence (random 30–90s between fields), CAPTCHA solver allowed only if user-completed | Never log in twice in 24h to same site |

Caps are enforced at the connector layer with Redis token buckets per (tenant, channel, day).

### Founder approval modes

- **Default (Free, Starter)**: every external action requires founder approval.
- **Trusted (Pro after 30 days, Scale)**: per-agent autonomy toggle; reversible actions can ship without approval; irreversible always require it.
- **Watchdog**: even in autonomy mode, the daily morning brief lists everything that shipped and a one-click "rollback" or "report" link.

### Abuse detection (LaunchWings side)

Triggers automatic suspension:
- ≥3 takedowns / shadow-bans across any channels in 14 days.
- ≥1 verified copyright / TM complaint.
- ≥1 confirmed phishing or scam claim.
- Rapid-burst posting that violates our per-channel rules even when under cap.

Suspended tenants get a clear in-app explanation and a path to appeal.

### BYOK security

- AES-256-GCM at rest, per-tenant DEK, KEK in AWS KMS (or GCP KMS for EU residency).
- Decryption only in agent worker memory; never logged; redacted in stack traces.
- Validation on input via tiny `/messages` call.
- Rotation reminders at 30/60/90 days.
- One-click revocation propagates within 60s.
- Egress allowlist on agent workers — only approved domains (Anthropic, OpenAI, OpenRouter, configured connectors).

### Prompt-injection defense

- Untrusted text (scraped sites, user-pasted briefs, social comments) is wrapped in `<untrusted-input>` tags in prompts.
- Tool-call results are also wrapped — no concatenation of arbitrary text into instructions.
- Egress allowlist prevents agents from making external HTTP requests except to whitelisted endpoints.
- Browser automation runs in ephemeral Browserbase sessions, no shared cookies.
- Monitor model scans every agent output before any tool that has external side effects fires.

### Cross-tenant isolation

- Postgres row-level security on every multi-tenant table; every query carries `tenant_id`.
- Per-tenant Redis prefix.
- Per-tenant R2 bucket prefix.
- BYOK keys never share encryption context across tenants.
- Audit trail logs tenant_id of every action; nightly job verifies no row escapes its tenant.
- We test for cross-tenant leakage in CI: synthetic scenarios that try to read another tenant's data must fail.

### Brand-association policy

We will not host or promote launches in:
- Adult / NSFW (defines a class we don't serve).
- Regulated finance products (securities, lending).
- Health / medical claims requiring regulatory clearance.
- Crypto pump tokens, MLM, gambling, prediction markets.
- Anything illegal in any of: US, EU, UK, AU.

Enforced on signup (TOS) + a content-screen at first launch (LLM-judge against policy).

### Data deletion & PII

- "Delete my data" button → 7-day soft-delete → 30-day hard-delete with audit log.
- Sub-processor list public on /trust.
- DPA auto-counter-signed flow via Vanta/Drata.
- Voice samples are PII; encrypted at rest; user can revoke and we re-train on the next pass.

### Incident response

- On-call rotation of 2 engineers (founder + first hire).
- PagerDuty / BetterStack for P0 alerts.
- 1h initial response, 4h public update, 7d post-mortem on /trust.
- Pre-drafted templates for ToS-violation scenarios so we respond fast.

### Audit log

Append-only table mirrored to R2 nightly. Every record:
- `(tenant_id, actor, action, target, ts, meta_jsonb, hash_of_prev)`
- Hash chain detects tampering.
- Searchable in UI for the founder; aggregate for ops.

## Required reading for engineers

- OWASP LLM Top 10 (2026 edition).
- Anthropic and OpenAI Trust & Safety guidelines.
- Reddit Data API ToS.
- LinkedIn Marketing Developer Platform Terms.
- ProductHunt API ToS (CRUD limitations explicit).
- CAN-SPAM Act + GDPR Article 6/7/22 (consent + automated decisions).
