import { vi } from "vitest";
import { startPlannerMaintenance } from "#server/entry/boot/planner-maintenance.ts";
import { getLog } from "#server/foundation/observability/index.ts";
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

test("failed maintenance is observable and the next daily tick retries successfully", async () => {
  const failure = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
  const refresh = vi.fn<() => Promise<void>>().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
  const failed = vi.spyOn(getLog(), "error").mockImplementation((): void => undefined);
  let tick = (): void => {
    throw new Error("scheduler has not registered its tick");
  };
  const stop = startPlannerMaintenance(refresh, (run) => {
    tick = run;
    return (): void => undefined;
  });
  try {
    tick();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledWith({ err: failure }, "planner maintenance failed; next daily tick retries"));
    await Promise.resolve();
    tick();
    await stop();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledTimes(1);
  } finally {
    await stop();
    failed.mockRestore();
  }
});
