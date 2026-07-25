import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@launchwings/trpc/router";

// Typed react-query proxy. The provider in components/trpc-provider.tsx wires
// the runtime client (httpBatchLink + Clerk auth header). Server components
// should NOT import this — they have no QueryClient context.
//
// The explicit `CreateTRPCReact<AppRouter, unknown>` annotation is required so
// TS doesn't emit a deep `node_modules/...` path into the build (TS2742).
export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
