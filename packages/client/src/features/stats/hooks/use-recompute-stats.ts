// The Analytics dashboard's ONE mutation: rebuild the caller's rollups from canon, awaited. Not busDriven —
// the rebuild writes the rollup tables directly (no chat/user event rides it), so it self-invalidates the
// whole `stats` router root, which is exactly the set of reads it changed.
//
// The RACED refusal (a second tab / a second click that beat the disabled state) comes back as CONFLICT from
// the server's per-user single-flight gate. That is not a failure the user caused and nothing is lost — the
// running pass still lands — so the red error toast is SUPPRESSED (the `isSilencedTurnAbort` precedent) and
// the surface renders its own quiet notice instead. No polling: the running pass's own settle invalidates the
// stats root, so the freshness row tells the truth on the next success.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Recompute my stats now (the direct twin of the `reconcile-stats` workload's singular arm). */
export const useRecomputeStats = createEntityMutation<inferInput<Trpc["stats"]["reconcile"]>, unknown>({
  options: (trpc) => trpc.stats.reconcile.mutationOptions(),
  invalidates: (trpc) => [trpc.stats.pathFilter()],
  errorToast: (error) => (isRecomputeAlreadyRunning(error) ? null : "Couldn't recompute your analytics."),
});

/** The single-flight refusal: this user already has a recompute in flight (the `invite-dialog` `data.code`
 *  discrimination precedent — key on the structured code, never the message text). CONFLICT is the only
 *  code this verb refuses with (it takes no input to reject and no id to miss). */
export function isRecomputeAlreadyRunning(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  return (error as { data?: { code?: string } }).data?.code === "CONFLICT";
}
