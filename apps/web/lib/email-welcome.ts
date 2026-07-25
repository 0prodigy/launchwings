export function renderWelcomeEmail() {
  return `<!doctype html>
<html lang="en">
<body style="background:#171717;color:#f7f7f7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:14px;color:#d97706;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 24px;">LaunchWings</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">Welcome to the waitlist.</h1>
    <p style="font-size:16px;line-height:1.6;color:#d4d4d4;margin:0 0 16px;">
      We're building the always-on growth team for solo founders: a launch-readiness audit + multi-channel orchestration + first-party attribution.
    </p>
    <p style="font-size:16px;line-height:1.6;color:#d4d4d4;margin:0 0 16px;">
      You'll get two emails from us before launch: one when MVP is in beta, one on launch day. Nothing else. No drip. No nurture sequence.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#a3a3a3;margin:0 0 24px;">
      Built in public — reply with anything you're trying to launch and we'll fold it into the test cohort.
    </p>
    <hr style="border:none;border-top:1px solid #262626;margin:24px 0;" />
    <p style="font-size:12px;color:#737373;margin:0;">
      You signed up at launchwings.com.
      To unsubscribe, just reply with "unsubscribe" — we'll handle the rest.
    </p>
  </div>
</body>
</html>`;
}
