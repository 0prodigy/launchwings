## DOGFOOD-LRS-08 — Trim meta description to <160 chars + add length evaluator

**Intent**: Stage 1 item 12 fails — current meta description is 172 characters, 12 over the 160 limit. Google truncates at ~155–160 chars on desktop SERP; ours will get cut mid-sentence.

**Acceptance (site)**:
- Edit `apps/web/app/layout.tsx` `description` constant to ≤ 158 chars (small buffer under 160).
- Suggested rewrite (152 chars): "Always-on growth team for solo founders. We audit your launch readiness, ship to 30+ channels in your voice, and find your first paying customers."
- Title stays at 60 chars (boundary; downstream ticket may shorten if Google's pixel-width tooling complains).
- Verified post-deploy: `curl -s https://launchwings.com/ | grep -oE 'meta name="description"[^>]+' | tr -d '\n' | wc -c` reports a value where the `content="..."` payload is ≤ 160 chars.

**Acceptance (evaluator)**:
- `metaLength` evaluator: parse `<title>` and `<meta name="description" content>`. Fail if `title.length > 60` (warn at >55) or `description.length > 160` (warn at >155).
- Pixel-width upgrade later (out of scope here): render in Google's known title font (Arial 18px) and fail if rendered width > 600px.
- Trivial eval set (5 lengths spanning under/at/over).

**Estimate**: 0.25d (literal one-line edit) + 0.25d evaluator. **Owner**: founder + AI eng.
