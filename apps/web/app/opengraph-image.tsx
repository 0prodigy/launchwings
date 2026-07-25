import { ImageResponse } from "next/og";

// Route segment config — render at build/edge, not on every request.
export const runtime = "edge";

// File-convention exports consumed by Next 15 to auto-wire <meta og:image>.
export const alt = "LaunchWings — your always-on growth team for solo founders";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens — kept in sync with apps/web/app/globals.css :root.
// Intentionally hard-coded (not imported) because next/og runs at the edge
// without access to the CSS bundle. Update both places when the palette moves.
const BG = "#171717";
const FG = "#f7f7f7";
const MUTED = "#a3a3a3";
const ACCENT = "#f59e0b";
const BORDER = "#262626";

/**
 * Default OG/Twitter card for LaunchWings.
 *
 * This route is the prototype for the per-customer dynamic OG generator we'll
 * ship in PRD F2 (per-customer launch landing). Design decisions to preserve
 * for that future work:
 *   - File-convention export shape (alt/size/contentType + default async fn)
 *     so a `[customerId]/opengraph-image.tsx` segment will Just Work.
 *   - No external font fetches and no remote image fetches — everything
 *     renders from text + tokens, which is the only shape that survives at
 *     edge runtime without per-customer asset pipelines.
 *   - Layout uses flex/inline styles only (next/og's Satori renderer does
 *     not support Tailwind classes or CSS variables).
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "80px",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Top bar — wordmark + accent dot */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "999px",
              background: ACCENT,
            }}
          />
          <div
            style={{
              fontSize: "32px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: FG,
            }}
          >
            LaunchWings
          </div>
        </div>

        {/* Headline block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            maxWidth: "1000px",
          }}
        >
          <div
            style={{
              fontSize: "28px",
              fontWeight: 500,
              color: ACCENT,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            For solo founders
          </div>
          <div
            style={{
              fontSize: "84px",
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: FG,
            }}
          >
            Your always-on growth team.
          </div>
          <div
            style={{
              fontSize: "32px",
              lineHeight: 1.4,
              color: MUTED,
              maxWidth: "900px",
            }}
          >
            Launch-readiness audit, then 30+ channels, then compound until your
            first paying customers.
          </div>
        </div>

        {/* Footer — domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${BORDER}`,
            paddingTop: "28px",
            color: MUTED,
            fontSize: "26px",
          }}
        >
          <div style={{ display: "flex" }}>launchwings.com</div>
          <div style={{ display: "flex", color: FG }}>MVP shipping Q3 2026</div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
