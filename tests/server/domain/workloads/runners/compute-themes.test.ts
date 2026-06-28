// Runner test: compute-themes — wraps discovery.computeThemes, resolves the k precedence (param → floor),
// projects AnalyticsResult.

import { describe, expect, test, vi } from "vitest";
import { computeThemesRunner } from "../../../../../packages/server/src/domain/workloads/runners/compute-themes.ts";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("compute-themes runner", () => {
  test("uses the per-run k", async () => {
    const env = fakeEnv();
    const result = await computeThemesRunner(
      makeRunnerContext(env),
      { k: 5 },
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.discovery.computeThemes).toHaveBeenCalledWith({
      k: 5,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ scanned: 10, written: 5 });
  });

  test("falls back to the floor k when none is supplied", async () => {
    const env = fakeEnv();
    await computeThemesRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.computeThemes).toHaveBeenCalledWith({
      k: 12,
      signal: expect.any(AbortSignal),
    });
  });
});
