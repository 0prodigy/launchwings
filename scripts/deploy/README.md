# scripts/deploy/

> Internal-only deployment helpers. Used by the LaunchWings team to deploy our own properties (marketing site, waitlist, blog) from a GitHub repo.
>
> **Per ADR-0003: this is internal tooling, NOT a customer feature in v1.** Do not expose any of this via product surface area without a fresh ADR.

## What lives here

This directory will hold small, composable helper scripts (Bash + TypeScript) that the `/deploy-from-github` skill orchestrates. Targets:

- Vercel deploy automation via REST API (project create + env vars + GitHub link).
- Cloudflare DNS automation (apex + www records, SSL verification).
- Pre-flight env-var scanner (greps the repo for `process.env.*` references and warns on missing values).
- Post-deploy healthcheck (curl + SSL + response time).

## Stack manifest alignment

Per `docs/research/07-oss-stack.md`:
- **Hosting**: Vercel (Hobby for dev, Pro for production — Hobby is non-commercial only).
- **DNS**: Cloudflare DNS API.
- **Domain registration**: Cloudflare Registrar primary, Porkbun for `.ai`.
- **Secrets at rest**: Infisical self-host (NOT `.env.local` in production).
- **Secrets at build time**: stored in Vercel project env vars (not in source).

## Credential inventory (one-time setup)

A team member sets these up ONCE, stores them in Infisical, never commits:

| Credential | Purpose | Where to create |
|---|---|---|
| `VERCEL_TOKEN` | deploy + project mgmt | https://vercel.com/account/tokens |
| `VERCEL_TEAM_ID` | scope to our team | Vercel team settings → General |
| `CLOUDFLARE_API_TOKEN` | DNS write | https://dash.cloudflare.com/profile/api-tokens with Zone.DNS=Edit on our zones |
| `CLOUDFLARE_ACCOUNT_ID` | scope | Cloudflare dashboard → right sidebar |
| `GITHUB_TOKEN` | OAuth on private repos | https://github.com/settings/tokens (fine-grained, repo:read) |

Rotate quarterly even though internal.

## What to expect (post-research)

The `/deploy-from-github` skill (`.claude/skills/deploy-from-github/SKILL.md`) describes the flow. Files in this directory will be filled in during DOG-* tickets next sprint, after agent research returns concrete API endpoint references.

## What this directory is NOT

- A customer-facing deploy product (per ADR-0002).
- A multi-tenant deploy orchestrator.
- A replacement for `vercel deploy` or `vc dev` for one-off local work.
- A managed-service abstraction we'd sell.

If any of those creep in, escalate to a new ADR.
