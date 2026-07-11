// The live per-workload stream adapter — subscribes `workloads.subscribe` (SSE: replay-then-live,
// every yield `tracked(seq)`) for ONE active row and drives freshness the sanctioned §11.1 way:
//   • a `progress` event buffers LOCALLY at the row (`onProgress` → row `useState`) — transient
//     progress never touches the query cache or a store (the `bus-onData-no-store-write` discipline);
//   • every OTHER event (`started`/`status`/`succeeded`/`failed`/`cancelled`) means the row's
//     PERSISTED state changed → one path-invalidate of `workloads.list` through the central seam
//     (never inline cache surgery — the use-inbox-stream.ts pattern);
//   • each transition INTO the live state gap-heals with the same invalidate (connect + reconnect —
//     a redundant refetch is cheap + idempotent; a missed terminal is a stuck "Running" row).
// Mounted per ACTIVE row (queued/running/cancelling) by the Workloads pane; a terminal event
// invalidates → the refetched row leaves the active set → the subscription unmounts with it.

import type { inferOutput } from "@trpc/tanstack-react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import type { Invalidation, Trpc } from "#data";
import { useTRPC } from "#data";
import type { WorkloadProgressView } from "../lib/workloads-model";

const PERCENT_SCALE = 100;

// The branded WorkloadId as the wire carries it — derived off the LIST row (`inferInput` doesn't
// decorate subscription procedures, and the subscribe input's brandedId parses from `unknown`).
type WorkloadListItem = inferOutput<Trpc["workloads"]["list"]>[number];

export interface WorkloadStreamDeps {
  readonly workloadId: WorkloadListItem["id"];
  /** The central invalidation seam (`useInvalidation()` at the caller). */
  readonly invalidation: Invalidation;
  /** Row-local progress buffer sink (a `useState` setter at the row — never a cache/store write). */
  readonly onProgress: (progress: WorkloadProgressView) => void;
}

/** Tail one active workload's SSE stream: progress → the row buffer, everything else → invalidate. */
export function useWorkloadStream({
  workloadId,
  invalidation,
  onProgress,
}: WorkloadStreamDeps): void {
  const trpc = useTRPC();
  const refetchList = (): void => {
    invalidation.invalidateFilters([trpc.workloads.list.pathFilter()]);
  };
  useSubscription(
    trpc.workloads.subscribe.subscriptionOptions(
      { workloadId },
      {
        onData: (envelope) => {
          const event = envelope.data;
          if ("__subscriptionError" in event) {
            // The typed terminal frame (the row vanished / became invisible) — reconcile the read.
            refetchList();
            return;
          }
          if (event.type === "progress") {
            const { pct, current, total, message } = event.progress;
            const derivedPct =
              pct ??
              (current !== undefined && total !== undefined && total > 0
                ? Math.round((current / total) * PERCENT_SCALE)
                : null);
            const label =
              message ??
              (current !== undefined && total !== undefined ? `${current} of ${total}` : null);
            onProgress({ pct: derivedPct, label });
            return;
          }
          // started / status / terminal — the persisted row changed; refetch through the seam.
          refetchList();
        },
        onConnectionStateChange: (connection) => {
          // `pending` = live (idle → connecting → pending) — heal on each arrival (connect + reconnect).
          if (connection.state === "pending") {
            refetchList();
          }
        },
      },
    ),
  );
}
