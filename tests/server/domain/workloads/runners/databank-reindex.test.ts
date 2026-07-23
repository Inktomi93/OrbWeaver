// Runner test: databank-reindex — bulk derived-layer maintenance. Wraps ctx.env.databank.reindex (threading
// ctx.ownerId + the scope/mode), and — PD-139(c) — reclaims the OLD document embed space via the injected
// purge op ONLY on a BULK (ownerId===null), non-aborted pass (the memory-backfill purge guard, mirrored).

import { describe, vi } from "vitest";
import { databankReindexRunner } from "../../../../../packages/server/src/domain/workloads/runners/databank-reindex.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext, RUNNER_OWNER_ID } from "../_support.ts";

describe("databank-reindex runner", () => {
  test("reindexes the owner's documents through the injected env with the row owner + scope/mode", async () => {
    const env = fakeEnv();
    const result = await databankReindexRunner(makeRunnerContext(env), { scope: { kind: "owner" } }, vi.fn(), new AbortController().signal);
    expect(env.databank.reindex).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      scope: { kind: "owner" },
      mode: "chunk-embed", // the runner floors the optional mode
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ documents: 2, chunksUpserted: 5, chunksNoop: 1, chunksPruned: 2, reExtracted: 0, failed: [] });
  });

  test("a BULK run (ownerId===null) reclaims the old document space after the sweep", async () => {
    const env = fakeEnv();
    const params = { scope: { kind: "owner" }, mode: "re-extract" } as const;
    await databankReindexRunner(makeRunnerContext(env, { ownerId: null }), params, vi.fn(), new AbortController().signal);
    expect(env.databank.reindex).toHaveBeenCalledWith({ ownerId: null, scope: { kind: "owner" }, mode: "re-extract", signal: expect.any(AbortSignal) });
    expect(env.embeddings.purgeDocumentVectors).toHaveBeenCalledTimes(1);
  });

  test("a SINGULAR per-owner run does NOT purge (a model change is box-level)", async () => {
    const env = fakeEnv();
    await databankReindexRunner(makeRunnerContext(env), { scope: { kind: "owner" } }, vi.fn(), new AbortController().signal);
    expect(env.embeddings.purgeDocumentVectors).not.toHaveBeenCalled();
  });

  test("an aborted BULK run does NOT purge (the space stays a strict superset)", async () => {
    const env = fakeEnv();
    const controller = new AbortController();
    controller.abort();
    await databankReindexRunner(makeRunnerContext(env, { ownerId: null }), { scope: { kind: "owner" } }, vi.fn(), controller.signal);
    expect(env.embeddings.purgeDocumentVectors).not.toHaveBeenCalled();
  });
});
