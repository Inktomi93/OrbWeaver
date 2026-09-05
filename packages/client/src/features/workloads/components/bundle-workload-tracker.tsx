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

/** The gap-heal re-read's retry schedule — 3 attempts over ~1s, matching the room registry's announce
 *  ladder: enough to outlive a flap that survives the reconnect by a beat, short enough that nothing waits
 *  on it. Hygiene numbers, not load-bearing. */
const RECONCILE_RETRY_FIRST_MS = 250;
const RECONCILE_RETRY_SECOND_MS = 750;
const RECONCILE_RETRY_BACKOFF_MS = [RECONCILE_RETRY_FIRST_MS, RECONCILE_RETRY_SECOND_MS] as const;

/** Tail the import workload; forward progress, and resolve on the terminal event. Renders nothing. */
export function BundleWorkloadTracker({ workloadId, onProgress, onSucceeded, onFailed }: BundleWorkloadTrackerProps): null {
  const trpcClient = useTRPCClient();
  const id = castId<WorkloadId>(workloadId);

  /**
   * RE-DERIVE THE RUN AFTER A GAP — AND DO NOT GO PERMANENTLY SILENT IF THAT READ FAILS (#1503).
   *
   * The #222/#248 ruling stands and is preserved: a failed READ is not a failed IMPORT, so nothing here may
   * turn a transient read error into a terminal claim about the run. What the ruling did NOT cover is that
   * this read is the ONLY channel for a terminal event emitted while the socket was down — so an empty
   * rejection handler meant one unlucky request left the import bar spinning for as long as the pane stayed
   * open, with the run long since finished. Retrying is the answer that satisfies both: still no terminal
   * claim, but the gap actually gets closed. The ladder is short and bounded — the next reconnect brings
   * another `onSocketLive` anyway, so this only has to survive a flap that outlives the reconnect by a beat.
   */
  const reconcile = (attempt: number): void => {
    // @orb-gate-ignore caught-failure-ownership(promise:query): the rejection drives the bounded retry above and
    // is deliberately never converted into a terminal outcome (#222) — the run's state stays whatever the stream
    // last said. Ends if a read failure needs to surface a distinct UI state.
    void trpcClient.workloads.get
      .query({ id })
      .then((row): void => {
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
      })
      .catch((): void => {
        const backoff = RECONCILE_RETRY_BACKOFF_MS[attempt];
        if (backoff === undefined) {
          return; // out of attempts — the stream is still attached and remains the authority
        }
        setTimeout((): void => reconcile(attempt + 1), backoff);
      });
  };

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
    onSocketLive: (): void => reconcile(0),
  });
  return null;
}
