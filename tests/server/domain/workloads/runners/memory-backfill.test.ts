// Runner test: memory-backfill (PD-41) — wraps ctx.env.memory.backfill (chat's corpus sweep), threads the
// signal, and returns the folded segment/digest counts. PD-139(b): after a BULK (ownerId===null) sweep it
// reclaims the OLD chat-memory embed space via the injected purge op — but never on a singular pass or an
// aborted run (the embedCorpus/embedAssets purge guard, mirrored).

import { describe, vi } from "vitest";
import { memoryBackfillRunner } from "../../../../../packages/server/src/domain/workloads/runners/memory-backfill.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext, RUNNER_OWNER_ID } from "../_support.ts";

describe("memory-backfill runner", () => {
  test("runs the corpus sweep and returns its counts", async () => {
    const env = fakeEnv();
    const result = await memoryBackfillRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.memory.backfill).toHaveBeenCalledWith({
      ownerId: RUNNER_OWNER_ID,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({
      segments: { scanned: 4, changed: 2 },
      digests: { scanned: 6, changed: 3 },
      failed: 0,
    });
  });

  test("a BULK run (ownerId===null) reclaims the old chat-memory space after the sweep", async () => {
    const env = fakeEnv();
    await memoryBackfillRunner(makeRunnerContext(env, { ownerId: null }), {}, vi.fn(), new AbortController().signal);
    expect(env.memory.backfill).toHaveBeenCalledWith({ ownerId: null, signal: expect.any(AbortSignal) });
    expect(env.embeddings.purgeMemoryVectors).toHaveBeenCalledTimes(1);
  });

  test("a SINGULAR per-owner run does NOT purge (a model change is box-level)", async () => {
    const env = fakeEnv();
    await memoryBackfillRunner(makeRunnerContext(env), {}, vi.fn(), new AbortController().signal);
    expect(env.embeddings.purgeMemoryVectors).not.toHaveBeenCalled();
  });

  test("an aborted BULK run does NOT purge (the space stays a strict superset)", async () => {
    const env = fakeEnv();
    const controller = new AbortController();
    controller.abort();
    await memoryBackfillRunner(makeRunnerContext(env, { ownerId: null }), {}, vi.fn(), controller.signal);
    expect(env.embeddings.purgeMemoryVectors).not.toHaveBeenCalled();
  });
});
