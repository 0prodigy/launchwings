## DOGFOOD-LRS-07 — Ship og-default.png + OG/Twitter validation evaluator

**Intent**: Stage 1 items 10 and 11 both fail with the same root cause — `https://launchwings.com/og-default.png` returns the Next 404 HTML body (`x-next-error-status: 404`, `content-length: 10124`) despite the meta tags claiming a 1200×630 PNG. Result: every share to Twitter / LinkedIn / Slack / Discord preview is broken.

**Acceptance (site)**:
- Ship `apps/web/public/og-default.png` at exactly 1200×630, ≤ 200KB, brand-consistent.
- Optional: render OG dynamically via Next 15 `app/opengraph-image.tsx` (route handler that uses `next/og` ImageResponse) — preferred because we can vary by route.
- Verified post-deploy: `curl -sI https://launchwings.com/og-default.png` returns `200` with `content-type: image/png` and `content-length` consistent with a real PNG (not the 10124-byte 404 page).
- Cross-vendor sanity: paste the URL into Facebook Sharing Debugger, Twitter Card Validator, LinkedIn Post Inspector — all should render the card.

**Acceptance (evaluator)**:
- `ogImageValidation` evaluator: parse all `<meta property="og:image">`, `og:image:secure_url`, `<meta name="twitter:image">` tags, GET each URL, assert HTTP 200 AND `content-type: image/*` AND decoded dimensions match `og:image:width` / `og:image:height` (within 5% tolerance).
- For `twitter:card=summary_large_image`, assert image dimensions ≥ 600×314 and aspect ratio 2:1 ± 5%.
- Optional Twitter Card Validator API call when rate-limit allows; cache by URL hash for 24h.
- Closes both items 10 and 11 in the Stage 1 checklist.

**Estimate**: 0.5d site + 0.5d evaluator. **Owner**: frontend + AI eng. **Deps**: `DOGFOOD-LRS-06` (creates `apps/web/public/`).
