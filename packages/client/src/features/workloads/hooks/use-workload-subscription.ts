// The ONE `workloads.subscribe` SSE adapter — decodes the stream envelope (the `__subscriptionError`
// sentinel, the `progress` event, every other lifecycle event) so a consumer supplies only its own
// reactions. The Workloads pane's per-row `useWorkloadStream` (progress → row buffer, everything else →
// invalidate) and the import `BundleWorkloadTracker` (progress → caller, terminal → resolve) both ride
// this, so the subscribe wiring lives in one home (derive-modernization §W5).
import type { WorkloadId } from "@orb/kit/ids";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "#data";
import type { WorkloadProgressView } from "../lib/workloads-model";
import { toProgressView } from "../lib/workloads-model";

// A NON-progress lifecycle event handed to `onEvent`. The subscribe stream's real payload type is
// server-internal (no client-importable event type) AND a deeply-derived trpc union that biome's own
// inference can't fully resolve, so this is a NARROW client-local VIEW of the fields the consumers read —
// the full wire event (`workloadId`/`kind`/`at` + more) is structurally assignable to it. Non-exported:
// consumers infer it off `onEvent`, and an exported feature type would trip no-inline-types.
type WorkloadLifecycleEvent =
  | { readonly type: "started" | "status" }
  | { readonly type: "succeeded"; readonly result?: unknown }
  | { readonly type: "failed"; readonly error: { readonly message: string } }
  | { readonly type: "cancelled" };

interface WorkloadSubscriptionHandlers {
  readonly workloadId: WorkloadId;
  /** A `progress` event, mapped to the row view (transient — a row buffer, never the cache). */
  readonly onProgress: (progress: WorkloadProgressView) => void;
  /** Every NON-progress lifecycle event (started/status/succeeded/failed/cancelled). */
  readonly onEvent: (event: WorkloadLifecycleEvent) => void;
  /** The SSE stream-error sentinel — the connection ended abnormally (Workloads-pane fallback). */
  readonly onError: () => void;
  /** The SSE connection (re)entered `pending` (a reconnect); optional. */
  readonly onConnectionPending?: () => void;
}

/** Tail one workload's SSE stream, dispatching progress vs. every other lifecycle event to the caller. */
export function useWorkloadSubscription({ workloadId, onProgress, onEvent, onError, onConnectionPending }: WorkloadSubscriptionHandlers): void {
  const trpc = useTRPC();
  useSubscription(
    trpc.workloads.subscribe.subscriptionOptions(
      { workloadId },
      {
        onData: (envelope) => {
          const event = envelope.data;
          if ("__subscriptionError" in event) {
            onError();
            return;
          }
          if (event.type === "progress") {
            onProgress(toProgressView(event.progress));
            return;
          }
          onEvent(event);
        },
        onConnectionStateChange: (connection) => {
          if (connection.state === "pending") {
            onConnectionPending?.();
          }
        },
      },
    ),
  );
}
