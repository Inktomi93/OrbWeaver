// `useInvalidation` — the React accessor for the central invalidation seam (`createInvalidation`,
// `./invalidation.ts`, gate `no-inline-invalidate-outside-seam`). Was copy-pasted per feature
// (chat + settings) before every call site through the composition-provided singletons in
// context (the tRPC options proxy + the QueryClient) — hoisted here so both build on the ONE
// accessor. Identity churns per render (the seam is stateless + fire-and-forget), which is
// harmless — the subscription/mutation wiring keys off ids, not the deps object identity.

import { useQueryClient } from "@tanstack/react-query";
import type { Invalidation } from "./invalidation.ts";
import { createInvalidation } from "./invalidation.ts";
import { useTRPC } from "./trpc.ts";

export function useInvalidation(): Invalidation {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return createInvalidation({ queryClient, trpc });
}
