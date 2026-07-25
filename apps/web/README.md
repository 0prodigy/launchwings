# LaunchWings — apps/web

The marketing landing + waitlist for `launchwings.com`. Next.js 15 + Tailwind v4 + Resend + PostHog + Cloudflare Turnstile.

## Quick start

```bash
cd apps/web
cp .env.local.example .env.local   # fill in real values
pnpm install                       # or npm install / yarn install
pnpm dev                           # http://localhost:3000
```

The dev server runs without env vars; the waitlist API logs `RESEND_API_KEY missing` and accepts signups without sending email so you can test the form.

## What's in here

- `app/page.tsx` — landing hero + 3 features + waitlist form
- `app/api/waitlist/route.ts` — POST handler: validates email, verifies Turnstile, sends Resend welcome + founder notification
- `app/privacy`, `app/terms`, `app/trust` — required Stage-1 trust pages (drafts)
- `app/robots.ts`, `app/sitemap.ts` — SEO basics
- `components/posthog-provider.tsx` — analytics SDK init (client-only)
- `components/waitlist-form.tsx` — accessible form with Turnstile widget
- `components/site-header.tsx`, `components/site-footer.tsx` — shared chrome
- `lib/email-welcome.ts` — Resend HTML template

## Hosting

Pre-launch: **Vercel Hobby (free)** with custom domain `launchwings.com`. Per ADR-0003 / dogfood learnings, we upgrade to Vercel Pro on launch day OR migrate to Cloudflare Pages if commercial-use ToS becomes a problem.

See `/docs/dogfood/HANDOFF_LANDING_PAGE.md` for the deploy steps.

## Stage 1 audit (run once live)

This site must pass `docs/product/LAUNCH_READINESS_CHECKLIST.md` Stage 1 (≥16/18). Run the audit manually after first deploy and file every failing item as a ticket. We dogfood our own checklist.
