// The live per-workload adapter — joins the `workloads` room for one active row (SSE-1 S5). A `progress`
// event buffers locally at the row (transient, never the query cache); every other event means the row's
// persisted state changed, so it invalidates workloads.list through the central seam. Mounted per active
// row by the Workloads pane; a terminal event invalidates → the row leaves the active set → the room
// detaches with it.
//
// EVERY NON-PROGRESS EDGE IS THE SAME REACTION — refetch the list — which is exactly why this room can
// `collapse` under socket backpressure: the durable `progress` column + `workloads.list` are the truth
// (D117 (10)), and a dropped frame costs a redraw, never a fact.

import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Invalidation, Trpc } from "#data";
import { useTRPC } from "#data";
import type { WorkloadProgressView } from "../lib/workloads-model.ts";
import { useWorkloadSubscription } from "./use-workload-subscription.ts";

type WorkloadListItem = inferOutput<Trpc["workloads"]["list"]>[number];

export interface WorkloadStreamDeps {
  readonly workloadId: WorkloadListItem["id"];
  readonly invalidation: Invalidation;
  /** Row-local progress buffer sink — a `useState` setter at the row, never a cache/store write. */
  readonly onProgress: (progress: WorkloadProgressView) => void;
}

/** Tail one active workload's room: progress → the row buffer, everything else (state change, room fault,
 *  reconnect gap-heal) → invalidate `workloads.list` through the central seam. */
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
    onSocketLive: refetchList,
  });
}
