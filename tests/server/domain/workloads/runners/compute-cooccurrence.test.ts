// Runner test: compute-cooccurrence — wraps discovery.computeCooccurrence, projects AnalyticsResult.

import { describe, vi } from "vitest";
import { computeCooccurrenceRunner } from "../../../../../packages/server/src/domain/workloads/runners/compute-cooccurrence.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("compute-cooccurrence runner", () => {
  test("computes cooccurrence and projects counts", async () => {
    const env = fakeEnv();
    const result = await computeCooccurrenceRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.computeCooccurrence).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 6, written: 4 });
  });
});
