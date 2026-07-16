// Runner test: csls — wraps discovery.computeHubScores (which writes hub_score via embeddings internally;
// workloads sees one op), projects AnalyticsResult.

import { describe, vi } from "vitest";
import { cslsRunner } from "../../../../../packages/server/src/domain/workloads/runners/csls.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("csls runner", () => {
  test("computes hub scores and projects counts", async () => {
    const env = fakeEnv();
    const result = await cslsRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.computeHubScores).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 7, written: 7 });
  });
});
