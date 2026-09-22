// CT: `<BundleWorkloadTracker>`'s TEARDOWN CONTRACT (#1601, closing the guard #1570 shipped unpinned).
//
// WHY THIS FILE EXISTS AT ALL. Until it landed, nothing in `tests/**` MOUNTED this component — its retry
// ladder, its `onSocketLive` reconcile and the #1570 unmount cleanup were carried by review. A render-nothing
// component has no surface to drive, so the mount had to be built before the guard could be measured: the
// story (`../_ct-stories.tsx`) is that mount.
//
// THE INVARIANT: nothing the tracker started may speak after it is gone. Two halves, and the tracker's own
// header names both:
//   A. the in-flight `workloads.get` — an unmount while the read is on the wire must not run `report()`,
//      i.e. no `onSucceeded`/`onFailed`/`onProgress` on a caller that no longer exists (`aliveRef` in `.then`);
//   B. the retry LADDER — a read that FAILS after teardown must schedule nothing (`aliveRef` in `.catch`),
//      so the reconcile chain ends with the component instead of outliving it by up to ~1s.
//
// HOW THE ARM IS REACHED, and why it is deterministic. `reconcile` runs only on the gap-heal edge, which is
// deliberately NOT a room's first live edge (BOOT-4X, `data/bus/room-registry.ts`) — so the socket stub has
// to DROP the first connection (`dropFirstConnection`) and let the link reconnect. The teardown is then
// sequenced against a HELD request (`trpcHold`) rather than against a sleep: the read is provably in flight
// and stays there until this file releases it, so "unmount mid-request" is a barrier, not a race.
//
// THE SECOND TRACKER IS THE PLANTED POSITIVE CONTROL. Both assertions are ABSENCES, and an absence measured
// alone cannot tell a working guard from a scenario that never ran. The control tracker stays mounted across
// the same released response and the same retry ladder; its counters MOVING is what makes the other one's
// stillness evidence. (Both reconciles are issued in the same fan-out, so they ride one `httpBatchLink`
// batch — one held HTTP response, released once, delivered to both.)
//
// DECLARED LIMIT — the `clearTimeout` half of the #1570 cleanup (the timer SET) is NOT pinned here, and
// cannot be without faking the page clock: reaching an unmount while a retry timer is PENDING means winning
// a 250ms race against a Playwright click, and `page.clock.install()` would also freeze the SSE reconnect and
// the query client this scenario is built on. What IS pinned is the arm that makes a stray timer impossible
// in the first place — after teardown the `.catch` schedules nothing — so the only unpinned residue is a
// timer that was already ticking at the moment of unmount.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { BundleWorkloadTrackerStory } from "../_ct-stories.tsx";

/** The tracker torn down mid-flight — the subject. */
const GONE_ID = "workload_ct_gone";
/** The tracker that stays mounted — the control. */
const LIVE_ID = "workload_ct_live";

/** A finished bundle row in the `workloads.get` wire shape (`WorkloadRowAnyKind`), succeeded with counts. */
const SUCCEEDED_ROW = {
  id: LIVE_ID,
  kind: "import-bundle",
  status: "succeeded",
  mode: "singular",
  lane: "interactive",
  ownerId: "user_ct_tracker",
  dependsOn: null,
  error: null,
  progress: null,
  scheduledAt: 1_750_000_000_000,
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
  params: { token: "bundle-ct.zip" },
  result: { imported: 3, skipped: 0, failed: 0, notes: [] },
  poison: false,
} satisfies TrpcWireOutput<"workloads.get">;

/** Requests recorded for ONE workload id — `workloads.get` is one procedure for both trackers, so the
 *  per-tracker count is a filter over the recorder's decoded inputs, never `trpc.count`. */
function readsFor(inputs: readonly unknown[], id: string): number {
  return inputs.filter((input) => (input as { readonly id?: unknown } | undefined)?.id === id).length;
}

test("A — an unmount while the gap-heal read is IN FLIGHT reports nothing; the still-mounted twin reports", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, { ...STREAM_MUTATION_ROUTES, "workloads.get": hold });
  // `awaitAttaches: 2` holds the first connection open until BOTH rooms have joined, then drops it without
  // the terminal frame so the link reconnects — the only edge on which `onSocketLive` (and therefore
  // `reconcile`) fires at all.
  const socket = await routeOrbSocket(page, { frames: [], awaitAttaches: 2, dropFirstConnection: true });

  const story = await mount(<BundleWorkloadTrackerStory goneId={GONE_ID} liveId={LIVE_ID} />);
  await expect(story.getByTestId("tracker-tally")).toHaveText("mounted=true gone=0/0/0 live=0/0/0");

  await expect.poll(() => socket.connects(), { timeout: 15_000 }).toBeGreaterThan(1);
  // The barrier: the reconcile read has REACHED the stub and is being held there. Not a sleep — the request
  // cannot be answered until this file answers it.
  await hold.requested;

  await story.getByRole("button", { name: "Unmount the tailed tracker" }).click();
  await expect(story.getByTestId("tracker-tally")).toHaveText("mounted=false gone=0/0/0 live=0/0/0");

  // …and NOW the read lands, on a caller that is gone. One response, both trackers.
  hold.release(SUCCEEDED_ROW);

  // The control moved (so the response really arrived and really was a terminal one) and the torn-down
  // tracker did not (so the `aliveRef` guard in `.then` held). Pre-#1570 this read `gone=0/1/0`.
  await expect(story.getByTestId("tracker-tally")).toHaveText("mounted=false gone=0/0/0 live=0/1/0");
});

test("B — a read that FAILS after teardown schedules no retry; the still-mounted twin climbs its ladder", async ({ mount, page }) => {
  const hold = trpcHold();
  // The first BATCH carries both trackers' reconciles and is held; everything after it (the control's own
  // retry, 250ms into the ladder) answers immediately with the finished row so the ladder terminates.
  let seen = 0;
  const trpc = await routeTrpc(page, {
    ...STREAM_MUTATION_ROUTES,
    "workloads.get": () => {
      seen += 1;
      return seen <= 2 ? hold : SUCCEEDED_ROW;
    },
  });
  const socket = await routeOrbSocket(page, { frames: [], awaitAttaches: 2, dropFirstConnection: true });

  const story = await mount(<BundleWorkloadTrackerStory goneId={GONE_ID} liveId={LIVE_ID} />);
  await expect(story.getByTestId("tracker-tally")).toHaveText("mounted=true gone=0/0/0 live=0/0/0");

  await expect.poll(() => socket.connects(), { timeout: 15_000 }).toBeGreaterThan(1);
  await hold.requested;

  await story.getByRole("button", { name: "Unmount the tailed tracker" }).click();
  await expect(story.getByTestId("tracker-tally")).toHaveText("mounted=false gone=0/0/0 live=0/0/0");

  // A FAILED read is the ladder's own trigger: alive ⇒ schedule the next attempt, gone ⇒ schedule nothing.
  // Note what this does NOT do — neither branch turns a failed READ into a failed IMPORT (#222).
  hold.release(trpcError({ message: "scripted gap-heal failure" }));

  // The control's retry fired 250ms later and resolved — the ladder demonstrably ran in this scenario.
  await expect(story.getByTestId("tracker-tally")).toHaveText("mounted=false gone=0/0/0 live=0/1/0");

  // …and the torn-down tracker issued exactly the ONE read it started before the unmount. The assertion is
  // settled by the control above: both ladders were scheduled in the same released `.catch`, so once the
  // control's 250ms retry has landed AND resolved, a retry on this side would already be recorded too.
  await expect.poll(() => readsFor(trpc.inputs("workloads.get"), GONE_ID)).toBe(1);
  await expect.poll(() => readsFor(trpc.inputs("workloads.get"), LIVE_ID)).toBe(2);
});
