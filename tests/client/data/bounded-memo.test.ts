// The two memo primitives every per-tab cache in `data/` is built from. Both are invisible through their
// callers — a hook returns the same URL whether the map is capped or not, and whether a failure was evicted
// or not — so both are pinned on the primitive directly. The BEHAVIOUR they exist for is pinned where a user
// can see it: `use-card-frame.ct.tsx` / `use-plugin-frame.ct.tsx` (a failed mint that re-mints).
//
// Direct source import (not a barrel): these are module-internal primitives exported `@public` for the pins.

import { describe } from "vitest";
import { forgetIfCurrent, rememberBounded } from "../../../packages/client/src/data/bounded-memo.ts";
import { expect, test } from "../../support/fixtures.ts";

describe("rememberBounded — a memo cannot grow without bound", () => {
  test("evicts the oldest entries once the cap is reached, so size never exceeds the cap", () => {
    const map = new Map<string, number>();
    const cap = 3;
    for (let i = 0; i < 6; i += 1) {
      rememberBounded(map, `k${i}`, i, cap);
    }
    expect(map.size).toBe(cap);
    // The three oldest keys evicted in insertion (LRU) order; only the newest `cap` survive.
    expect([...map.keys()]).toEqual(["k3", "k4", "k5"]);
    expect(map.has("k0")).toBe(false);
  });

  test("a repeated key is an LRU touch — it moves to the tail and survives the next eviction", () => {
    const map = new Map<string, number>();
    const cap = 3;
    rememberBounded(map, "a", 1, cap);
    rememberBounded(map, "b", 2, cap);
    rememberBounded(map, "c", 3, cap);
    rememberBounded(map, "a", 10, cap); // re-serve "a": touch to tail (order → b, c, a) AND refresh its value
    rememberBounded(map, "d", 4, cap); // at cap: evict the OLDEST ("b"), not the just-touched "a"
    expect([...map.keys()]).toEqual(["c", "a", "d"]);
    expect(map.get("a")).toBe(10);
    expect(map.has("b")).toBe(false);
  });
});

describe("forgetIfCurrent — a memo takes back an answer that was never true", () => {
  test("removes the key it was given", () => {
    const map = new Map<string, string>([["body", "failed"]]);
    forgetIfCurrent(map, "body", "failed");
    expect(map.has("body")).toBe(false);
  });

  // THE IDENTITY GUARD, and the whole reason this is a helper rather than a `map.delete`. The removal is
  // driven by an ASYNC settlement, so by the time it runs a later caller may already have replaced the entry
  // with a fresh attempt for the same key. An unconditional delete would throw that attempt away — every
  // caller already waiting on it would be stranded, and the next reader would start a third one.
  test("leaves a REPLACED entry alone — a late failure must not evict the retry that superseded it", () => {
    const map = new Map<string, string>([["body", "second attempt"]]);
    forgetIfCurrent(map, "body", "first attempt");
    expect(map.get("body")).toBe("second attempt");
  });

  test("a key that is already gone is a no-op, not a throw", () => {
    const map = new Map<string, string>();
    expect(() => forgetIfCurrent(map, "body", "failed")).not.toThrow();
    expect(map.size).toBe(0);
  });
});
