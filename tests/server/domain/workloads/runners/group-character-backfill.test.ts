// Runner test: group-character-backfill — the INERT P5 stub. Returns a DeferredResult and does NOT touch
// the (declared-but-deferred) character env op.

import { describe, expect, test, vi } from "vitest";
import { groupCharacterBackfillRunner } from "../../../../../packages/server/src/domain/workloads/runners/group-character-backfill.ts";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("group-character-backfill runner (P5 stub)", () => {
  test("is inert — returns deferred and mints no group character", async () => {
    const env = fakeEnv();
    const result = await groupCharacterBackfillRunner(
      makeRunnerContext(env),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(result).toEqual({ deferred: true });
    expect(env.character.mintSyntheticGroupCharacter).not.toHaveBeenCalled();
  });
});
