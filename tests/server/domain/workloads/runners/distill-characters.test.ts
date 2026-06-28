// Runner test: distill-characters — wraps discovery.distillCharacters, projects AnalyticsResult.

import { describe, expect, test, vi } from "vitest";
import { distillCharactersRunner } from "../../../../../packages/server/src/domain/workloads/runners/distill-characters.ts";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("distill-characters runner", () => {
  test("distills and projects counts", async () => {
    const env = fakeEnv();
    const result = await distillCharactersRunner(
      makeRunnerContext(env),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.discovery.distillCharacters).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 8, written: 8 });
  });
});
