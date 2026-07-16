// The live per-workload stream adapter — subscribes workloads.subscribe for one active row. A `progress`
// event buffers locally at the row (transient, never the query cache); every other event means the row's
// persisted state changed, so it invalidates workloads.list through the central seam. Mounted per active
// row by the Workloads pane; a terminal event invalidates → the row leaves the active set → the
// subscription unmounts with it.

import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Invalidation, Trpc } from "#data";
import { useTRPC } from "#data";
import type { WorkloadProgressView } from "../lib/workloads-model";
import { useWorkloadSubscription } from "./use-workload-subscription";

type WorkloadListItem = inferOutput<Trpc["workloads"]["list"]>[number];

export interface WorkloadStreamDeps {
  readonly workloadId: WorkloadListItem["id"];
  readonly invalidation: Invalidation;
  /** Row-local progress buffer sink — a `useState` setter at the row, never a cache/store write. */
  readonly onProgress: (progress: WorkloadProgressView) => void;
}

/** Tail one active workload's SSE stream: progress → the row buffer, everything else (state change,
 *  stream error, reconnect) → invalidate `workloads.list` through the central seam. */
export function useWorkloadStream({ workloadId, invalidation, onProgress }: WorkloadStreamDeps): void {
  const trpc = useTRPC();
  const refetchList = (): void => {
    invalidation.invalidateFilters([trpc.workloads.list.pathFilter()]);
  };
  useWorkloadSubscription({
    workloadId,
    onProgress,
    onEvent: refetchList,
    onError: refetchList,
    onConnectionPending: refetchList,
  });
}
