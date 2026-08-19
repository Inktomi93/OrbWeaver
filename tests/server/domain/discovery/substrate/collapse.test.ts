// Unit: content-hash collapse (esoteric #3) — one min-id rep per hash, stable rep order, repOf back-mapping.

import { describe } from "vitest";
import { collapseByHash, collapsedPairCount } from "../../../../../packages/server/src/domain/discovery/substrate/collapse.ts";
import { expect, test } from "../../../../support/fixtures.ts";

interface Row {
  readonly id: string;
  readonly hash: string;
}

describe("collapseByHash", () => {
  test("collapses to one min-id representative per hash", () => {
    const rows: Row[] = [
      { id: "c", hash: "h1" },
      { id: "a", hash: "h1" },
      { id: "b", hash: "h2" },
    ];
    const { reps, repOf } = collapseByHash(
      rows,
      (r) => r.hash,
      (r) => r.id,
    );
    // Two distinct hashes ⇒ two reps; min-id per hash (h1→a, h2→b); ordered by rep id ascending.
    expect(reps.map((r) => r.id)).toEqual(["a", "b"]);
    // rows[0]=c(h1)→rep a (index 0); rows[1]=a(h1)→0; rows[2]=b(h2)→1.
    expect(repOf).toEqual([0, 0, 1]);
  });

  test("N byte-identical rows collapse to a single rep", () => {
    const rows: Row[] = [
      { id: "x1", hash: "same" },
      { id: "x2", hash: "same" },
      { id: "x3", hash: "same" },
    ];
    const { reps, repOf } = collapseByHash(
      rows,
      (r) => r.hash,
      (r) => r.id,
    );
    expect(reps).toHaveLength(1);
    expect(repOf).toEqual([0, 0, 0]);
  });
});

describe("collapsedPairCount — the near-duplicate finder's blind spot, as a number", () => {
  test("counts the pairs the collapse removes, and nothing else", () => {
    // Two identical + three identical + one alone: C(2,2)=1 and C(3,2)=3 pairs the all-pairs scan can
    // never see, because only one representative per hash survives to be scanned.
    const rows: Row[] = [
      { id: "a", hash: "h1" },
      { id: "b", hash: "h1" },
      { id: "c", hash: "h2" },
      { id: "d", hash: "h2" },
      { id: "e", hash: "h2" },
      { id: "f", hash: "h3" },
    ];
    expect(
      collapsedPairCount(
        rows,
        (r) => r.hash,
        (r) => r.id,
      ),
    ).toBe(4);
  });

  test("a library with no identical cards has no blind spot", () => {
    const rows: Row[] = [
      { id: "a", hash: "h1" },
      { id: "b", hash: "h2" },
    ];
    expect(
      collapsedPairCount(
        rows,
        (r) => r.hash,
        (r) => r.id,
      ),
    ).toBe(0);
  });

  test("one card embedded in two spaces is ONE card, not a duplicate of itself", () => {
    // The read is per (character, model) row, so the same card appears twice under the same hash. Counting
    // rows instead of entities would invent a duplicate for every card in a second embedding space.
    const rows: Row[] = [
      { id: "a", hash: "h1" },
      { id: "a", hash: "h1" },
    ];
    expect(
      collapsedPairCount(
        rows,
        (r) => r.hash,
        (r) => r.id,
      ),
    ).toBe(0);
  });
});
