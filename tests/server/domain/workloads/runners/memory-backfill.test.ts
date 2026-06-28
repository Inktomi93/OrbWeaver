// Runner test: memory-backfill — the INERT P5 stub. Returns a DeferredResult and does NOT touch the
// (declared-but-deferred) memory env op.

import { describe, expect, test, vi } from "vitest";
import { memoryBackfillRunner } from "../../../../../packages/server/src/domain/workloads/runners/memory-backfill.ts";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("memory-backfill runner (P5 stub)", () => {
  test("is inert — returns deferred and calls no memory op", async () => {
    const env = fakeEnv();
    const result = await memoryBackfillRunner(
      makeRunnerContext(env),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(result).toEqual({ deferred: true });
    expect(env.memory.generateDigests).not.toHaveBeenCalled();
    expect(env.memory.generateSegments).not.toHaveBeenCalled();
  });
});
