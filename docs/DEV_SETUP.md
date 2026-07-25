# Dev setup — secrets & first-time bootstrap

This file documents how to bring the cloud surface (Neon / Trigger.dev /
Vercel — two projects: web + api) from "secrets are set, projects don't exist
yet" to "production-runnable", without ever pasting a credential outside your
local terminal or the GitHub UI.

> **Note (2026-05-08):** apps/api was migrated off Fly.io and onto Vercel
> Functions via the `hono/vercel` adapter. Fly required payment info on file
> even for the free tier; collapsing to a single provider also removes a
> dependency. apps/api now deploys as a separate Vercel project.

## Principle

The strongest secret store you already have is **GitHub repo secrets**. Don't
move anything out of it. Don't paste secrets into chats, transcripts, or local
notes. Anything bootstrapping production runs in GitHub Actions, where the
secrets already live and a redacted log is kept.

## Secrets are scoped to the `Production` Environment

All secrets in this repo live under the GitHub Actions Environment named
`Production`, NOT at the repo level. Every workflow job that needs them must
opt in:

```yaml
jobs:
  my-job:
    runs-on: ubuntu-latest
    environment: production   # <-- required to read these secrets
    env:
      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Without `environment: production`, `secrets.FLY_API_TOKEN` resolves to `''` and
the workflow silently no-ops. All workflows in `.github/workflows/` already
declare this on their job; new workflows must too.

To set or rotate a secret:

```bash
gh secret set FLY_API_TOKEN --env production --body "$(fly tokens create deploy)"
gh secret list --env production
```

## Required environment secrets (one-time)

| Secret | Purpose |
|---|---|
| `NEON_API_KEY` | Resolve the primary-branch connection URI; create per-PR branches. |
| `NEON_PROJECT_ID` | Same. |
| `TRIGGER_ACCESS_TOKEN` | Deploy `@launchwings/agents` to Trigger.dev v3. |
| `TRIGGER_PROJECT_REF` | Same. Also exposed at runtime in api. **Set before re-running setup-04.** |
| `VERCEL_TOKEN` | Deploy + env upsert for both Vercel projects. |
| `VERCEL_PROJECT_ID` | The apps/web Vercel project id. |
| `VERCEL_API_PROJECT_ID` | The apps/api Vercel project id. **One-time founder action: create the project (Root Directory: `apps/api`, Framework Preset: Other), then `gh secret set VERCEL_API_PROJECT_ID --env production --body "prj_..."`.** |
| `VERCEL_TEAM_ID` | Optional; only if the Vercel projects live under a team scope. |

Verify with `gh secret list --env production -R 0prodigy/dot`. If a secret is
missing from that list, `secrets.<NAME>` resolves to empty inside any workflow
that declares `environment: production`.

## First-time cloud bootstrap (manual dispatch, in this order)

```bash
# 0. (One-time) Create the apps/api Vercel project on the dashboard.
#       Add New → Project → import this repo
#       Root Directory: **apps/api** (the project sees this subtree as its
#         root; vercel.json + public/ + api/index.ts all live here).
#       Framework Preset: Other
#       Install / Build / Output: leave blank — apps/api/vercel.json drives
#         them with monorepo-aware `cd ../..` install and pnpm-filter build.
#    Then copy the project id:
#       gh secret set VERCEL_API_PROJECT_ID --env production --body "prj_..."

# 1. Apply migrations to the Neon primary branch + propagate DATABASE_URL
#    to BOTH Vercel projects (web + api).
gh workflow run setup-00-bootstrap.yml

# 2. Deploy the agents to Trigger.dev. The project (TRIGGER_PROJECT_REF) is
#    auto-bound by the access token; first deploy creates the deployment slot.
gh workflow run setup-04-trigger-deploy.yml
```

After step 2, all three orchestration agents are production-runnable.

## Vercel deploys are auto-triggered by git push

Both `apps/web` and `apps/api` are wired to Vercel's GitHub integration. Every
push to the default branch (`claude/solopreneur-launch-platform-PcSNn`) starts
a production deployment automatically. PRs trigger preview deployments. There
is no `setup-01b-*` workflow — Vercel owns the deploy hop end-to-end.

To force a redeploy (e.g. after rotating an env var) without touching code:

```bash
git commit --allow-empty -m "redeploy: <reason>"
git push
```

Or use the **Redeploy** button on the Vercel dashboard for the relevant
project's most recent deployment.

## Local development

You don't need any of the production secrets locally. Use a Neon **dev branch**
which you can spin up from the dashboard or via the Neon CLI:

```bash
# One-time: install the Neon CLI (alternative: copy the URL from the dashboard)
npx neonctl auth
npx neonctl branches create --name dev-$USER --project-id "$NEON_PROJECT_ID"
npx neonctl connection-string dev-$USER --project-id "$NEON_PROJECT_ID" --pooled false
npx neonctl connection-string dev-$USER --project-id "$NEON_PROJECT_ID" --pooled true
```

Paste the two URIs into `apps/web/.env.local` (gitignored):

```
DATABASE_URL=postgres://...
DATABASE_URL_POOLED=postgres://...
OPENAI_API_KEY=sk-...
```

Then:

```bash
pnpm install
pnpm --filter @launchwings/db db:migrate   # populates the dev branch schema
pnpm dev                                   # apps/web on :3000
```

`pnpm dev` reads `.env.local` automatically.

## Why not paste secrets into chat or commit a `.env`

- A pasted secret lands in chat history, in screen recordings, in tool
  transcripts, and (for the AFK orchestrator session) in the conversation
  logs that may be retained.
- A committed `.env` reaches GitHub the moment it's pushed and propagates to
  every developer's clone, every PR build's logs, and every fork. Rotating
  it is expensive: every consumer (Vercel, Fly, Trigger, local) has to be
  re-keyed in a coordinated cutover.
- The bootstrap-via-Actions path keeps the secret in one place, with one
  rotate-and-re-dispatch story.

## When in doubt

If a workflow run fails because a secret is missing, fix it with
`gh secret set <NAME>` from your laptop. Don't ask any agent (Claude included)
to take the secret in chat — re-dispatch the workflow after `gh secret set`
and the agent never has to see the value.
