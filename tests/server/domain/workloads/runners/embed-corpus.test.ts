// Runner test: embed-corpus — wraps embeddings.embedCorpus, threads force, projects EmbedPassResult.

import { describe, vi } from "vitest";
import { embedCorpusRunner } from "../../../../../packages/server/src/domain/workloads/runners/embed-corpus.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("embed-corpus runner", () => {
  test("forces re-embed and projects counts", async () => {
    const env = fakeEnv();
    const result = await embedCorpusRunner(
      makeRunnerContext(env),
      { force: true },
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.embeddings.embedCorpus).toHaveBeenCalledWith({
      force: true,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ embedded: 3, skipped: 1 });
  });

  test("defaults force to false (resumable skip)", async () => {
    const env = fakeEnv();
    await embedCorpusRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.embeddings.embedCorpus).toHaveBeenCalledWith({
      force: false,
      signal: expect.any(AbortSignal),
    });
  });
});
