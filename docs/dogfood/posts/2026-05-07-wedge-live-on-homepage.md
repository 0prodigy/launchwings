---
channel: x
status: draft
related_learning: 12
---

shipped today, in one AFK session, from the orchestrator:

— pnpm + turbo monorepo (apps/web hoisted, apps/api skeleton)
— Hono + tRPC api, Clerk middleware, RLS-everywhere Postgres schema
— Trigger.dev v3 + helloAgent + agent_runs persistence
— LLM wrapper (Anthropic + OpenAI) with cost tracking + cassette replay
— OTel + Sentry + Axiom wiring (degraded-OK)
— Neon-branch-per-PR + Playwright smoke pipeline

then, on top of that:

— the LaunchWings audit agent harness (packages/lrs)
— 8 working evaluators: meta-description, og-image, mixed-content, favicon, dns-proxy-posture, domain-age, hero-LLM-judge, critical-path-env
— 83 vitest cases, all in cassette-replay (no API keys needed in CI)
— /audit on launchwings.com — paste a URL, get the audit live in <30s

the wedge is live on the homepage. dogfood loop closed.

—

the bug class that started this: shipped <meta og:image> pointing at a 404 file that never existed in the repo. next.js didn't error. build was green. every share was silently broken.

we wrote the audit checklist. we didn't run it on ourselves. that's the meta-bug.

now we run it before every deploy. and we're putting it on the homepage so you can run it on yourself too.

try it: https://launchwings.com/audit
