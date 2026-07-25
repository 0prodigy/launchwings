import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const description =
  "Specialist agents that audit your launch readiness, ship to 30+ channels in your voice, and run growth until you hit your first paying customers.";

export const metadata: Metadata = {
  title: "About — LaunchWings",
  description,
  alternates: { canonical: "https://launchwings.com/about" },
  openGraph: {
    type: "website",
    title: "About — LaunchWings",
    description,
    url: "https://launchwings.com/about",
  },
  twitter: {
    card: "summary_large_image",
    title: "About — LaunchWings",
    description,
  },
};

const DO_LIST = [
  "Gate your launch on a 76-item readiness audit and refuse to ship until the basics pass.",
  "Orchestrate submissions, posts, outreach and SEO across 30+ channels in your voice.",
  "Measure first-party attribution back to the channel and message that brought each customer.",
];

const NOT_LIST = [
  "Not Lovable, Bolt, v0, Cursor or Replit — they build the product. We launch it.",
  "Not Vercel, Netlify or Railway — they deploy the product. We require a live URL on signup.",
  "Not Product Hunt, BetaList or Indie Hackers — they are destinations. We are the conductor that gets you onto them.",
];

const ROADMAP = [
  {
    title: "Pre-launch orchestration",
    body: "From the day you sign up to launch day: 40+ tasks across 8 channels — directories, social drafts, programmatic SEO, cold outreach, journalist pitches, waitlist + referral mechanics. One daily digest, you approve, we run.",
  },
  {
    title: "Launch day, coordinated",
    body: "Product Hunt lock-in, HN Show, Reddit, X, LinkedIn, BetaList go-live and the newsletter blast all timed off one schedule. A live dashboard with 5-second refresh; an orchestrator that reacts when rank slips or a journalist replies.",
  },
  {
    title: "First revenue, not first signup",
    body: "Post-launch loops keep compounding for 90 days: outreach, SEO, reviews, pricing experiments. The Insight Agent surfaces the one thing to do tomorrow.",
  },
  {
    title: "Dashboard with first-party attribution",
    body: "Stripe, Lemon Squeezy, Paddle and Polar wired in, so you can see which channels and messages actually brought paying customers — not just signups or upvotes.",
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />

      <article className="flex flex-col gap-16 py-16 sm:py-24">
        <header className="flex flex-col gap-6">
          <p className="text-sm font-medium tracking-wide text-[color:var(--color-accent)] uppercase">
            About the project
          </p>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            LaunchWings is the launch team solo founders hire when they realise building was the easy part.
          </h1>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Why this exists</h2>
          <p className="text-pretty text-[color:var(--color-muted)]">
            Solo founders in 2026 ship products in days. Cursor, Lovable, v0, Bolt and Replit Agent collapsed the cost of building to roughly zero. The cost of getting customers did not move. The market has more half-finished SaaS products than at any point in history, and almost none of them get past zero.
          </p>
          <p className="text-pretty text-[color:var(--color-muted)]">
            A funded startup runs a launch with a content marketer, a community manager, a growth engineer, a PR lead and a support lead. A solo founder cannot afford that team and cannot do the same work alone. The bottleneck is distribution, not creation.
          </p>
          <p className="text-pretty text-[color:var(--color-muted)]">
            LaunchWings replaces that team with specialist agents, plus the integrations to act on every channel that matters, plus an observability layer so the founder can see what is working in real time. Always-on growth team, hire price of a SaaS subscription.
          </p>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-xl font-semibold tracking-tight">What we do, and what we don&apos;t</h2>
          <p className="text-pretty text-[color:var(--color-muted)]">
            We gate your launch on readiness, then actually go and acquire customers for you across every channel — not just give you another place to post about it. The boundary works both ways and we keep it explicit.
          </p>
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="flex flex-col gap-3 border-l border-[color:var(--color-accent)] pl-4">
              <h3 className="text-sm font-semibold tracking-tight uppercase text-[color:var(--color-accent)]">
                What we do
              </h3>
              <ol className="flex flex-col gap-3 text-sm leading-relaxed text-[color:var(--color-muted)]">
                {DO_LIST.map((item, i) => (
                  <li key={item} className="flex gap-3">
                    <span className="font-mono text-[color:var(--color-fg)]">{i + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-3 border-l border-[color:var(--color-border)] pl-4">
              <h3 className="text-sm font-semibold tracking-tight uppercase text-[color:var(--color-muted)]">
                What we are not
              </h3>
              <ol className="flex flex-col gap-3 text-sm leading-relaxed text-[color:var(--color-muted)]">
                {NOT_LIST.map((item, i) => (
                  <li key={item} className="flex gap-3">
                    <span className="font-mono text-[color:var(--color-fg)]">{i + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">How we work</h2>
          <p className="text-pretty text-[color:var(--color-muted)]">
            Specialist agents do the actual work — drafting copy, submitting to directories, sending outreach, running A/B tests, writing programmatic SEO. They share one voice profile, one audit gate, and one revenue-attribution layer so nothing they ship contradicts the rest. The founder approves a daily digest and the agents run.
          </p>
          <p className="text-pretty text-[color:var(--color-muted)]">
            The launch-readiness audit is one part of that. It runs on every deploy of every product we touch — including the ones we publish ourselves. Same evaluators, same bar, same gate.
          </p>
          <p className="text-pretty text-[color:var(--color-muted)]">
            Run it on your URL at{" "}
            <Link href="/audit" className="text-[color:var(--color-fg)] underline underline-offset-4 hover:text-[color:var(--color-accent)]">
              /audit
            </Link>
            . Free, no signup, results in about a minute.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">What is coming next</h2>
          <p className="text-pretty text-[color:var(--color-muted)]">
            MVP is targeted for Q3 2026. Roughly in this order:
          </p>
          <ul className="flex flex-col gap-5">
            {ROADMAP.map(({ title, body }) => (
              <li key={title} className="flex flex-col gap-1">
                <span className="text-sm font-semibold tracking-tight">{title}</span>
                <span className="text-sm leading-relaxed text-[color:var(--color-muted)]">{body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-4 border-t border-[color:var(--color-border)] pt-12">
          <h2 className="text-xl font-semibold tracking-tight">Try it</h2>
          <p className="text-pretty text-[color:var(--color-muted)]">
            Paste your URL into{" "}
            <Link href="/audit" className="text-[color:var(--color-fg)] underline underline-offset-4 hover:text-[color:var(--color-accent)]">
              /audit
            </Link>
            {" "}to get the same launch-readiness audit we run on ourselves before every deploy. Free, no signup, takes about a minute.
          </p>
          <div>
            <Link
              href="/audit"
              className="inline-flex items-center gap-2 rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-accent-fg)] hover:opacity-90"
            >
              Run the audit
            </Link>
          </div>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
