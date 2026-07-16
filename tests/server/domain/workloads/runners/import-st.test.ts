// Runner test: import-st — wraps import.importAll, then reconciles stats post-import when a real run changed
// rows; a dry run skips the reconcile. Projects MaintenanceResult.

import { describe, vi } from "vitest";
import { importStRunner } from "../../../../../packages/server/src/domain/workloads/runners/import-st.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext, RUNNER_OWNER_ID } from "../_support.ts";

describe("import-st runner", () => {
  test("imports and reconciles stats post-import (real run with changes)", async () => {
    const env = fakeEnv();
    const result = await importStRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.import.importAll).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      dryRun: false,
      signal: expect.any(AbortSignal),
    });
    expect(env.stats.reconcileStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 12, changed: 4, dryRun: false });
  });

  test("a dry run does not reconcile stats", async () => {
    const env = fakeEnv();
    await importStRunner(makeRunnerContext(env), { dryRun: true }, vi.fn(), new AbortController().signal);
    expect(env.stats.reconcileStats).not.toHaveBeenCalled();
  });
});
