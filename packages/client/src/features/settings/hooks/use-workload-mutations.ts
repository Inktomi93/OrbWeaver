// The Workloads pane's mutations (Settings → Workloads), one `createEntityMutation` per verb — the
// module-scope factory pattern (use-admin-mutations.ts). NONE are `busDriven`: the workload verbs emit
// on the workloads progress bus (SSE `workloads.subscribe`), not on either mapped invalidation bus, so
// each self-invalidates the `workloads.list` read on settle (path-filtered). TVars are the tRPC-INFERRED
// inputs (never a hand-restated shape). Server enforcement (singular = any authed caller; bulk =
// `requireOwner`; cancel/retry IDOR-scoped in the verb) is the floor; these toasts are the honest
// failure surface.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Enqueue a run. The realistic refusal is the single-active-per-kind lock (`CONFLICT`). */
export const useStartWorkload = createEntityMutation<
  inferInput<Trpc["workloads"]["start"]>,
  unknown
>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Couldn't start the workload — a run of that kind may already be active.",
});

/** Request a stop on an active row (`queued`/`running` → `cancelling` → `cancelled`). */
export const useCancelWorkload = createEntityMutation<
  inferInput<Trpc["workloads"]["cancel"]>,
  unknown
>({
  options: (trpc) => trpc.workloads.cancel.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Couldn't cancel the workload.",
});

/** Clone a terminal row into a fresh queued run (the original stays as the audit trail). */
export const useRetryWorkload = createEntityMutation<
  inferInput<Trpc["workloads"]["retry"]>,
  unknown
>({
  options: (trpc) => trpc.workloads.retry.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Couldn't retry the workload — a run of that kind may already be active.",
});
