import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Trust",
  description: "Sub-processors, security, and how LaunchWings handles your data.",
};

const PROCESSORS = [
  { name: "Vercel", purpose: "Web hosting (Hobby tier during pre-launch)", region: "US/global edge" },
  { name: "Cloudflare", purpose: "DNS + Turnstile anti-bot", region: "Global edge" },
  { name: "Resend", purpose: "Waitlist welcome + founder notifications", region: "US" },
  { name: "PostHog Cloud", purpose: "Anonymous product analytics", region: "US" },
];

export default function TrustPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />
      <article className="max-w-none py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Trust</h1>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">
          What we run, what they do, and how to reach us with security questions.
        </p>

        <h2 className="mt-10 text-xl font-semibold">Sub-processors</h2>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-muted)]">
              <th className="py-2 pr-4 font-medium">Vendor</th>
              <th className="py-2 pr-4 font-medium">Purpose</th>
              <th className="py-2 font-medium">Region</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map((p) => (
              <tr key={p.name} className="border-b border-[color:var(--color-border)]">
                <td className="py-3 pr-4 font-medium">{p.name}</td>
                <td className="py-3 pr-4 text-[color:var(--color-muted)]">{p.purpose}</td>
                <td className="py-3 text-[color:var(--color-muted)]">{p.region}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-10 text-xl font-semibold">Security disclosures</h2>
        <p className="mt-2 text-[color:var(--color-muted)]">
          Email <a href="mailto:social@launchwings.com" className="underline">social@launchwings.com</a> with subject prefix <code className="rounded bg-[color:var(--color-border)] px-1">[security]</code> for anything that looks like a vulnerability, key leak, or abuse pattern. We follow a 90-day coordinated disclosure timeline. Dedicated <code>security@</code> alias coming pre-launch.
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
