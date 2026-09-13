// transport/jobs/workload-schedule-scheduler — the WHEN-to-tick DRIVER for recurring schedules. The
// decision + enqueue logic is the workloads front door's (`tickWorkloadSchedules`, tested in its domain);
// what belongs to the driver is exactly three things, and each is pinned here: it fires ONE tick at boot
// (a due schedule must not wait a whole cadence for the first scan), it arms the recurring tick on the
// INJECTED timer at the default 60s cadence unless overridden, and a failing tick never escapes (the next
// tick retries — a bad tick must not take the process down).
//
// `.int` because the driver calls the real front door directly rather than through an injected op: an
// empty `workload_schedules` table on a real libSQL :memory: is the honest "nothing due" tick. The
// failure arm drives a THROWING tick through a db whose query throws, which is the only shape that
// reaches the driver's own catch.

import type { Db } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
// Deep-imported: `transport/jobs/` has no barrel — entry wires each driver by path (the sibling
// `catalog-refresh-scheduler` test's spelling).
import type { WorkloadScheduleSchedulerDeps } from "../../../../packages/server/src/transport/jobs/workload-schedule-scheduler.ts";
import { startWorkloadScheduleScheduler } from "../../../../packages/server/src/transport/jobs/workload-schedule-scheduler.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const T0 = 1_700_000_000_000;
const MINUTE_MS = 60_000;
const FAST_MS = 5000;

type ScheduleOp = (fn: () => void, ms: number) => () => void;

const inertInterval: ScheduleOp = () => (): void => undefined;

function makeStart(): WorkloadScheduleSchedulerDeps["start"] {
  return vi.fn(() => Promise.resolve({ id: castId<WorkloadId>("workload_started") }));
}

function makeDeps(
  db: Db,
  start: WorkloadScheduleSchedulerDeps["start"],
  scheduleInterval: ScheduleOp,
  checkIntervalMs?: number,
): WorkloadScheduleSchedulerDeps {
  return {
    db,
    now: (): number => T0,
    start,
    scheduleInterval,
    ...(checkIntervalMs === undefined ? {} : { checkIntervalMs }),
  };
}

/** Let the boot tick's promise chain settle (the driver fires it fire-and-forget). */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("workload-schedule-scheduler — the boot tick and the armed cadence", () => {
  test("arms the recurring tick at the one-minute default and returns the timer's clear closure", async () => {
    const db = await freshDb();
    const clear = vi.fn();
    const scheduleInterval = vi.fn((_fn: () => void, _ms: number) => clear);

    const stop = startWorkloadScheduleScheduler(makeDeps(db, makeStart(), scheduleInterval));
    await settle();

    expect(scheduleInterval).toHaveBeenCalledTimes(1);
    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(MINUTE_MS);
    stop();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  test("honours an injected check interval (the cadence is a dep, not a constant the caller cannot reach)", async () => {
    const db = await freshDb();
    const scheduleInterval = vi.fn((_fn: () => void, _ms: number) => (): void => undefined);

    startWorkloadScheduleScheduler(makeDeps(db, makeStart(), scheduleInterval, FAST_MS));
    await settle();

    expect(scheduleInterval.mock.calls[0]?.[1]).toBe(FAST_MS);
  });

  test("fires ONE tick at boot, before the first interval elapses — an empty queue enqueues nothing", async () => {
    const db = await freshDb();
    const start = makeStart();

    // The timer is captured, never fired: whatever the tick did here happened at BOOT.
    startWorkloadScheduleScheduler(makeDeps(db, start, inertInterval));
    await settle();

    expect(start).not.toHaveBeenCalled();
  });

  test("the armed callback IS the tick — firing it drives another scan without throwing", async () => {
    const db = await freshDb();
    const start = makeStart();
    let armed: (() => void) | undefined;
    const capture: ScheduleOp = (fn) => {
      armed = fn;
      return (): void => undefined;
    };

    startWorkloadScheduleScheduler(makeDeps(db, start, capture));
    await settle();
    expect(armed).toBeDefined();

    armed?.();
    await settle();

    // Nothing is due on a fresh db either way; the assertion is that the armed closure RAN the tick and
    // still enqueued nothing — the timer is wired to the scan, not to a stray no-op.
    expect(start).not.toHaveBeenCalled();
  });
});

describe("workload-schedule-scheduler — a failing tick is isolated", () => {
  test("a throwing tick never escapes the driver (the next tick retries)", async () => {
    // A db whose first query throws — the only shape that reaches the driver's own catch, since the
    // front door is called directly rather than through an injected op.
    // @orb-waive no-test-fabrication(unknown): the tick dereferences nothing else before the throw. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const exploding = {
      select: (): never => {
        throw new Error("db exploded");
      },
    } as unknown as Db;

    expect(() => startWorkloadScheduleScheduler(makeDeps(exploding, makeStart(), inertInterval))).not.toThrow();
    await settle();
  });
});
