// Runner test: assets-gc (PD-26 — the mark-sweep GC AS a workload) — wraps assets.collectGarbage, threads
// dryRun, projects the MaintenanceResult (counts + dryRun echo).

import { describe, vi } from "vitest";
import { assetsGcRunner } from "../../../../../packages/server/src/domain/workloads/runners/assets-gc.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("assets-gc runner", () => {
  test("collects garbage and echoes dryRun", async () => {
    const env = fakeEnv();
    const result = await assetsGcRunner(
      makeRunnerContext(env),
      { dryRun: true },
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.assets.collectGarbage).toHaveBeenCalledWith({
      dryRun: true,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ scanned: 10, changed: 4, dryRun: true });
  });
});
