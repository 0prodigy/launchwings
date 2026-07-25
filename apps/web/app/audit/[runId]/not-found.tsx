import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// LRC-01 PR6 — rendered when /audit/[runId] hits a missing or expired row.
// We don't prune anonymous runs yet, so "missing" really means "never written
// (DATABASE_URL was unset on the issuing deploy)" or "bad uuid in the URL".

export default function AuditPermalinkNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />

      <section className="flex flex-col gap-4 py-20">
        <h1 className="text-3xl font-semibold tracking-tight">
          That audit isn&apos;t here.
        </h1>
        <p className="text-[color:var(--color-muted)]">
          We couldn&apos;t find a saved audit for that link. It may have been
          issued by an older deploy that didn&apos;t persist results, or the
          id may be malformed.
        </p>
        <p className="text-[color:var(--color-muted)]">
          <Link
            href="/audit"
            className="text-[color:var(--color-accent)] hover:underline"
          >
            Run a fresh audit →
          </Link>
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
