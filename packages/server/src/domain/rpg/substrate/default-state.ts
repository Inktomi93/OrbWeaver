// domain/rpg/substrate/default-state — the PURE default snapshot state a read synthesizes when a game has NO
// snapshot rows yet (orchestrator ruling: createGame seeds NO born snapshot; `rpg_snapshots.messageId/
// variantId` stay non-nullable — a turnless game simply has zero rows). The resolution ladder returns
// `undefined` for such a game (W1a rung 4), so `getTrackerView` (and later the gather) fall back to THIS: the
// empty steady state — null ambient, empty planes, no quests, no locks. Zero I/O; the config is passed in (the
// caller reads the game row). This is the SAME shape a born snapshot would have carried, so the read is
// byte-identical whether the first turn has run or not.

import type { RpgSnapshotState } from "@orb/contracts/rpg";

/** The empty steady-state snapshot (a turnless game's synthesized state). Mirrors the createGame born-seed
 *  shape exactly — null clock/weather/date, empty planes, `quests: []`, no locks. */
export function defaultSnapshotState(): RpgSnapshotState {
  return {
    clock: null,
    calendarDate: null,
    location: "",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [],
    widgetValues: {},
    quests: [],
    fieldLocks: null,
  };
}
