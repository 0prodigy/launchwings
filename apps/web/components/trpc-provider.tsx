"use client";

import { useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

// Production points NEXT_PUBLIC_API_URL at the deployed apps/api Vercel project
// (e.g. https://api.launchwings.com/trpc). Local dev defaults to the Hono
// server on :3001. This must include the `/trpc` suffix — apps/api mounts the
// adapter at `/trpc/*`.
function resolveApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/trpc";
}

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Onboarding flows mutate state quickly; keep refetch behaviour
            // conservative until we have real loading skeletons.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: resolveApiUrl(),
          // Forward the Clerk session token as a Bearer header. apps/api's
          // clerkMiddleware verifies + maps clerkUserId -> { userId, tenantId }.
          // When unauthenticated (signed-out user hitting a public procedure),
          // getToken() returns null and we skip the header entirely.
          async headers() {
            const token = await getToken();
            return token ? { authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
