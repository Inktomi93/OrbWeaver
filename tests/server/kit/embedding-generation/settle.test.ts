// The settle loop's contract: a round counts only when no target moved under it, a supersede with no move behind it
// is a fault rather than a spin, and an abort never buys another round.

import { describe } from "vitest";
import { GenerationSupersededError, runUntilSettled } from "../../../../packages/server/src/kit/embedding-generation/index.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = "user_settle";

/** A target store whose epoch the test bumps from inside a round. */
function targets(): { readonly snapshot: () => Promise<string>; readonly move: () => void } {
  let epoch = 1;
  return {
    snapshot: () => Promise.resolve(`${OWNER}:embed:${String(epoch)}`),
    move: (): void => {
      epoch += 1;
    },
  };
}

describe("runUntilSettled", () => {
  test("a round a move raced goes again, and only the first round is told it is first", async () => {
    const t = targets();
    const firsts: boolean[] = [];

    const result = await runUntilSettled({
      snapshot: t.snapshot,
      signal: new AbortController().signal,
      round: (first) => {
        firsts.push(first);
        if (firsts.length === 1) {
          t.move();
        }
        return Promise.resolve(firsts.length);
      },
    });

    expect(result).toBe(2);
    expect(firsts).toEqual([true, false]);
  });

  test("a supersede after a real move goes again; one with no move behind it is rethrown", async () => {
    const t = targets();
    let rounds = 0;
    const moved = await runUntilSettled({
      snapshot: t.snapshot,
      signal: new AbortController().signal,
      round: () => {
        rounds += 1;
        if (rounds === 1) {
          t.move();
          return Promise.reject(new GenerationSupersededError(OWNER, "memory"));
        }
        return Promise.resolve("settled");
      },
    });
    expect(moved).toBe("settled");

    let unmovedRounds = 0;
    const unmoved = runUntilSettled({
      snapshot: t.snapshot,
      signal: new AbortController().signal,
      round: () => {
        unmovedRounds += 1;
        return Promise.reject(new GenerationSupersededError(OWNER, "memory"));
      },
    });
    await expect(unmoved).rejects.toBeInstanceOf(GenerationSupersededError);
    expect(unmovedRounds).toBe(1);
  });

  test("an aborted round ends the run with no extra round, whether it returned or was superseded", async () => {
    const t = targets();
    const returned = new AbortController();
    let returnedRounds = 0;
    await runUntilSettled({
      snapshot: t.snapshot,
      signal: returned.signal,
      round: () => {
        returnedRounds += 1;
        t.move();
        returned.abort();
        return Promise.resolve(null);
      },
    });
    expect(returnedRounds).toBe(1);

    const superseded = new AbortController();
    let supersededRounds = 0;
    const run = runUntilSettled({
      snapshot: t.snapshot,
      signal: superseded.signal,
      round: () => {
        supersededRounds += 1;
        t.move();
        superseded.abort();
        return Promise.reject(new GenerationSupersededError(OWNER, "card"));
      },
    });
    await expect(run).rejects.toBeInstanceOf(GenerationSupersededError);
    expect(supersededRounds).toBe(1);
  });
});
