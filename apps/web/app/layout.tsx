import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { PostHogProvider } from "@/components/posthog-provider";
import { TrpcProvider } from "@/components/trpc-provider";

const siteUrl = "https://launchwings.com";
const description =
  "Always-on growth team for solo founders. We audit your launch readiness, ship to 30+ channels in your voice, and find your first paying customers.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LaunchWings — your always-on growth team for solo founders",
    template: "%s · LaunchWings",
  },
  description,
  applicationName: "LaunchWings",
  keywords: [
    "launch platform",
    "product launch",
    "solopreneur tools",
    "indie hacker tools",
    "ai launch",
    "product hunt",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "LaunchWings — your always-on growth team for solo founders",
    description,
    siteName: "LaunchWings",
    // og:image is auto-wired by app/opengraph-image.tsx (Next 15 file convention).
    // Do not set `images` here — explicit values override the file convention.
  },
  twitter: {
    card: "summary_large_image",
    title: "LaunchWings",
    description,
    // twitter:image is auto-wired by app/twitter-image.tsx.
  },
  robots: { index: true, follow: true },
  alternates: { canonical: siteUrl },
};

export const viewport: Viewport = {
  themeColor: "#171717",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="min-h-dvh antialiased">
          <TrpcProvider>
            <PostHogProvider>{children}</PostHogProvider>
          </TrpcProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
