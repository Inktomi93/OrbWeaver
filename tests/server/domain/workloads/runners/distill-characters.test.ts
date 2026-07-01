// Runner test: distill-characters — wraps discovery.distillCharacters, projects AnalyticsResult.

import { describe, vi } from "vitest";
import { distillCharactersRunner } from "../../../../../packages/server/src/domain/workloads/runners/distill-characters.ts";
import { expect, test } from "../../../../support/fixtures";
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
