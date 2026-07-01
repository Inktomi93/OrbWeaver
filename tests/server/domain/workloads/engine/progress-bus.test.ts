// Engine test: the progress bus — the defensive empty-id throw (invariant #10) + the per-workload replay
// ring (ordered catch-up for a late subscriber).

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  emitWorkloadEvent,
  getRecentWorkloadEvents,
  subscribeWorkloadWake,
} from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { expect, test } from "../../../../support/fixtures";
import { T0 } from "../_support.ts";

describe("progress-bus", () => {
  test("throws on an empty workloadId", () => {
    expect(() =>
      emitWorkloadEvent({
        type: "started",
        workloadId: castId<WorkloadId>(""),
        kind: "reconcile-stats",
        at: T0,
      }),
    ).toThrow();
  });

  test("records + replays a workload's events in order", () => {
    const id = castId<WorkloadId>("workload_bus");
    emitWorkloadEvent({ type: "started", workloadId: id, kind: "reconcile-stats", at: T0 });
    emitWorkloadEvent({
      type: "progress",
      workloadId: id,
      kind: "reconcile-stats",
      at: T0 + 1,
      progress: { message: "halfway" },
    });
    emitWorkloadEvent({
      type: "succeeded",
      workloadId: id,
      kind: "reconcile-stats",
      at: T0 + 2,
      result: { owners: 1, characters: 4 },
    });
    expect(getRecentWorkloadEvents(id).map((e) => e.type)).toEqual([
      "started",
      "progress",
      "succeeded",
    ]);
  });

  test("subscribeWorkloadWake fires the listener on every event + the unsubscribe stops it", () => {
    let wakes = 0;
    const unsubscribe = subscribeWorkloadWake(() => {
      wakes += 1;
    });
    const id = castId<WorkloadId>("workload_wake");
    emitWorkloadEvent({ type: "started", workloadId: id, kind: "reconcile-stats", at: T0 });
    emitWorkloadEvent({ type: "started", workloadId: id, kind: "reconcile-stats", at: T0 + 1 });
    expect(wakes).toBe(2);
    unsubscribe();
    emitWorkloadEvent({ type: "started", workloadId: id, kind: "reconcile-stats", at: T0 + 2 });
    expect(wakes).toBe(2); // no further wake after unsubscribe
  });
});
