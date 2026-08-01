// bundle-workload-tracker — a render-nothing tail on ONE `import-bundle` workload's live room (the SAME seam
// the Workloads pane's rows use) that lifts progress + the terminal outcome to the caller. Mounted by the
// import section ONLY while an import runs (the "mounted per active row" shape of use-workload-stream); its
// unmount detaches the room. The bundle runner reports a message (no pct), so progress is typically
// indeterminate — the section shows an indeterminate bar + label.

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useWorkloadSubscription } from "../hooks/use-workload-subscription";
import type { BundleCounts } from "../lib/portability-model";
import { asBundleCounts } from "../lib/portability-model";
import type { WorkloadProgressView } from "../lib/workloads-model";

export interface BundleWorkloadTrackerProps {
  readonly workloadId: string;
  readonly onProgress: (progress: WorkloadProgressView) => void;
  readonly onSucceeded: (counts: BundleCounts) => void;
  readonly onFailed: (message: string) => void;
}

/** Tail the import workload; forward progress, and resolve on the terminal event. Renders nothing. */
export function BundleWorkloadTracker({ workloadId, onProgress, onSucceeded, onFailed }: BundleWorkloadTrackerProps): null {
  useWorkloadSubscription({
    workloadId: castId<WorkloadId>(workloadId),
    onProgress,
    onEvent: (event) => {
      if (event.type === "succeeded") {
        onSucceeded(asBundleCounts(event.result));
      } else if (event.type === "failed") {
        onFailed(event.error.message);
      } else if (event.type === "cancelled") {
        onFailed("The import was cancelled.");
      }
      // started/status: no terminal outcome for the import tracker
    },
    onError: () => onFailed("The import stream ended. Check the Jobs pane for its status."),
  });
  return null;
}
