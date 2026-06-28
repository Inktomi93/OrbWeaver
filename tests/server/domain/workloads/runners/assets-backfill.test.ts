// Runner test: assets-backfill (PD-26 — assets maintenance AS a workload) — wraps assets.backfillAvatars,
// threads dryRun, projects MaintenanceResult (counts + dryRun echo).

import { describe, expect, test, vi } from "vitest";
import { assetsBackfillRunner } from "../../../../../packages/server/src/domain/workloads/runners/assets-backfill.ts";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("assets-backfill runner", () => {
  test("backfills avatars and echoes dryRun", async () => {
    const env = fakeEnv();
    const result = await assetsBackfillRunner(
      makeRunnerContext(env),
      { dryRun: true },
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.assets.backfillAvatars).toHaveBeenCalledWith({
      dryRun: true,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ scanned: 20, changed: 3, dryRun: true });
  });
});
