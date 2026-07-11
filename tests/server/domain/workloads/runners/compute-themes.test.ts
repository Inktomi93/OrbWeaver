// Runner test: compute-themes — wraps discovery.computeThemes, resolves the k precedence
// (param → user `computeThemesK` knob → floor, PD-75), projects AnalyticsResult.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { describe, vi } from "vitest";
import { computeThemesRunner } from "../../../../../packages/server/src/domain/workloads/runners/compute-themes.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext, RUNNER_OWNER_ID } from "../_support.ts";

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
      ownerId: RUNNER_OWNER_ID,
      k: 5,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ scanned: 10, written: 5 });
  });

  test("falls back to the floor k when none is supplied", async () => {
    const env = fakeEnv();
    await computeThemesRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.computeThemes).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      k: 12,
      signal: expect.any(AbortSignal),
    });
  });

  test("uses the user's computeThemesK knob when no per-run k is supplied (PD-75)", async () => {
    const env = fakeEnv();
    const ctx = makeRunnerContext(env, {
      loadUserSettings: () =>
        Promise.resolve({
          ...DEFAULT_USER_SETTINGS,
          workloads: { ...DEFAULT_USER_SETTINGS.workloads, computeThemesK: 7 },
        }),
    });
    await computeThemesRunner(ctx, {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.computeThemes).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      k: 7,
      signal: expect.any(AbortSignal),
    });
  });

  test("a per-run k overrides the user's computeThemesK knob", async () => {
    const env = fakeEnv();
    const ctx = makeRunnerContext(env, {
      loadUserSettings: () =>
        Promise.resolve({
          ...DEFAULT_USER_SETTINGS,
          workloads: { ...DEFAULT_USER_SETTINGS.workloads, computeThemesK: 7 },
        }),
    });
    await computeThemesRunner(ctx, { k: 3 }, vi.fn(), new AbortController().signal);
    expect(env.discovery.computeThemes).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      k: 3,
      signal: expect.any(AbortSignal),
    });
  });
});
