// bundle-workload-tracker — a render-nothing subscription that tails ONE `import-bundle` workload's status
// stream (`workloads.subscribe` — the SAME SSE seam the Workloads pane's rows use) and lifts progress + the
// terminal outcome to the caller. Mounted by the import section ONLY while an import runs (the "mounted per
// active row" shape of use-workload-stream); its unmount tears the SSE down. The bundle runner reports a
// message (no pct), so progress is typically indeterminate — the section shows an indeterminate bar + label.

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "#data";
import type { BundleCounts } from "../lib/portability-model";
import { asBundleCounts } from "../lib/portability-model";
import type { WorkloadProgressView } from "../lib/workloads-model";
import { toProgressView } from "../lib/workloads-model";

export interface BundleWorkloadTrackerProps {
  readonly workloadId: string;
  readonly onProgress: (progress: WorkloadProgressView) => void;
  readonly onSucceeded: (counts: BundleCounts) => void;
  readonly onFailed: (message: string) => void;
}

/** Tail the import workload; forward progress, and resolve on the terminal event. Renders nothing. */
export function BundleWorkloadTracker({ workloadId, onProgress, onSucceeded, onFailed }: BundleWorkloadTrackerProps): null {
  const trpc = useTRPC();
  useSubscription(
    trpc.workloads.subscribe.subscriptionOptions(
      { workloadId: castId<WorkloadId>(workloadId) },
      {
        onData: (envelope) => {
          const event = envelope.data;
          if ("__subscriptionError" in event) {
            onFailed("The import stream ended. Check the Workloads pane for its status.");
          } else if (event.type === "progress") {
            onProgress(toProgressView(event.progress));
          } else if (event.type === "succeeded") {
            onSucceeded(asBundleCounts(event.result));
          } else if (event.type === "failed") {
            onFailed(event.error.message);
          } else if (event.type === "cancelled") {
            onFailed("The import was cancelled.");
          }
        },
      },
    ),
  );
  return null;
}
