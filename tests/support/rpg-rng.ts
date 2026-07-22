// tests/support/rpg-rng — a scripted `Rng` for the rpg substrate goldens. Returns queued values so a
// golden pins the EXACT branch (a natural-1 fumble, a specific weather pick) without depending on the
// mulberry32 stream internals — `createSeededRng`'s own determinism is pinned separately in rng.test.ts.
// A determinism seam (tests/support/), exempt from the test-determinism/test-layout gates.

import type { Rng } from "../../packages/server/src/domain/rpg/contract/rng.ts";

interface Script {
  /** Values handed back by `int(...)`, in order. */
  readonly ints?: readonly number[];
  /** Indices `pick(arr)` selects (into the passed array), in order. */
  readonly picks?: readonly number[];
  /** Booleans `chance(p)` returns, in order. */
  readonly chances?: readonly boolean[];
}

/** A deterministic `Rng` driven by explicit queues. Exhausting a queue throws — an under-specified golden
 *  is a test bug, not a silent default. */
export function scriptedRng(script: Script): Rng {
  const ints = [...(script.ints ?? [])];
  const picks = [...(script.picks ?? [])];
  const chances = [...(script.chances ?? [])];
  return {
    int(minIncl: number, maxIncl: number): number {
      if (ints.length === 0) {
        throw new Error("scriptedRng: int() queue exhausted");
      }
      const v = ints.shift() as number;
      if (v < minIncl || v > maxIncl) {
        throw new Error(`scriptedRng: int() value ${v} out of range [${minIncl}, ${maxIncl}]`);
      }
      return v;
    },
    pick<T>(arr: readonly T[]): T {
      if (picks.length === 0) {
        throw new Error("scriptedRng: pick() queue exhausted");
      }
      return arr[picks.shift() as number] as T;
    },
    chance(): boolean {
      if (chances.length === 0) {
        throw new Error("scriptedRng: chance() queue exhausted");
      }
      return chances.shift() as boolean;
    },
  };
}
