import { createBoundedRing } from "@orb/kit/bounded-ring";
import { expect, test } from "../../support/fixtures.ts";

test("reads NEWEST-FIRST — the troubleshooting-tail order every recorder consumes", () => {
  const ring = createBoundedRing<string>(4);
  ring.push("a");
  ring.push("b");
  ring.push("c");
  expect(ring.recent()).toEqual(["c", "b", "a"]);
  expect(ring.size()).toBe(3);
});

test("EVICTION: a push past capacity overwrites the OLDEST slot, and size stops at capacity", () => {
  const ring = createBoundedRing<number>(3);
  for (const n of [1, 2, 3, 4, 5]) {
    ring.push(n);
  }
  // 1 and 2 are gone — the ring never grows past its allocation.
  expect(ring.recent()).toEqual([5, 4, 3]);
  expect(ring.size()).toBe(3);
});

test("eviction survives MANY wraps (the head arithmetic, not just the first lap)", () => {
  const ring = createBoundedRing<number>(4);
  for (let i = 0; i < 103; i += 1) {
    ring.push(i);
  }
  expect(ring.recent()).toEqual([102, 101, 100, 99]);
  expect(ring.size()).toBe(4);
});

test("recent(limit) caps the tail; a limit above the retained count is not padded", () => {
  const ring = createBoundedRing<string>(5);
  ring.push("a");
  ring.push("b");
  expect(ring.recent(1)).toEqual(["b"]);
  expect(ring.recent(99)).toEqual(["b", "a"]);
  expect(ring.recent(0)).toEqual([]);
});

test("newestFirst() is LAZY — a filtered read can break early instead of materializing the ring", () => {
  const ring = createBoundedRing<number>(1000);
  for (let i = 0; i < 1000; i += 1) {
    ring.push(i);
  }
  const seen: number[] = [];
  for (const value of ring.newestFirst()) {
    if (value % 2 === 0) {
      seen.push(value);
    }
    if (seen.length === 3) {
      break;
    }
  }
  expect(seen).toEqual([998, 996, 994]);
});

test("clear() drops everything — the test-isolation door (a prior run's records never bleed)", () => {
  const ring = createBoundedRing<string>(2);
  ring.push("a");
  ring.push("b");
  ring.clear();
  expect(ring.size()).toBe(0);
  expect(ring.recent()).toEqual([]);
  // and it is still usable afterwards, with its full capacity
  ring.push("c");
  ring.push("d");
  ring.push("e");
  expect(ring.recent()).toEqual(["e", "d"]);
});

test("a capacity of 1 keeps exactly the last value (the degenerate ring still evicts correctly)", () => {
  const ring = createBoundedRing<string>(1);
  ring.push("a");
  ring.push("b");
  expect(ring.recent()).toEqual(["b"]);
  expect(ring.size()).toBe(1);
});

test("a non-positive or fractional capacity THROWS — a silently-retains-nothing ring reads exactly like an unwired recorder", () => {
  expect(() => createBoundedRing<string>(0)).toThrow(RangeError);
  expect(() => createBoundedRing<string>(-1)).toThrow(RangeError);
  expect(() => createBoundedRing<string>(2.5)).toThrow(RangeError);
});
