import { describe } from "vitest";
import { spanWitnessed } from "../../../../../../../packages/server/src/domain/chat/memory/generate/substrate/witnessing.ts";
import type { WitnessInterval } from "../../../../../../../packages/server/src/domain/chat/memory/types.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";

describe("memory/generate/substrate/witnessing — spanWitnessed", () => {
  test("a span fully inside a present interval is witnessed", () => {
    expect(spanWitnessed(9, 16, [{ joinSeq: 1, leftSeq: null }])).toBe(true);
  });

  test("a pre-join span is NOT witnessed (joinSeq after the span end)", () => {
    expect(spanWitnessed(1, 8, [{ joinSeq: 9, leftSeq: null }])).toBe(false);
  });

  test("leftSeq is EXCLUSIVE — a span starting at leftSeq is not witnessed", () => {
    // present for [1, 9) → seq 9 is gone; the block [9,16] does not overlap.
    expect(spanWitnessed(9, 16, [{ joinSeq: 1, leftSeq: 9 }])).toBe(false);
  });

  test("a kicked interval is invisible; a later re-add interval is visible (multiple intervals)", () => {
    const horizons: WitnessInterval[] = [
      { joinSeq: 1, leftSeq: 9 },
      { joinSeq: 17, leftSeq: null },
    ];
    expect(spanWitnessed(1, 8, horizons)).toBe(true); // first episode
    expect(spanWitnessed(9, 16, horizons)).toBe(false); // the kicked gap
    expect(spanWitnessed(17, 24, horizons)).toBe(true); // re-added
  });

  test("partial overlap counts as witnessed (present for part of the span)", () => {
    // joined mid-block (seq 5) → the block [1,8] overlaps [5, …) → witnessed.
    expect(spanWitnessed(1, 8, [{ joinSeq: 5, leftSeq: null }])).toBe(true);
  });

  test("empty horizons → never witnessed (no presence)", () => {
    expect(spanWitnessed(1, 8, [])).toBe(false);
  });

  test("a span straddling the LEAVE boundary is witnessed (present for PART of the span)", () => {
    // present for [1, 5) — the block [1,8] overlaps [1,5): joinSeq 1 ≤ 8 AND leftSeq 5 > seqStart 1 → witnessed.
    // (a `leftSeq >= seqStart` mutation → `leftSeq > seqStart` flip would NOT change this; a `leftSeq > seqEnd`
    //  over-tightening would WRONGLY drop it — this locks "part-of-span counts".)
    expect(spanWitnessed(1, 8, [{ joinSeq: 1, leftSeq: 5 }])).toBe(true);
  });

  test("the JOIN boundary is inclusive at seqEnd, exclusive at seqEnd+1 (a block straddling the join)", () => {
    // a block [1,8] whose LAST seq is exactly the join → witnessed (joinSeq 8 ≤ seqEnd 8).
    expect(spanWitnessed(1, 8, [{ joinSeq: 8, leftSeq: null }])).toBe(true);
    // join one past the block end → the whole block is pre-join → NOT witnessed (a `joinSeq < seqEnd` vs
    // `joinSeq <= seqEnd` mutation flips exactly this case).
    expect(spanWitnessed(1, 8, [{ joinSeq: 9, leftSeq: null }])).toBe(false);
  });
});
