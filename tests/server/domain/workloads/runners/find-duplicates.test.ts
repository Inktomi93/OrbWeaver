// Runner test: find-duplicates — wraps discovery.findDuplicates, projects AnalyticsResult.

import { describe, vi } from "vitest";
import { findDuplicatesRunner } from "../../../../../packages/server/src/domain/workloads/runners/find-duplicates.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("find-duplicates runner", () => {
  test("finds duplicates and projects counts", async () => {
    const env = fakeEnv();
    const result = await findDuplicatesRunner(
      makeRunnerContext(env),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.discovery.findDuplicates).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 9, written: 1 });
  });
});
