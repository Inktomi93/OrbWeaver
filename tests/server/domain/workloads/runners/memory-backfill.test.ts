// Runner test: memory-backfill (PD-41) — wraps ctx.env.memory.backfill (chat's corpus sweep), threads the
// signal, and returns the folded segment/digest counts.

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
    });
  });
});
