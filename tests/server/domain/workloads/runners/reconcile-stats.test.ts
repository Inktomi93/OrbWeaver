// Runner test: reconcile-stats — wraps stats.reconcileStats, projects ReconcileStatsWorkloadResult.

import { describe, vi } from "vitest";
import { reconcileStatsRunner } from "../../../../../packages/server/src/domain/workloads/runners/reconcile-stats.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("reconcile-stats runner", () => {
  test("reconciles and projects counts", async () => {
    const env = fakeEnv();
    const result = await reconcileStatsRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.stats.reconcileStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ owners: 1, characters: 4 });
  });
});
