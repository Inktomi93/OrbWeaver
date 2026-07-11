// Runner test: embed-assets — wraps embeddings.embedAssets, projects EmbedPassResult.

import { describe, vi } from "vitest";
import { embedAssetsRunner } from "../../../../../packages/server/src/domain/workloads/runners/embed-assets.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext, RUNNER_OWNER_ID } from "../_support.ts";

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
      ownerId: RUNNER_OWNER_ID,
      force: false,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ embedded: 2, skipped: 0 });
  });
});
