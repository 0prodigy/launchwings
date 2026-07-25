import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How LaunchWings handles your data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />
      <article className="prose prose-invert max-w-none py-12 text-[color:var(--color-fg)]">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          Last updated: 2026-05-07. This is a working draft. The final policy will replace this page before public launch.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What we collect</h2>
        <ul className="mt-2 list-disc pl-6 text-[color:var(--color-muted)]">
          <li>Your email address, when you join the waitlist.</li>
          <li>Anonymous product analytics (page views, button clicks) via PostHog.</li>
          <li>Anti-bot signals via Cloudflare Turnstile.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">Sub-processors</h2>
        <p className="text-[color:var(--color-muted)]">
          See our <Link href="/trust" className="underline">Trust page</Link> for the full list and what each one does.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Your rights</h2>
        <p className="text-[color:var(--color-muted)]">
          Reply with &quot;unsubscribe&quot; or &quot;delete my data&quot; to any LaunchWings email. We will remove you within 30 days and confirm by email.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Contact</h2>
        <p className="text-[color:var(--color-muted)]">
          <a href="mailto:social@launchwings.com" className="underline">social@launchwings.com</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
