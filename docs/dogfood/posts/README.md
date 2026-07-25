# Build-in-Public Post Drafts

Drafts live here as `<YYYY-MM-DD>-<slug>.md`. One file per post. Founder publishes manually until the social-posting agent ships (PRD F2 / ROADMAP Phase 3) — at which point this folder becomes the integration-test corpus for that agent.

## File format

```markdown
---
channel: x | linkedin | reddit | bluesky | threads
status: draft | ready | posted
posted_url: <url after publishing>
posted_at: <YYYY-MM-DD HH:MM>
related_learning: <learnings.md entry # if any>
---

<post body, exactly as it should ship — character count matters>
```

## Cadence

- Minimum 2× per week per the `dogfood-launch` skill.
- Every numbered entry in `docs/dogfood/learnings.md` produces at least one post draft here.
- The pinned thread on `@launchwings` is the founder's call; queue as `2026-MM-DD-pinned-*.md` when ready.

## Why a folder

The platform's social agent isn't built yet. Until it is, posts drafted here are still a real artefact — they prove the cadence, capture voice, and seed the eventual agent's training corpus. Don't wait on the platform to start posting.
