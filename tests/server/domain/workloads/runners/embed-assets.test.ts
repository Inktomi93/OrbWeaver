// Runner test: embed-assets — wraps embeddings.embedAssets, projects EmbedPassResult.

import { describe, expect, test, vi } from "vitest";
import { embedAssetsRunner } from "../../../../../packages/server/src/domain/workloads/runners/embed-assets.ts";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("embed-assets runner", () => {
  test("embeds assets and projects counts", async () => {
    const env = fakeEnv();
    const result = await embedAssetsRunner(
      makeRunnerContext(env),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.embeddings.embedAssets).toHaveBeenCalledWith({
      force: false,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ embedded: 2, skipped: 0 });
  });
});
