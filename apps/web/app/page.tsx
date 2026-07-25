import { WaitlistForm } from "@/components/waitlist-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroBanner } from "@/components/hero-banner";
import {
  CheckCircle2,
  Compass,
  LineChart,
  PenLine,
} from "lucide-react";

const FEATURES = [
  {
    icon: CheckCircle2,
    title: "Won't let you launch broken",
    body: "Paste your URL. Get a launch-readiness audit in under a minute — meta tags, OG image, mixed content, DNS posture, analytics, hero copy. Free, no signup.",
  },
  {
    icon: PenLine,
    title: "Drafts every channel in your voice",
    body: "X threads, LinkedIn posts, Reddit, Bluesky, Threads. One product brief, drafts everywhere, your tone. You approve, we run.",
  },
  {
    icon: Compass,
    title: "Submits to 30+ launch directories",
    body: "Product Hunt, BetaList, AlternativeTo, SaaSHub, G2, Indie Hackers, Show HN, Lobsters, more. Forms pre-filled, manual posts copy-paste-ready, you bulk-approve.",
  },
  {
    icon: LineChart,
    title: "Tells you the one thing to do tomorrow",
    body: "Daily brief reads your KPIs and surfaces the highest-leverage next move. Stripe + Lemon Squeezy + Paddle attribution so the metric is paying customers, not signups.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />

      <section
        id="waitlist"
        className="flex scroll-mt-12 flex-col gap-8 py-16 sm:py-24"
      >
        <HeroBanner />

        <p className="text-sm font-medium tracking-wide text-[color:var(--color-accent)] uppercase">
          Joining the waitlist · MVP shipping Q3 2026
        </p>

        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Your always-on growth team for solo founders.
        </h1>

        <p className="max-w-prose text-pretty text-lg text-[color:var(--color-muted)]">
          Point us at your live product. We audit it, draft every channel in your voice, submit you to 30+ directories, and keep recommending the next move — until you hit your first paying customers.
        </p>
        <p className="max-w-prose text-sm text-[color:var(--color-muted)]">
          Or skip the pitch and{" "}
          <a
            href="/audit"
            className="text-[color:var(--color-fg)] underline underline-offset-4 hover:text-[color:var(--color-accent)]"
          >
            run the audit on your URL
          </a>
          {" "}— takes about a minute.
        </p>

        <WaitlistForm />

        <p className="text-xs text-[color:var(--color-muted)]">
          No spam, ever. We&apos;ll email you twice before launch and only when something useful ships.
        </p>
      </section>

      <section className="grid gap-8 border-t border-[color:var(--color-border)] py-16 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <article key={title} className="flex flex-col gap-3">
            <Icon
              aria-hidden="true"
              className="size-5 text-[color:var(--color-accent)]"
            />
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <p className="text-sm leading-relaxed text-[color:var(--color-muted)]">
              {body}
            </p>
          </article>
        ))}
      </section>

      <SiteFooter />
    </main>
  );
}
