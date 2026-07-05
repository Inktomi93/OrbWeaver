// `useInvalidation` — the settings-feature accessor for the central invalidation seam (the same
// shape the chat feature uses; `createInvalidation` is the ONE event→queryFilter home in data/, gate
// no-inline-invalidate-outside-seam). The appearance mutation routes its `invalidates` filters
// through this so no surface ever touches `queryClient.invalidateQueries` directly. Identity churns
// per render (the seam is stateless + fire-and-forget) — harmless, the mutation keys off filters.

import { useQueryClient } from "@tanstack/react-query";
import type { Invalidation } from "#data";
import { createInvalidation, useTRPC } from "#data";

export function useInvalidation(): Invalidation {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return createInvalidation({ queryClient, trpc });
}
