// The home-tile BOX MEMORY store (F14 boot CLS): what a tile's loading skeleton is allowed to reserve.
// Exercised through the non-hook `__readHomeTileBoxForTest` snapshot (the reactive `useHomeTileBox` needs
// a React render — the `recent-models-store.test.ts` posture). Persistence itself is the
// createPersistedStore door (its own slice test); this pins the guard that decides what gets remembered,
// because the value is written straight into a `min-block-size` — a garbage measurement (0, NaN, a
// detached-node height) would reserve a garbage box on every subsequent boot.

import { __readHomeTileBoxForTest, __resetHomeTileBoxes, rememberHomeTileBox } from "@orb/client/state";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const TILE = "chat.recents";

describe("home-tile box memory", () => {
  beforeEach(() => {
    __resetHomeTileBoxes();
  });

  test("a tile this device has never seen settle reserves NOTHING", () => {
    expect(__readHomeTileBoxForTest(TILE)).toBeNull();
  });

  test("a measured height is remembered per tile (no cross-tile bleed)", () => {
    rememberHomeTileBox(TILE, 422);
    rememberHomeTileBox("chat.tempChat", 168);
    expect(__readHomeTileBoxForTest(TILE)).toBe(422);
    expect(__readHomeTileBoxForTest("chat.tempChat")).toBe(168);
  });

  test("a later measurement replaces the earlier one (the box self-heals as the data changes)", () => {
    rememberHomeTileBox(TILE, 422);
    rememberHomeTileBox(TILE, 296);
    expect(__readHomeTileBoxForTest(TILE)).toBe(296);
  });

  test("a non-measurement is dropped, leaving the previous box intact", () => {
    rememberHomeTileBox(TILE, 422);
    // 0 = an unmounted/hidden body; NaN = a torn measurement; the cap = a mis-measured detached node.
    // Each would otherwise be reserved verbatim on the next boot.
    rememberHomeTileBox(TILE, 0);
    rememberHomeTileBox(TILE, Number.NaN);
    rememberHomeTileBox(TILE, 40_000);
    expect(__readHomeTileBoxForTest(TILE)).toBe(422);
  });
});
