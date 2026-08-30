// substrate/default-state — the PURE default snapshot state a turnless game's read synthesizes. Pins: the
// shape mirrors the createGame born-seed exactly (null ambient, empty planes, no locks) — the state must be
// byte-identical whether the first turn has run or not.

import { describe } from "vitest";
import { defaultSnapshotState } from "../../../../../packages/server/src/domain/rpg/substrate/default-state.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("defaultSnapshotState", () => {
  test("the empty steady state: null ambient, empty planes, no quests, no locks", () => {
    expect(defaultSnapshotState()).toEqual({
      clock: null,
      calendarDate: null,
      location: "",
      weather: null,
      presentCharacters: [],
      recentEvents: [],
      actorState: [],
      trackerValues: {},
      quests: [],
      plot: null,
      fieldLocks: null,
    });
  });

  test("two calls never share array/object references (each caller gets its own mutable copy)", () => {
    const a = defaultSnapshotState();
    const b = defaultSnapshotState();
    expect(a.recentEvents).not.toBe(b.recentEvents);
    expect(a.trackerValues).not.toBe(b.trackerValues);
  });
});
