"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

function isPosthogLoaded() {
  return Boolean((posthog as unknown as { __loaded?: boolean }).__loaded);
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    if (!key || isPosthogLoaded()) return;
    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      persistence: "memory",
    });
  }, []);

  return <>{children}</>;
}
