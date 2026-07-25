import type { Metadata } from "next";
import Link from "next/link";
import { AuditForm } from "@/components/audit-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const description =
  "Run the LaunchWings launch-readiness audit on any URL. Free demo. The same checklist we'd run before launching you to 30+ channels.";

export const metadata: Metadata = {
  title: "Audit your URL — what would the LaunchWings audit agent say?",
  description,
  alternates: { canonical: "https://launchwings.com/audit" },
  openGraph: {
    type: "website",
    title: "Audit your URL — LaunchWings",
    description,
    url: "https://launchwings.com/audit",
  },
  twitter: {
    card: "summary_large_image",
    title: "Audit your URL — LaunchWings",
    description,
  },
};

export default function AuditPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />

      <section className="flex flex-col gap-8 py-12 sm:py-20">
        <p className="text-sm font-medium tracking-wide text-[color:var(--color-accent)] uppercase">
          Free demo · no signup
        </p>

        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Audit your URL — what would the LaunchWings audit agent say?
        </h1>

        <p className="max-w-prose text-pretty text-lg text-[color:var(--color-muted)]">
          Paste a public URL. We&apos;ll run the same launch-readiness checks we&apos;d
          run on you before shipping you to Product Hunt — meta tags, OG image,
          favicon, mixed content, DNS posture, domain age, and hero copy
          framing. Results in under 30 seconds.
        </p>

        <AuditForm />

        <p className="text-xs text-[color:var(--color-muted)]">
          We don&apos;t store your URL or your results. 5 audits per hour per IP.
          Public production URLs only — no localhost, no internal hosts.
        </p>
      </section>

      <section className="grid gap-6 border-t border-[color:var(--color-border)] py-12 sm:grid-cols-3">
        <article className="flex flex-col gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            What we check
          </h2>
          <p className="text-sm leading-relaxed text-[color:var(--color-muted)]">
            Stage 1 of our 76-item launch checklist: meta description length,
            OG/twitter image, favicon presence, mixed-content warnings, DNS
            proxy posture, domain age, and hero-copy clarity.
          </p>
        </article>
        <article className="flex flex-col gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            Why this matters
          </h2>
          <p className="text-sm leading-relaxed text-[color:var(--color-muted)]">
            Half the launches we see fail before the first visitor arrives —
            broken OG images on Twitter, descriptions truncated mid-sentence on
            Google, no favicon in the tab. We won&apos;t let you launch broken.
          </p>
        </article>
        <article className="flex flex-col gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            Want the rest?
          </h2>
          <p className="text-sm leading-relaxed text-[color:var(--color-muted)]">
            This demo runs 7 of the 76 checks. The rest live behind the
            waitlist —{" "}
            <Link
              href="/"
              className="text-[color:var(--color-accent)] hover:underline"
            >
              join here
            </Link>
            .
          </p>
        </article>
      </section>

      <section className="border-t border-[color:var(--color-border)] py-8 text-xs text-[color:var(--color-muted)]">
        <p>
          Built in public.{" "}
          <a
            href="https://github.com/0prodigy/dot"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-[color:var(--color-fg)]"
          >
            Source on GitHub
          </a>{" "}
          ·{" "}
          <Link href="/" className="hover:text-[color:var(--color-fg)]">
            Join the waitlist
          </Link>
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
