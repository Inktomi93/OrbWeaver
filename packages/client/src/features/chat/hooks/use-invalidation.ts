// `useInvalidation` — the central invalidation seam, instantiated from the composition-provided
// singletons in context (the tRPC options proxy + the QueryClient). `createInvalidation` is the ONE
// home for event→queryFilter mapping (data/invalidation.ts, gate no-inline-invalidate-outside-seam);
// this hook is the feature-side accessor the bus deps + the swipe mutation both build on, so no call
// site ever touches `queryClient.invalidateQueries` directly. Identity churns per render (the seam is
// stateless + fire-and-forget), which is harmless — the subscription/mutation wiring keys off ids,
// not the deps object identity.

import { useQueryClient } from "@tanstack/react-query";
import type { Invalidation } from "#data";
import { createInvalidation, useTRPC } from "#data";

export function useInvalidation(): Invalidation {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return createInvalidation({ queryClient, trpc });
}
