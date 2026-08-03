// The ONE workload live-tail adapter — joins the `workloads` ROOM for one run on the tab's ONE socket (SSE-1
// S5) and splits its lifecycle events: a `progress` snapshot to the caller's row buffer, everything else to
// the caller's reaction. The Workloads pane's per-row `useWorkloadStream` and the import
// `BundleWorkloadTracker` both ride this, so the wiring lives in one home (derive-modernization §W5).
//
// WHAT THE FOLD BOUGHT HERE, specifically: this is the surface a user could multiply. Every open run used to
// pin its own browser connection, so three watched jobs plus the standing chat/rpg/user streams sat at the
// ~6-per-origin ceiling with the user doing nothing unusual. N rooms now cost N attach round-trips and ZERO
// connections, and one run's server-side fault is a `roomFailed` frame instead of a teardown of every other
// live surface in the tab.
//
// THE EVENT TYPE IS REAL NOW. This hook used to declare a narrow structural VIEW of the fields its consumers
// read, because the wire payload was server-internal with no client-importable type. The union homed in
// `@orb/contracts/workloads` as this stage's precondition (spec §14 decision 3), so `onEvent` hands over the
// genuine `WorkloadEvent` — a new member is a tsc-visible fact at both consumers instead of a silent widening.

import type { StreamRoomRef } from "@orb/contracts/stream";
import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { useBusRoom } from "#data";
import type { WorkloadProgressView } from "../lib/workloads-model.ts";
import { toProgressView } from "../lib/workloads-model.ts";

/** Every NON-progress lifecycle event — the `progress` arm is split off into `onProgress` below. */
type WorkloadLifecycleEvent = Exclude<WorkloadEvent, { readonly type: "progress" }>;

interface WorkloadSubscriptionHandlers {
  readonly workloadId: WorkloadId;
  /** A `progress` event, mapped to the row view (transient — a row buffer, never the cache). */
  readonly onProgress: (progress: WorkloadProgressView) => void;
  /** Every NON-progress lifecycle event (started/status/succeeded/failed/cancelled). */
  readonly onEvent: (event: WorkloadLifecycleEvent) => void;
  /** The room's typed failure — the surface the `__subscriptionError` sentinel route had. */
  readonly onError: () => void;
  /**
   * The gap-heal edge: this room went live again after having been live before (a socket reconnect, or a
   * re-attach after a detach). It replaces the old `onConnectionPending` and is deliberately NARROWER — it
   * does NOT fire on the room's first live edge of a page, because the mount's own `workloads.list` read IS
   * that page's fresh state (BOOT-4X, gated in `data/bus/room-registry.ts`).
   */
  readonly onSocketLive?: (() => void) | undefined;
}

/** Tail one workload's live room, dispatching progress vs. every other lifecycle event to the caller. */
export function useWorkloadSubscription({ workloadId, onProgress, onEvent, onError, onSocketLive }: WorkloadSubscriptionHandlers): void {
  const room: Extract<StreamRoomRef, { channel: "workloads" }> = { channel: "workloads", workloadId };
  useBusRoom<"workloads">(room, {
    onEvent: ({ event }) => {
      if (event.type === "progress") {
        onProgress(toProgressView(event.progress));
        return;
      }
      onEvent(event);
    },
    onError,
    ...(onSocketLive === undefined ? {} : { onSocketLive }),
  });
}
