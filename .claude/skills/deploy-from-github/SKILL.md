---
name: deploy-from-github
description: INTERNAL ONLY. Deploys a GitHub repo end-to-end (Vercel build → Cloudflare DNS → SSL → env vars) for our own LaunchWings properties (marketing site, waitlist, blog). Per ADR-0002, this is NOT a customer feature in v1. Per ADR-0003, it is internal automation that informs the eventual v3 customer feature. Use it for our own dogfood deploys; never expose via product.
---

# /deploy-from-github — Internal Dogfood Deploy

> Take a GitHub repo to a live URL on our own domain in one command. **For LaunchWings's own properties only.** Per ADR-0002 + ADR-0003: do not expose to customers in v1.

## What it does

`/deploy-from-github <repo-url> [--domain <fqdn>] [--env-file <path>]`

Runs 10 steps:
1. Verify credentials.
2. Inspect repo (framework, root dir, env-var refs).
3. Create / link Vercel project.
4. Set environment variables.
5. Trigger initial deployment + stream logs.
6. (Skip in v1) — domain assumed pre-purchased manually.
7. Add Cloudflare DNS records (apex A → 76.76.21.21, www CNAME → cname.vercel-dns.com).
8. Attach domain to Vercel project; wait for SSL.
9. Healthcheck (200 in <2s, valid SSL, HSTS).
10. Append run record + prompt for `learnings.md` entry.

## When to invoke

- Initial deploy of a new LaunchWings-owned property (marketing site, waitlist, blog, internal tool).
- Re-deploys after the GitHub repo has changed (idempotent — safe to re-run).
- Setting up a new domain for an existing project.

## When NOT to invoke

- A customer asks us to deploy their repo. **Refuse.** Per ADR-0002, this is not a customer feature.
- Multi-tenant deploys.
- Container / Docker / Railway / Render targets — out of scope (Vercel only for v1).
- Database provisioning — manual via Neon/Supabase dashboard.

## Stack alignment (per ADR-0003 boundary table)

- **Hosting**: Vercel only (Hobby for dev, Pro for production). Hobby is non-commercial — must upgrade to Pro before public domain.
- **DNS**: Cloudflare DNS API. Records `proxied: false` (orange cloud OFF) — Vercel needs to validate ownership.
- **Domain registration**: skipped in v1 (Cloudflare Registrar API is in beta; doesn't support `.ai`). Operator buys manually first.
- **Secrets**: Infisical (project `launchwings-platform`, env `dev`, folder `/deploy-skill/`). Fallback: `~/.config/launchwings/deploy.env` (chmod 600).

## One-time prerequisites

Set up these credentials ONCE, store in Infisical, never commit. Rotate quarterly.

| Secret | Where to create | Scopes |
|---|---|---|
| `VERCEL_TOKEN` | https://vercel.com/account/tokens | Full Account, 90-day expiry |
| `VERCEL_TEAM_ID` | Vercel team settings → General → Team ID | n/a (identifier) |
| `CF_API_TOKEN` | https://dash.cloudflare.com/profile/api-tokens (custom token) | Zone:Read, DNS:Edit, SSL/TLS:Edit, restricted to our zones |
| `CF_ACCOUNT_ID` | Cloudflare dashboard → right sidebar of any zone | n/a |
| `GITHUB_TOKEN` | https://github.com/settings/tokens (fine-grained) | repo:read, metadata:read |
| `GH_VERCEL_INSTALL_ID` | https://github.com/settings/installations after installing https://github.com/apps/vercel | n/a |

**Verification (run once before first deploy):**
```
curl -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v2/user
curl -H "Authorization: Bearer $CF_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify
```
Both should return 200.

## The 10 steps in detail

### Step 1 — Verify credentials

Calls the two verify endpoints above. Throws on failure with actionable message ("VERCEL_TOKEN expired — create a new one at https://vercel.com/account/tokens").

### Step 2 — Inspect repo

`git clone --depth 1` into a tmpdir. Read:
- `package.json` for framework detection (per Vercel's own rules: https://vercel.com/docs/frameworks).
- All `*.{ts,tsx,js,jsx,mjs}` for `process.env.*` references → list of expected env keys.
- `pnpm-workspace.yaml` / `package.json#workspaces` for monorepo root detection.

Then delete the tmpdir. Real build runs on Vercel infra.

Detection rules:
- `dependencies.next` → `framework=nextjs`, root usually `apps/web` for our monorepo
- `dependencies.astro` → `framework=astro`
- `dependencies.remix` → `framework=remix`
- `dependencies["@sveltejs/kit"]` → `framework=sveltekit`
- Static `index.html` only → `framework=null`
- Anything else → prompt user

### Step 3 — Create / link Vercel project

```
POST https://api.vercel.com/v11/projects?teamId=$VERCEL_TEAM_ID
Body: { "name": "<derived>", "framework": "nextjs",
        "gitRepository": { "type": "github", "repo": "<owner>/<repo>" },
        "rootDirectory": "apps/web" }
```
- 200: capture `id` as `VERCEL_PROJECT_ID`.
- 409 (already exists): `GET /v9/projects/<name>` and reuse — do not fail.
- 400 "Repository not accessible": Vercel-for-GitHub app not installed; print URL `https://github.com/apps/vercel/installations/new` and pause for keypress.

Reference: https://vercel.com/docs/rest-api/reference/endpoints/projects/create-a-new-project.

### Step 4 — Set environment variables

```
POST https://api.vercel.com/v10/projects/<projectId>/env?teamId=$VERCEL_TEAM_ID
Body: [ { "key": "...", "value": "...", "type": "encrypted",
          "target": ["production","preview","development"] }, ... ]
```
- `type: "encrypted"` for secrets (default).
- `type: "plain"` only for `NEXT_PUBLIC_*`.
- Pre-flight scan: union of `process.env.*` references from step 2 vs `--env-file`. Prompt if missing.
- 400 `ENV_ALREADY_EXISTS`: fetch list with `GET /v9/projects/<id>/env`, then `PATCH /v9/projects/<id>/env/<envId>`.

Reference: https://vercel.com/docs/rest-api/reference/endpoints/projects/create-one-or-more-environment-variables.

### Step 5 — Trigger deployment + stream logs

The git integration kicks off a deployment automatically when the project is linked.

Poll for state:
```
GET https://api.vercel.com/v6/deployments?projectId=<id>&limit=1
```
Until `state ∈ {READY, ERROR, CANCELED}`.

Stream events:
```
GET https://api.vercel.com/v3/deployments/<id>/events?follow=1
```
SSE; print to terminal in real time.

Reference: https://vercel.com/docs/rest-api/reference/endpoints/deployments/get-deployment-events.

### Step 6 — Domain (skipped in v1)

Cloudflare Registrar API is beta as of April 2026; does not support `.ai`. **Operator buys domain manually.** Skill detects the zone and proceeds. If the zone is missing, fail fast: "buy `<domain>` first; here's the link: https://dash.cloudflare.com/?to=/:account/registrar".

### Step 7 — Cloudflare DNS records

Look up zone:
```
GET https://api.cloudflare.com/client/v4/zones?name=<apex>
```
Capture `result[0].id` as `CF_ZONE_ID`.

Create / upsert records (`proxied: false` is mandatory):
```
POST https://api.cloudflare.com/client/v4/zones/<zoneId>/dns_records
Body (apex): { "type":"A", "name":"@", "content":"76.76.21.21", "ttl":1, "proxied":false }
Body (www):  { "type":"CNAME", "name":"www", "content":"cname.vercel-dns.com", "ttl":1, "proxied":false }
```
- Vercel apex IP: `76.76.21.21` (https://vercel.com/docs/projects/domains/working-with-domains/add-a-domain).
- **`proxied: false` is mandatory.** Orange cloud breaks Vercel's domain validation and SSL issuance.

Conflict handling:
- `GET /dns_records?name=<apex>` first.
- If existing record content differs, show diff and prompt.
- On confirm, `PUT /dns_records/<id>` to update.
- **Never delete silently.**

Reference: https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-create-dns-record.

### Step 8 — Attach domain to Vercel project

```
POST https://api.vercel.com/v10/projects/<projectId>/domains?teamId=$VERCEL_TEAM_ID
Body: { "name": "<domain>" }
```

Vercel validates DNS, then auto-requests Let's Encrypt cert. Poll:
```
GET https://api.vercel.com/v9/projects/<id>/domains/<domain>
```
Until `verified=true` and `verification` array is empty. Up to 12 polls × 10s.

If `verification` returns TXT challenges, add them via Cloudflare DNS API and re-poll.

Reference: https://vercel.com/docs/rest-api/reference/endpoints/projects/add-a-domain-to-a-project.

### Step 9 — Healthcheck

```
curl -sS -o /dev/null -w "%{http_code} %{time_total}\n" https://<domain>
```
Expect 200 in <2s (matches the LRS Stage 1 gate — see `docs/tickets/lrc-02-stage1-evaluators.md`).

```
echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null \
  | openssl x509 -noout -issuer -dates
```
Verify issuer ∈ {Let's Encrypt, Google Trust Services} and `notAfter > today + 30d`.

```
curl -sI https://<domain> | grep -i strict-transport-security
```
Verify HSTS header is present.

If 200 fails post-SSL: dump runtime logs via `GET /v2/deployments/<id>/events?type=runtime`.

### Step 10 — Confirmation + learning prompt

Emit to stdout AND append one JSON line to `docs/dogfood/deploy-log.jsonl`:

```json
{"ts":"...","domain":"...","deploymentId":"...","durationMs":N,"framework":"nextjs",
 "vercelDashboard":"https://vercel.com/<team>/<project>","status":"success","commitSha":"..."}
```

Then prompt: **"Anything surprise you? (one line, or empty to skip):"** → append to `docs/dogfood/learnings.md`.

## Failure modes (top-of-mind)

| Mode | Detection | Recovery |
|---|---|---|
| Build fails | Deployment `state: ERROR` | Stream `/events?type=stderr`. Top-3 hints: missing env var, Node version pin, wrong `rootDirectory` |
| DNS conflict at apex | `dns_records?name=@` returns content ≠ `76.76.21.21` | Show diff, prompt y/N. On yes, `PUT` record. Never blind-delete. |
| SSL pending >2 min | `verified=false` after 12 polls | Dump `verification` TXT challenges; add via CF DNS API |
| Repo private | 403 / not-found from `POST /projects` | Print install URL `https://github.com/apps/vercel/installations/new?target_id=<owner>` and wait for keypress |
| Env var missing at runtime | Healthcheck 500 with `undefined` | Re-scan `process.env.*` vs Vercel env list, print diff |
| Vercel Hobby vs Pro | `GET /v2/teams/<id>` returns `billing.plan: "hobby"` AND non-personal domain | Block deploy: "Upgrade to Pro before public domain (per LANDING_PAGE_PLAN.md). Run `vercel teams upgrade`." |
| Cloudflare Registrar beta | Any 5xx / `.ai` not supported | Print manual purchase URL; pause |
| `proxied: true` was set on DNS | Vercel domain `verified=false` indefinitely | Loud error: "Cloudflare orange cloud is ON; turn OFF for the apex + www records or Vercel cannot validate ownership." |

## Reusable building blocks (live in `scripts/deploy/`)

Each function is small, idempotent, individually testable:

- `verifyCredentials()` → `{ vercel, cloudflare, github }: 'ok'|'fail'`
- `inspectRepo(repoUrl)` → `{ framework, rootDir, expectedEnvKeys[], packageManager, nodeVersion }`
- `ensureVercelProject({ name, repo, framework, rootDir })` → `{ projectId, alreadyExisted }`
- `setProjectEnv(projectId, vars)` → `{ created[], updated[], skipped[] }`
- `triggerDeploy(projectId, ref='main')` → `{ deploymentId, url }`
- `streamDeployEvents(deploymentId, onEvent)` → `terminalState`
- `ensureCloudflareZone(domain)` → `{ zoneId }` (throws ZoneNotFound)
- `upsertDnsRecords(zoneId, records[])` → `{ added[], updated[], conflicts[] }`
- `attachDomainToProject(projectId, domain)` → `{ verified, pendingChallenges[] }`
- `healthcheck(domain)` → `{ httpCode, latencyMs, sslIssuer, sslExpiresAt, hstsPresent }`
- `recordRun(payload)` → appends JSON line to `docs/dogfood/deploy-log.jsonl`

Errors are typed (`VercelError`, `CloudflareError`, `PreflightError`) so the orchestrator maps to the failure-modes table.

## Observability

- Per-step stdout with `[STEP N/10]` prefixes and elapsed ms.
- `docs/dogfood/deploy-log.jsonl` — append-only run log (one line per run).
- Vercel dashboard is the source of truth for build logs (don't mirror — link).
- Cloudflare dashboard is the source of truth for DNS history.
- PostHog event `internal_deploy_completed` (already in `LANDING_PAGE_PLAN.md` analytics) with `{ duration_ms, domain, framework, success }`.
- **Mandatory learning capture** at end of run.

## Out of scope for v1 internal tooling

- Container builds / Dockerfile.
- Custom domain transfers.
- Database provisioning (manual via Neon/Supabase dash).
- Multi-region deploys.
- Preview-environment lifecycle management (Vercel git integration handles per-PR previews automatically).
- Team / RBAC management.
- Rollback automation (use Vercel dashboard "promote previous deployment").
- Edge config / KV / blob.
- Customer secrets / BYOK — explicitly forbidden per ADR-0002.

## What we'll learn (informs eventual v3 customer feature)

- Real wall-clock from `git push` to live SSL.
- Frequency of DNS conflicts on apex (we suspect ~30%).
- Vercel-for-GitHub install consent friction.
- Build-failure category distribution.
- SSL issuance time variance.
- Average env-var count per project.
- Hobby-vs-Pro confusion frequency.
- Single-repo vs monorepo proportions.
- Time to "fully unattended" (zero manual interventions over 10 consecutive runs).

When this skill hits 0 manual interventions over 10 runs AND the team has shipped ≥20 internal deploys, that is the **earliest** moment we should consider productizing for customers (per ADR-0002 reversal-cost reasoning).

## Three references to copy in spirit

1. **Vercel CLI** (`vercel deploy --prod`) — terse step-prefixed output, link out to dashboard, exit non-zero with one-line summary.
2. **Coolify deploy hooks** — idempotent re-deploy on the same `(repo, project, domain)` triple.
3. **Railway templates** — single-token auth, no interactive login mid-flow.

## Junior-engineer execution checklist

Before first run:
- [ ] All six secrets in Infisical.
- [ ] `infisical login` succeeded locally.
- [ ] Vercel-for-GitHub app installed.
- [ ] Domain in Cloudflare with NS pointed at Cloudflare.
- [ ] `verifyCredentials()` passes.

Per run:
- [ ] `infisical run -- /deploy-from-github <url> --domain <fqdn> --env-file .env.deploy`
- [ ] Watch the 10-step output.
- [ ] On error, read failure-modes table; fix; re-run (idempotent).
- [ ] Confirm 200, valid SSL, expected page.
- [ ] Add ≥1 entry to `docs/dogfood/learnings.md`.

## Coordination

- @cto: any change to this skill (esp. step ordering / API endpoints) requires a code review.
- @safety-lead: any change involving secret handling requires explicit sign-off.
- @devops-product: owns this skill; updates as Vercel/Cloudflare APIs evolve.
- @ceo: only signs off on changes that move the boundary toward customer-feature creep (and that requires a fresh ADR).
