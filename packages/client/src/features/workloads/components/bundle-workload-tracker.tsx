// bundle-workload-tracker — a render-nothing tail on ONE `import-bundle` workload's live room (the SAME seam
// the Workloads pane's rows use) that lifts progress + the terminal outcome to the caller. Mounted by the
// import section ONLY while an import runs (the "mounted per active row" shape of use-workload-stream); its
// unmount detaches the room. The bundle runner reports a message (no pct), so progress is typically
// indeterminate — the section shows an indeterminate bar + label.
//
// THE RECONNECT GAP IS RE-DERIVED, NOT WAITED OUT (#248). A socket drop is recoverable and tab-wide, so
// #222 correctly stopped answering it with a per-run terminal state — but that left this tracker with no
// answer at all: a run that SUCCEEDED inside the gap emitted its terminal event to nobody, and the import
// section sat on an indeterminate bar for as long as the user left it open. The healthy consumers
// (`use-workload-stream`, `use-inbox-stream`) answer `onSocketLive` by re-reading the authoritative state;
// this one does the same with the read that fits its shape — the row itself, because unlike the pane it is
// not driven by a list query and has exactly one run to resolve. The durable `status`/`error`/`result`
// columns ARE the truth the stream was only reporting (`workload-row.ts`: the last progress snapshot is
// "the reconnect truth — no subscription needed").

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useTRPCClient } from "#data";
import { useWorkloadSubscription } from "../hooks/use-workload-subscription.ts";
import type { BundleCounts } from "../lib/portability-model.ts";
import { asBundleCounts } from "../lib/portability-model.ts";
import type { WorkloadProgressView } from "../lib/workloads-model.ts";
import { toProgressView } from "../lib/workloads-model.ts";

export interface BundleWorkloadTrackerProps {
  readonly workloadId: WorkloadId;
  readonly onProgress: (progress: WorkloadProgressView) => void;
  readonly onSucceeded: (counts: BundleCounts) => void;
  readonly onFailed: (message: string) => void;
}

/** The message a failed row shows when the server stored no reason. */
const UNEXPLAINED_FAILURE = "The import failed. Check the Jobs pane for its status.";
const CANCELLED_MESSAGE = "The import was cancelled.";

/** Tail the import workload; forward progress, and resolve on the terminal event. Renders nothing. */
export function BundleWorkloadTracker({ workloadId, onProgress, onSucceeded, onFailed }: BundleWorkloadTrackerProps): null {
  const trpcClient = useTRPCClient();
  const id = castId<WorkloadId>(workloadId);
  useWorkloadSubscription({
    workloadId: id,
    onProgress,
    onEvent: (event) => {
      if (event.type === "succeeded") {
        onSucceeded(asBundleCounts(event.result));
      } else if (event.type === "failed") {
        onFailed(event.error.message);
      } else if (event.type === "cancelled") {
        onFailed(CANCELLED_MESSAGE);
      }
      // started/status: no terminal outcome for the import tracker
    },
    onError: () => onFailed("The import stream ended. Check the Jobs pane for its status."),
    onSocketLive: () => {
      // A failed READ is not a failed IMPORT: leave the tracker running rather than converting a transient
      // read error into a terminal claim about the run — the same reasoning #222 applied to socket faults.
      trpcClient.workloads.get.query({ id }).then(
        (row) => {
          if (row.status === "succeeded") {
            onSucceeded(asBundleCounts(row.result));
          } else if (row.status === "failed" || row.status === "worker_died") {
            onFailed(row.error ?? UNEXPLAINED_FAILURE);
          } else if (row.status === "cancelled") {
            onFailed(CANCELLED_MESSAGE);
          } else if (row.progress !== null) {
            // Still running: the durable snapshot replaces whatever the bar was showing when the gap opened.
            onProgress(toProgressView(row.progress));
          }
        },
        () => {
          // Intentionally silent — see above.
        },
      );
    },
  });
  return null;
}
