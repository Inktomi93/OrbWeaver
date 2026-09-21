// The home-tile BOX MEMORY store (F14 boot CLS): what a tile's loading skeleton is allowed to reserve.
// Exercised through the non-hook `__readSurfaceBoxForTest` snapshot because the reactive `useSurfaceBox`
// needs a React render. Persistence itself is the
// createPersistedStore door (its own slice test); this pins the guard that decides what gets remembered,
// because the value is written straight into a `min-block-size` — a garbage measurement (0, NaN, a
// detached-node height) would reserve a garbage box on every subsequent boot.

import { __readSurfaceBoxForTest, __resetSurfaceBoxes, rememberSurfaceBox } from "@orb/client/state";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const TILE = "chat.recents";

describe("home-tile box memory", () => {
  beforeEach(() => {
    __resetSurfaceBoxes();
  });

  test("a tile this device has never seen settle reserves NOTHING", () => {
    expect(__readSurfaceBoxForTest(TILE)).toBeNull();
  });

  test("a measured height is remembered per tile (no cross-tile bleed)", () => {
    rememberSurfaceBox(TILE, 422);
    rememberSurfaceBox("chat.tempChat", 168);
    expect(__readSurfaceBoxForTest(TILE)).toBe(422);
    expect(__readSurfaceBoxForTest("chat.tempChat")).toBe(168);
  });

  test("a later measurement replaces the earlier one (the box self-heals as the data changes)", () => {
    rememberSurfaceBox(TILE, 422);
    rememberSurfaceBox(TILE, 296);
    expect(__readSurfaceBoxForTest(TILE)).toBe(296);
  });

  test("a non-measurement is dropped, leaving the previous box intact", () => {
    rememberSurfaceBox(TILE, 422);
    // 0 = an unmounted/hidden body; NaN = a torn measurement; the cap = a mis-measured detached node.
    // Each would otherwise be reserved verbatim on the next boot.
    rememberSurfaceBox(TILE, 0);
    rememberSurfaceBox(TILE, Number.NaN);
    rememberSurfaceBox(TILE, 40_000);
    expect(__readSurfaceBoxForTest(TILE)).toBe(422);
  });
});
