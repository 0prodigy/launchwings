## LRS-DNS-001 — DNS proxy-posture check + auto-fix for misproxied origins

**Intent**: Stage 1 needs a DNS-posture evaluator that catches the predictable "Cloudflare orange-cloud on top of Vercel" trap. Source: `docs/dogfood/learnings.md` entry #9 (2026-05-07 — `www.launchwings.com` returned Cloudflare Error 1016 because `www` was proxied through Cloudflare while pointing at `cname.vercel-dns.com`). Generalises to any record where the origin is a build-platform vendor (Vercel/Netlify/Railway/Fly) and to any underscore-prefixed protocol-discovery record (e.g. `_domainconnect`, `_dmarc`, `_acme-challenge`, `_sip._tls`) — proxying these is always wrong.

**Acceptance (evaluator)**:
- `dnsProxyPosture` evaluator (id: `LRS-DNS-001`).
- Resolve apex + `www` via `node:dns/promises` (`resolve4`, `resolve6`). Detect Cloudflare-edge IPs by CIDR match against the published edge ranges:
  - IPv4: `104.16.0.0/12`, `104.21.0.0/16`, `172.64.0.0/13`, `172.67.0.0/16`.
  - IPv6: `2606:4700::/32`.
- Probe a small list of common underscore-prefixed records (`_domainconnect`, `_dmarc`, `_acme-challenge`, `_dnsauth`, `_sip._tls`) — flag any that resolve through Cloudflare-edge IPs (proxy=on is wrong for protocol-discovery records).
- Probe known build-platform CNAME targets (`*.vercel-dns.com`, `*.vercel.app`, `*.netlify.app`, `*.railway.app`, `*.fly.dev`) — flag any that resolve via Cloudflare-edge IPs (the Error 1016 trap).
- **Verdict ladder**:
  - `pass` — no problematic combinations.
  - `warn` — one underscore-prefixed record resolves to Cloudflare edge.
  - `fail` — any vercel/netlify/railway/fly target resolves through Cloudflare edge (the Error 1016 trap), OR multiple underscore records are misproxied.
- **Evidence**: per-record `{ name, type, value, isCloudflareEdge: bool, isProblematic: bool, reason: string }` array suitable for the founder UI.
- **Fix action**: deep-link to the Cloudflare DNS UI for the affected zone with the specific record highlighted. One-paragraph "do this" instruction in the eval result; the auto-fix one-click flow is captured for a later ticket (out of scope for the evaluator).

**Live verification target** (post-fix on launchwings.com):
- Apex `launchwings.com` resolves to `76.76.21.21` (Vercel, gray cloud).
- `www.launchwings.com` resolves to a Vercel edge IP (gray cloud), NOT a Cloudflare edge IP.
- No `_*` records misproxied.

**Out of scope** (deliberately):
- One-click auto-fix that mutates Cloudflare DNS records on the user's behalf — that requires the Cloudflare API token broker (`DEPLOY-001`). The evaluator only diagnoses + deep-links.
- Probing every possible CNAME — we only walk a curated list of platform-vendor CNAMEs and the underscore-prefixed records observed in the wild.
- Multi-region resolution (`LRS-01` covers that).

**Estimate**: 0.5d. **Owner**: AI eng. **Deps**: `node:dns/promises` (Node stdlib; no new dep).

**Bundle (per docs/research/06-feature-bundles.md)**: Bundle 2 (audit) + Bundle 6 (DNS connectors).

**Related**: `docs/dogfood/learnings.md` #9; `docs/architecture/STACK.md` "DNS lookup" row.
