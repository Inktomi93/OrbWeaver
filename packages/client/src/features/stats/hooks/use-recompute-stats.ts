// The Analytics dashboard's ONE mutation: rebuild the caller's rollups from canon, awaited. Not busDriven —
// the rebuild writes the rollup tables directly (no chat/user event rides it), so it self-invalidates the
// whole `stats` router root, which is exactly the set of reads it changed.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Recompute my stats now (the direct twin of the `reconcile-stats` workload's singular arm). */
export const useRecomputeStats = createEntityMutation<inferInput<Trpc["stats"]["reconcile"]>, unknown>({
  options: (trpc) => trpc.stats.reconcile.mutationOptions(),
  invalidates: (trpc) => [trpc.stats.pathFilter()],
  errorToast: "Couldn't recompute your analytics.",
});
