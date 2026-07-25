import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Terms",
  description: "LaunchWings waitlist terms.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />
      <article className="prose prose-invert max-w-none py-12 text-[color:var(--color-fg)]">
        <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          Last updated: 2026-05-07. This is a working draft for the waitlist period only. Full terms of service will replace this page before any paid product is offered.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Use of this site</h2>
        <p className="text-[color:var(--color-muted)]">
          LaunchWings is a pre-launch product. By joining the waitlist you agree to receive at most two non-commercial product update emails before public launch. No payments, no obligations, no automatic enrolment in any paid plan.
        </p>

        <h2 className="mt-8 text-xl font-semibold">No warranties</h2>
        <p className="text-[color:var(--color-muted)]">
          The waitlist site is provided as-is. Information is subject to change without notice.
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
