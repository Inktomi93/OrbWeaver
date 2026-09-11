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
import { useEffect, useRef } from "react";
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
  // NOTHING THIS TRACKER STARTED MAY SPEAK AFTER IT IS GONE (#1570). Two halves, and the timer was only one
  // of them:
  //   · the retry `setTimeout` had no cancel, so a tracker torn down mid-ladder still fired up to ~1s later;
  //   · the `workloads.get` REQUEST itself has no cancel either — an unmount while it is in flight still ran
  //     the `.then` and called `onSucceeded`/`onFailed`/`onProgress` on a caller that is gone, bounded by
  //     network latency rather than by the ladder's ~1s.
  // The timers are a SET, not one handle: `onSocketLive` can fire again while a ladder is pending, so two can
  // legitimately overlap and both owe a cancel. `alive` covers the request half, and both flip in the SAME
  // cleanup so there is one teardown to reason about. Read and written only in callbacks and that cleanup,
  // never during render.
  //
  // CT-PINNED SINCE #1601 — `tests/client/features/workloads/components/bundle-workload-tracker.ct.tsx`, over
  // the story that finally MOUNTS this component (nothing in `tests/**` did before it, which is why the guard
  // shipped carried by review). Both arms are red against this file's pre-#1570 shape (418d40c7f^): an unmount
  // while the read is in flight reported `onSucceeded` on a gone caller, and a read that failed after teardown
  // scheduled another attempt. Reaching `reconcile` needs a socket DROP AND RE-ATTACH (`onSocketLive` is
  // deliberately not fired on a room's first live edge — `use-workload-subscription.ts` / BOOT-4X), which the
  // CT drives with `routeOrbSocket`'s `dropFirstConnection`, and the teardown is sequenced against a HELD
  // request rather than a sleep. STILL UNPINNED, stated where the fix is: the `clearTimeout` sweep of an
  // ALREADY-TICKING timer — reaching that state means beating the 250ms first backoff with a click, and the
  // page-clock fake that would make it deterministic freezes the reconnect the scenario is built on.
  const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>> | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return (): void => {
      aliveRef.current = false;
      for (const handle of retryTimersRef.current ?? []) {
        clearTimeout(handle);
      }
      retryTimersRef.current?.clear();
    };
  }, []);

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
  /** Report the durable row the gap-heal read back. Split out from the `.then` so the alive guard and the
   *  status dispatch are one decision each rather than one nested chain. */
  const report = (row: Awaited<ReturnType<typeof trpcClient.workloads.get.query>>): void => {
    if (row.status === "succeeded") {
      onSucceeded(asBundleCounts(row.result));
      return;
    }
    if (row.status === "failed" || row.status === "worker_died") {
      onFailed(row.error ?? UNEXPLAINED_FAILURE);
      return;
    }
    if (row.status === "cancelled") {
      onFailed(CANCELLED_MESSAGE);
      return;
    }
    if (row.progress !== null) {
      // Still running: the durable snapshot replaces whatever the bar was showing when the gap opened.
      onProgress(toProgressView(row.progress));
    }
  };

  const reconcile = (attempt: number): void => {
    // @orb-waive caught-failure-ownership(query): the rejection drives the bounded retry above and
    // is deliberately never converted into a terminal outcome (#222) — the run's state stays whatever the stream
    // last said. Ends if a read failure needs to surface a distinct UI state.
    void trpcClient.workloads.get
      .query({ id })
      .then((row): void => {
        if (aliveRef.current) {
          report(row); // …and if it is NOT alive: torn down mid-read, so the caller and its callbacks are gone
        }
      })
      .catch((): void => {
        if (!aliveRef.current) {
          return; // …and a failed read after teardown schedules nothing either
        }
        const backoff = RECONCILE_RETRY_BACKOFF_MS[attempt];
        if (backoff === undefined) {
          return; // out of attempts — the stream is still attached and remains the authority
        }
        retryTimersRef.current ??= new Set();
        const timers = retryTimersRef.current;
        const handle = setTimeout((): void => {
          timers.delete(handle);
          reconcile(attempt + 1);
        }, backoff);
        timers.add(handle);
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
