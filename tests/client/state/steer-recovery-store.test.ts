// The session-scoped guided-steer recovery ring (F3 — the source's sacred input-recovery, client-only per
// D57). Exercised through the non-hook `__readRecentSteersForTest` snapshot (the reactive `useRecentSteers` needs a
// React render — the `recent-models-store.test.ts` posture). Pins the ring semantics the wand's "Recent
// steers" recall renders FROM: unshift (most-recent-first) · de-dupe on re-fire · cap · blank never stored.

import { __readRecentSteersForTest, __resetRecentSteers, pushFiredSteer, STEER_RECOVERY_CAP } from "@orb/client/state";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("steer-recovery ring", () => {
  beforeEach(() => {
    __resetRecentSteers(); // reset the module singleton between tests.
  });

  test("no fires reads empty", () => {
    expect(__readRecentSteersForTest()).toEqual([]);
  });

  test("push unshifts and de-dupes on re-fire (most-recent-first, no dup)", () => {
    pushFiredSteer("make it darker");
    pushFiredSteer("add tension");
    pushFiredSteer("make it darker"); // re-fire → moves to front, no dup
    expect(__readRecentSteersForTest()).toEqual(["make it darker", "add tension"]);
  });

  test("a blank / whitespace-only steer is never recorded (nothing to recover)", () => {
    pushFiredSteer("");
    pushFiredSteer("   \n\t ");
    expect(__readRecentSteersForTest()).toEqual([]);
  });

  test("stored steers are trimmed", () => {
    pushFiredSteer("  keep going softly  ");
    expect(__readRecentSteersForTest()).toEqual(["keep going softly"]);
  });

  test("caps the ring at STEER_RECOVERY_CAP", () => {
    for (let i = 0; i < STEER_RECOVERY_CAP + 3; i++) {
      pushFiredSteer(`steer ${i}`);
    }
    expect(__readRecentSteersForTest()).toHaveLength(STEER_RECOVERY_CAP);
  });
});
