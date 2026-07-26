// Runner test: find-duplicates — wraps discovery.findDuplicates, projects AnalyticsResult, and resolves the
// CHARACTER arm's raw-cosine `threshold` via the §7.2 precedence (param → dupThreshold setting → floor). Absent
// on both ⇒ undefined threaded to the op (⇒ discovery's own DEFAULT_DUP_THRESHOLD; the pre-wire behavior).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { describe, vi } from "vitest";
import { findDuplicatesRunner } from "../../../../../packages/server/src/domain/workloads/runners/find-duplicates.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("find-duplicates runner", () => {
  test("finds duplicates and projects counts", async () => {
    const env = fakeEnv();
    const result = await findDuplicatesRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.findDuplicates).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 9, written: 1 });
  });

  test("with neither a param nor the dupThreshold setting, threads threshold: undefined (discovery floors to its default)", async () => {
    const env = fakeEnv();
    // DEFAULT_USER_SETTINGS.workloads.dupThreshold is unset ⇒ undefined.
    await findDuplicatesRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.findDuplicates).toHaveBeenCalledWith(expect.objectContaining({ threshold: undefined }));
  });

  test("threads the user's dupThreshold setting to the op when no per-run param is given", async () => {
    const env = fakeEnv();
    const ctx = makeRunnerContext(env, {
      loadUserSettings: () =>
        Promise.resolve({
          ...DEFAULT_USER_SETTINGS,
          workloads: { ...DEFAULT_USER_SETTINGS.workloads, dupThreshold: 0.8 },
        }),
    });
    await findDuplicatesRunner(ctx, {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.findDuplicates).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.8 }));
  });

  test("a per-run param threshold wins over the user setting", async () => {
    const env = fakeEnv();
    const ctx = makeRunnerContext(env, {
      loadUserSettings: () =>
        Promise.resolve({
          ...DEFAULT_USER_SETTINGS,
          workloads: { ...DEFAULT_USER_SETTINGS.workloads, dupThreshold: 0.8 },
        }),
    });
    await findDuplicatesRunner(ctx, { threshold: 0.95 }, vi.fn(), new AbortController().signal);
    expect(env.discovery.findDuplicates).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.95 }));
  });
});
