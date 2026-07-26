// Runner test: compute-cooccurrence — wraps discovery.computeCooccurrence, projects AnalyticsResult.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
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

  // item 8 belt (stint-6): the runner threads the triggering user's UserSettings.workloads maxPairs/hubFraction
  // knobs into the discovery op (structurally wired in stint 4, untested until now). Absent ⇒ the op sees neither.
  test("threads the user's workloads maxPairs/hubFraction into the discovery op", async () => {
    const env = fakeEnv();
    const ctx = makeRunnerContext(env, {
      loadUserSettings: () =>
        Promise.resolve({ ...DEFAULT_USER_SETTINGS, workloads: { ...DEFAULT_USER_SETTINGS.workloads, maxPairs: 5000, hubFraction: 0.25 } }),
    });
    await computeCooccurrenceRunner(ctx, {}, vi.fn(), new AbortController().signal);
    expect(env.discovery.computeCooccurrence).toHaveBeenCalledWith(expect.objectContaining({ maxPairs: 5000, hubFraction: 0.25 }));
  });

  test("omits maxPairs/hubFraction when the user's workloads knobs are unset (the op reads its floor)", async () => {
    const env = fakeEnv();
    await computeCooccurrenceRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    const arg = vi.mocked(env.discovery.computeCooccurrence).mock.calls[0]?.[0];
    expect(arg).not.toHaveProperty("maxPairs");
    expect(arg).not.toHaveProperty("hubFraction");
  });
});
