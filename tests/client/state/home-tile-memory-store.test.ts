// Home tile memory: a gate that settled hidden and a moving tile's column, per device. Pins that settling hidden
// drops the tile's remembered box and that settling visible clears the mark, since both decide a first paint.

import { __readSurfaceBoxForTest, __resetSurfaceBoxes, rememberSurfaceBox } from "@orb/client/state";
import { beforeEach, describe } from "vitest";
import { __readHomeTileMemoryForTest, rememberHomeRegion, rememberHomeTileSettledHidden } from "../../../packages/client/src/state/home-tile-memory-store.ts";
import { expect, test } from "../../support/fixtures.ts";

const ROSTERS = "rosterPreset.rosters";
const STARTER = "chat.quickPicks";

describe("home tile memory", () => {
  beforeEach(() => {
    __resetSurfaceBoxes();
    rememberHomeTileSettledHidden(ROSTERS, false);
  });

  test("settling hidden marks the tile and drops its remembered box", () => {
    rememberSurfaceBox(ROSTERS, 272);
    rememberHomeTileSettledHidden(ROSTERS, true);
    expect(__readHomeTileMemoryForTest().hidden).toContain(ROSTERS);
    expect(__readSurfaceBoxForTest(ROSTERS)).toBeNull();
  });

  test("settling visible again clears the mark, so the next load reserves the tile", () => {
    rememberHomeTileSettledHidden(ROSTERS, true);
    rememberHomeTileSettledHidden(ROSTERS, false);
    expect(__readHomeTileMemoryForTest().hidden).not.toContain(ROSTERS);
  });

  test("a moving tile's latest settled region replaces the earlier one", () => {
    rememberHomeRegion(STARTER, "hearth");
    rememberHomeRegion(STARTER, "shelf");
    expect(__readHomeTileMemoryForTest().regions[STARTER]).toBe("shelf");
  });
});
