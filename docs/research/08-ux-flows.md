# Research Dossier 08 — UX Flows & Information Architecture

*Source: parallel research agent (Senior Product Designer), May 2026.*

> A solo founder using LaunchWings is at a kitchen table at 6am with cold coffee, three browser tabs open, and a launch in nine days. Every screen must respect that. The product is **a calm war-room that shows the founder exactly one thing to do next** and quietly handles the other forty.

## Three product principles

1. **Calm > clever.** Founders are anxious. Every screen reduces cortisol, not produces it. Stripe-density, Linear-pace, Vercel-confidence.
2. **One next action, always.** Surfaces never end without telling the founder what to do. Empty states are CTAs. Errors are CTAs. Success is a CTA.
3. **Voice is the moat.** Every artifact carries a voice-fidelity score; every approval/rejection trains the model. The product that *sounds like the founder* wins.

The competitive risk is not Buffer or PH — it's the next solopreneur tool that ships a *quieter* dashboard with the same agents underneath.

## 15 designed surfaces (full spec in agent transcript)

### 1. Onboarding — "wow this understood my product" by minute 4

- **Layout:** stepper rail left (Cal.com pattern), max 720px content. 7 steps: welcome → source picker → brief approval → ICP+tagline → voice sample (skippable) → live audit → dashboard arrival.
- **Step 3 narrative loader:** "Reading your homepage…" → "Identifying your audience…" → "Comparing to 8,400 SaaS launches…" Each line ~3s. The user feels work happening.
- **Step 6 live-streaming checklist:** 18 Stage-1 items appear one by one, animating spinner → green/yellow/red (Vercel deploy logs). LRS ring fills in real time.
- **Step 7 arrival:** subtle 1.2s confetti (NOT Mailchimp high-five), LRS ring animates 0→final, pulsing chip "Your top 3 fixes are ready. Want to do the first one now? (estimated 4 min)".
- **Drop-off mitigations:** magic-link "resume your launch" email at T+1h, T+24h, T+72h (never aggressive); confidence chips per ICP — if <70%, default to edit mode not approve mode.

### 2. Dashboard home — daily-driver, 60-second answer

Three questions in 60 seconds: *am I on track, what should I do today, what's working?*

- **Visual hierarchy** top-to-bottom: LRS ring (Apple Watch activity rings — the *brand* of the product), Today's actions (max 5, Linear-style), North star + 7-day spark (Stripe Dashboard numerals), streak indicator (Duolingo flame), one Insight card, channel snapshot.
- **Sticky launch banner** when launch in flight: "Launch in progress · 4h 12m elapsed · 1,204 visitors · [Open Live Dashboard]" with faint pulsing dot.
- **Empty state (Day 0):** placeholder ring at 0, CTA "Run your first audit (~90 seconds)", today's actions becomes 3-step tour, demo dashboard with anonymized data labeled "DEMO."
- **Risks mitigated:** progressive disclosure (hide Channel snapshot until LRS≥60); streak freeze for weekends (no red shame); insight rotation (track dismissals; downgrade cadence after 3-in-a-row dismiss).

### 3. Launch Readiness Checklist — guide, not chore

- **Two-pane:** sticky stage navigation left, ring + scrolling item list right.
- **Items grouped by outcome** ("Make sure people can find you"), not acronym ("SEO Plumbing"). Each item: status icon, "Fix with AI" button, time estimate ("~3 min with AI"), "Why this matters" unfold.
- **"Fix with AI" interaction:** right-side slide-over (Notion-style, 40% width), 4 stages — Diagnose → Propose (3 cards) → Preview (live iframe with change applied) → Apply ("Push to my site" if connected, "Copy snippet" if manual). Bottom: "This took the agent 47 seconds and $0.03 in tokens." (Transparency builds trust.)
- **LRS≥90 celebration:** full-page interstitial (Esc dismissable). 3 CTAs: "Schedule launch day" (primary), "Aim for Premier (Stage 3)" (secondary), "Take a screenshot" (tertiary, generates shareable card with score, our brand, our tagline — referral mechanic).

### 4. Approval Inbox — most-used screen pre-launch

3-pane (Linear × Superhuman): filters + draft list + selected preview.

**Critical: voice fidelity chip on every draft** — green ≥85, yellow 70–84, red <70. Hover reveals: "Matches your voice on lexicon, sentence length, opener pattern. Drift detected on 'industry jargon.'"

**Keyboard-first** (the soul of this surface):
```
A          Approve
E          Edit
X          Reject
R          Regenerate
J / K      Next / previous draft
[ / ]      Switch draft version
Shift+J/K  Range-select
F          Filter palette
S          Snooze
T          Send test to self
Cmd/Ctrl+K Command palette
?          Show all shortcuts
```

**Risk mitigations:**
- Approval fatigue → periodically insert an off-voice draft; if approved without edit, auto-lower agent autonomy.
- Bulk-approve sends brand-damaging post → bulk modal previews 3 *lowest* voice-fidelity drafts requiring explicit "I've reviewed these."
- Reject reasons get ignored → weekly "Voice Report" email shows what we learned + tweaks.

### 5. Live Launch Dashboard — 24h war-room

Dark-mode forced. **Hot tiles** (animated counters, Stripe digit-by-digit) and **cold tiles** (re-rank every 5 min, max 5 hot). Geo heatmap, agent feed (append-only stream, slide-in highlight), comment monitor with quick-reply.

**Mobile is critical here** — founder is at airport / in bed / replying from phone. PWA-installable. Pull-to-refresh. Haptic tap on counter increments. WebSocket throttled to 5s on mobile, paused when backgrounded.

**Risks:**
- Real-time anxiety = dopamine slot machine → "calm mode" toggle throttles updates to 60s, hides counters smaller than 5.
- PH rank slipping → contextual coaching ("Rank changes are normal — your conversion is up 0.4%. Stay focused on replies.") + agent-level rate-limit on panic-tweets.
- Pause-everything misclicked → destructive-button confirm + 5s undo + audit log.

### 6–14. Other surfaces (compressed)

- **Channel Attribution:** funnel + Sankey + per-channel table; **paying customers column permanently bold and leftmost** (anti vanity-metric). Attribution-model toggle includes plain-English explanation. Cohort benchmark suppressed when k<50 with privacy panel.
- **Insight feed:** Substack Notes × PostHog Insights. Confidence chip is *empirical from past outcomes*, not LLM self-assessment. Calibration tracked publicly.
- **Settings → Channels:** per-card status pill, last-action timestamp, healthcheck every 10 min. **BYOK panel:** validate-flow shows raw provider error + "Common causes" on failure. **Per-agent autonomy table:** HITL / Semi / Autonomous with plain-English explanations and hard guardrails always on.
- **Programmatic SEO management:** fleet view (table), per-row kebab actions, origin badge ("AI", "AI + edited", "Manual"), confirm dialog if pausing high-traffic page.
- **Cold Outreach:** persistent banner showing domain warm-up % + SPF/DKIM/DMARC + sender reputation 0–100. **Sending blocked if reputation drops** with explanation + recovery path.
- **Free LRS audit (lead magnet):** 30s loading with narrative, score reveal (gold particles ≥80, neutral <80 — never red-shame), "Share my score" → OG-card image (GitHub-Wrapped style) + tweet template. **Embed widget** for partner sites.
- **Pricing page:** "What you get" 3-section block BEFORE tier comparison. Annual default toggle. Outcome add-on as separate card below table ("Pay $0 unless we deliver").
- **Empty states:** universal rule — never sad-face emoji, never dead-end, always one clear next action. Demo dashboards with realistic anonymized data ("This is what your dashboard becomes").
- **Error UX:** plain English first sentence (what happened) + one obvious next action + logs/context behind disclosure + always one self-serve recovery (never just "support@").

### 15. Mobile contract

- **Fully works:** Approval Inbox (Tinder swipe ergonomics), Live Launch Dashboard (most-used mobile surface), Insight feed.
- **Read-only:** Programmatic SEO management, Cold Outreach sequence editor, Settings BYOK.
- **PWA install prompt** after first launch is scheduled.

## Master Information Architecture

```
LaunchWings
│
├── Marketing site (unauthenticated)
│   ├── /                                 — Home
│   ├── /audit                            — Free LRS audit (lead magnet)
│   ├── /audit/:scoreId                   — Public score share
│   ├── /pricing
│   ├── /for/[lovable|bolt|paperclip|...] — Build-platform partner pages
│   ├── /alternatives/[competitor]        — pSEO templates
│   ├── /blog, /docs, /changelog
│   ├── /privacy, /terms, /security
│   └── /embed.js                         — Audit widget
│
├── Auth (/signin, /signup, /resume?token=)
│
├── Onboarding (gated, save-and-exit)
│   /onboarding/{welcome,source,brief,positioning,voice,audit,done}
│
├── App
│   ├── /                                 — Dashboard home
│   ├── /inbox/{?filters, :draftId}
│   ├── /launches/{,/new,/:id/{plan,checklist/:itemId,artifacts,live,retro}}
│   ├── /analytics/{,/channels/:c,/funnel,/cohorts,/reports}
│   ├── /insights/:insightId
│   ├── /seo/{,/pages/:slug,/batches/new}
│   ├── /outreach/{lists/:id,sequences/:id,replies,deliverability}
│   ├── /press, /community, /referral, /reviews
│   └── /settings/{general,voice,channels,models,agents,team,billing,privacy,api}
│
├── Public per-tenant
│   ├── /share/launch/:id                 — Read-only public dashboard
│   ├── /share/score/:id                  — Score share card
│   └── /verified/:userId                 — Verified Launch badge
│
└── Admin /admin/{users,launches,moderation,cohort-stats}
```
