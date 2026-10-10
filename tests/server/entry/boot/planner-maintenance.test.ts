import { vi } from "vitest";
import { startPlannerMaintenance } from "../../../../packages/server/src/entry/boot/planner-maintenance.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("daily maintenance skips overlapping ticks, cancels future work, and joins the running refresh", async () => {
  const refresh = Promise.withResolvers<void>();
  const optimize = vi.fn(() => refresh.promise);
  const cancel = vi.fn();
  let tick = (): void => {
    throw new Error("scheduler has not registered its tick");
  };
  const stop = startPlannerMaintenance(optimize, (run, ms) => {
    tick = run;
    expect(ms).toBe(86_400_000);
    return cancel;
  });
  tick();
  tick();
  expect(optimize).toHaveBeenCalledTimes(1);
  let joined = false;
  const stopped = stop().then(() => {
    joined = true;
  });
  await Promise.resolve();
  expect(joined).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
  tick();
  expect(optimize).toHaveBeenCalledTimes(1);
  refresh.resolve();
  await stopped;
  expect(joined).toBe(true);
});
