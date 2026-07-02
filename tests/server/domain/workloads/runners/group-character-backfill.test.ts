// Runner test: group-character-backfill (PD-41/D38) — wraps ctx.env.character.backfillGroupCharacters,
// threads the signal, and returns the scanned/minted counts.

import { describe, vi } from "vitest";
import { groupCharacterBackfillRunner } from "../../../../../packages/server/src/domain/workloads/runners/group-character-backfill.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

describe("group-character-backfill runner", () => {
  test("runs the group-room sweep and returns its counts", async () => {
    const env = fakeEnv();
    const result = await groupCharacterBackfillRunner(
      makeRunnerContext(env),
      {},
      vi.fn(),
      new AbortController().signal,
    );
    expect(env.character.backfillGroupCharacters).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ scanned: 5, changed: 1 });
  });
});
