## DOGFOOD-LRS-06 — Ship favicon + logo assets and create `apps/web/public/`

**Intent**: Stage 1 item 9 fails completely. `/favicon.ico` 404s. There is no `apps/web/public/` directory — no static assets ship at all. The OG image (item 10) and Twitter card (item 11) fail for the same root cause.

**Acceptance (site)**:
- Create `apps/web/public/` directory.
- Generate `favicon.ico` (16/32/48 multi-resolution) + `icon.png` (512×512) + `apple-touch-icon.png` (180×180) from a single brand logo SVG. Source SVG checked in at `apps/web/public/brand/launchwings-mark.svg`.
- Generate OG image at `apps/web/public/og-default.png` (1200×630) — see `DOGFOOD-LRS-07` for the OG-specific scope.
- Add `<link rel="icon">` and `<link rel="apple-touch-icon">` to `app/layout.tsx` metadata (Next 15 picks them up automatically if they sit at the public root with conventional names — confirm during impl).
- Verified post-deploy: `curl -sI https://launchwings.com/favicon.ico` returns `200` with `content-type: image/x-icon` (or `image/vnd.microsoft.icon`); `curl -sI /apple-touch-icon.png` returns 200.

**Acceptance (evaluator)**:
- `iconPresence` evaluator: HEAD `/favicon.ico`, `/icon.png`, `/apple-touch-icon.png` plus any `<link rel~=icon>` href. For each 200, decode with `sharp` (already in our deps for OG generation) to read width/height. Fail if max(min-dim) < 256 across all icon assets; warn if no apple-touch-icon.
- Eval set: 5 sites (full set / favicon-only / 32px-only / missing / SVG-only).

**Estimate**: 0.5d brand asset gen + 0.5d evaluator. **Owner**: founder + AI eng.
