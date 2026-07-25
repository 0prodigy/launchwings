import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { waitlist } from "@launchwings/db";
import { renderWelcomeEmail } from "@/lib/email-welcome";
import { getDbOrSkip } from "@/lib/db-optional";

export const runtime = "nodejs";

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = { email?: string; turnstileToken?: string | null };

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** Optional waitlist persistence. Best-effort: if anything fails we log a
 *  structured warn and continue — the email is what the user cares about. */
async function persistWaitlist(opts: {
  email: string;
  source: string | null;
  ip: string;
  userAgent: string | null;
}): Promise<void> {
  const db = getDbOrSkip("waitlist");
  if (!db) return;
  const emailDomain = opts.email.includes("@") ? opts.email.split("@")[1] ?? null : null;
  const ipHash = opts.ip && opts.ip !== "unknown" ? sha256Hex(opts.ip) : null;
  try {
    await db
      .insert(waitlist)
      .values({
        email: opts.email,
        source: opts.source,
        emailDomain,
        ipHash,
        userAgent: opts.userAgent,
      })
      .onConflictDoNothing({ target: waitlist.email });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "warn",
        source: "waitlist",
        message: "db_persist_failed",
        emailDomain,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}


export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Bad JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ message: "Invalid email" }, { status: 400 });
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const token = body.turnstileToken;
    if (!token) {
      return NextResponse.json({ message: "Captcha required" }, { status: 400 });
    }
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "";
    const verifyRes = await fetch(TURNSTILE_VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: turnstileSecret, response: token, remoteip: ip }),
    });
    const verify = (await verifyRes.json()) as { success?: boolean };
    if (!verify.success) {
      return NextResponse.json({ message: "Captcha failed" }, { status: 400 });
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM ?? "social@launchwings.com";
  const founderEmail = process.env.FOUNDER_EMAIL;
  const isProd = process.env.VERCEL_ENV === "production";

  if (!resendKey) {
    if (isProd) {
      console.error("[waitlist] RESEND_API_KEY missing in production — refusing signup", { email });
      return NextResponse.json(
        { ok: false, message: "Email service is not configured. Try again in a few minutes." },
        { status: 503 },
      );
    }
    console.warn("[waitlist] RESEND_API_KEY missing in dev — accepting signup but not sending emails", { email });
    return NextResponse.json({ ok: true, queued: false, dev: true });
  }

  const resend = new Resend(resendKey);

  try {
    await resend.emails.send({
      from: `LaunchWings <${fromAddr}>`,
      to: email,
      subject: "You're on the LaunchWings waitlist",
      html: renderWelcomeEmail(),
      text:
        "Hey — you're on the LaunchWings waitlist.\n\n" +
        "We're building an always-on growth team for solo founders: a launch-readiness audit + multi-channel orchestration + first-party attribution.\n\n" +
        "We'll email you twice before launch and only when something useful ships. No spam.\n\n" +
        "— Built in public, replies welcome.",
      headers: { "List-Unsubscribe": `<mailto:${fromAddr}?subject=unsubscribe>` },
    });

    if (founderEmail) {
      await resend.emails.send({
        from: `LaunchWings Signups <${fromAddr}>`,
        to: founderEmail,
        subject: `New waitlist signup · ${email}`,
        text: `New signup: ${email}\nTime: ${new Date().toISOString()}\nUA: ${req.headers.get("user-agent") ?? "unknown"}`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[waitlist] resend send failed", { email, error: message });
    return NextResponse.json(
      {
        ok: false,
        message: "Could not send confirmation email. Please try again in a few minutes.",
      },
      { status: 502 },
    );
  }

  // Persistence is best-effort and decoupled from the email-send happy path.
  // If DATABASE_URL is unset we skip silently (logged once per process).
  const reqUrl = (() => {
    try {
      return new URL(req.url);
    } catch {
      return null;
    }
  })();
  const source =
    reqUrl?.searchParams.get("utm_source") ??
    reqUrl?.searchParams.get("ref") ??
    null;
  await persistWaitlist({
    email,
    source,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, queued: true });
}
