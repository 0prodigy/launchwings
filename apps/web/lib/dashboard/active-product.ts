"use client";

// T2 — small client hooks for the dashboard chrome. The active product id is
// always present in the URL under /app/[productId]/*, so we lift it from the
// route params rather than threading it via context. The name lookup hits the
// same `products.list` query the sidebar switcher uses, so react-query
// deduplicates.

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";

export function useActiveProductId(): string | null {
  const params = useParams<{ productId?: string }>();
  return params?.productId ?? null;
}

export function useActiveProductName(): string | null {
  const id = useActiveProductId();
  const query = trpc.products.list.useQuery();
  if (!id) return null;
  const match = query.data?.products.find((p) => p.id === id);
  if (match) return match.name;
  // Fall back to the id so callers always have something printable while the
  // list is loading or if the row has been pruned.
  return id;
}
