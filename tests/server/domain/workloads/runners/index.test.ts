// Runner test: index — the parameterized embeddings reindex. Dispatches on `source`: `text` → embedCorpus,
// `image` → embedAssets, `all` → BOTH (counts folded). Threads `force` + the enumeration `ownerId`, and
// projects the op counts into the workload-owned EmbedPassResult.

import { describe, vi } from "vitest";
import { indexRunner } from "../../../../../packages/server/src/domain/workloads/runners/index.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext, RUNNER_OWNER_ID } from "../_support.ts";

describe("index runner", () => {
  test("source=text drives ONLY the corpus pass and projects its counts", async () => {
    const env = fakeEnv();
    const result = await indexRunner(
      makeRunnerContext(env),
      { source: "text", force: true },
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.embeddings.embedCorpus).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      force: true,
      signal: expect.any(AbortSignal),
    });
    expect(env.embeddings.embedAssets).not.toHaveBeenCalled();
    expect(result).toEqual({ embedded: 3, skipped: 1 });
  });

  test("source=image drives ONLY the asset pass; force defaults to false", async () => {
    const env = fakeEnv();
    const result = await indexRunner(
      makeRunnerContext(env),
      { source: "image" },
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.embeddings.embedAssets).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      force: false,
      signal: expect.any(AbortSignal),
    });
    expect(env.embeddings.embedCorpus).not.toHaveBeenCalled();
    expect(result).toEqual({ embedded: 2, skipped: 0 });
  });

  test("source=all runs BOTH passes and folds the counts (the atomic reindex-everything unit)", async () => {
    const env = fakeEnv();
    const result = await indexRunner(
      makeRunnerContext(env),
      { source: "all" },
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.embeddings.embedCorpus).toHaveBeenCalledOnce();
    expect(env.embeddings.embedAssets).toHaveBeenCalledOnce();
    // corpus {embedded:3, skipped:1} + assets {embedded:2, skipped:0} folded.
    expect(result).toEqual({ embedded: 5, skipped: 1 });
  });
});
