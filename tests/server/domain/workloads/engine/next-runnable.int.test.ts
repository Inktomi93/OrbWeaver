// engine/next-runnable — the queue scan's lifecycle bridge: persistence returns durable terminalizations as
// data, and this publishes each canonical failure event only AFTER the guarded write settled. Pins: a runnable
// queued row is returned untouched, and a POISON row (params fail the owning domain's schema) is durably
// failed AND its terminal is published on the progress bus — not silently dropped.

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { nextRunnableWorkload } from "../../../../../packages/server/src/domain/workloads/engine/next-runnable.ts";
import { emitWorkloadEvent, getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, seedWorkloadRow, T0 } from "../_support.ts";

describe("nextRunnableWorkload", () => {
  test("a runnable queued row is returned", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "workload_ok", kind: "reconcile-stats" });
    const row = await nextRunnableWorkload(db, fakeContributions(), T0, "sweep");
    expect(row?.id).toBe("workload_ok");
  });

  test("no runnable rows returns null", async () => {
    const db = await freshDb();
    const row = await nextRunnableWorkload(db, fakeContributions(), T0, "sweep");
    expect(row).toBeNull();
  });

  test("a POISON row (params fail its own domain's schema) is durably FAILED AND its terminal is published on the bus — not silently dropped", async () => {
    const db = await freshDb();
    const poisonId: WorkloadId = castId("workload_poison");
    // A sentinel first, so getRecentWorkloadEvents(id) proves the scan itself emitted the terminal.
    emitWorkloadEvent({ type: "started", workloadId: poisonId, kind: "compute-themes", at: T0 - 1 });
    await seedWorkloadRow(db, { id: "workload_poison", kind: "compute-themes", params: { k: -5 } });

    const row = await nextRunnableWorkload(db, fakeContributions(), T0, "sweep");

    expect(row).toBeNull(); // a poison row is never runnable
    const events = getRecentWorkloadEvents(poisonId);
    expect(events.map((e) => e.type)).toEqual(["started", "failed"]);
  });
});
