// domain/rpg/contract/results — the shapes the verbs RETURN that aren't already a `@orb/contracts/rpg` view
// (rpg-design/05 §4.4). The read VIEWS (`RpgGameView`/`RpgTrackerView`/`RpgConfigView`/`RpgJournalEntryView`)
// are cross-boundary wire shapes homed in `@orb/contracts/rpg` (§4.8) — this file homes only the two
// domain-internal verb results that have no view home: `createGame`'s birth summary and `rollDice`'s baked
// outcome. Both are small internal contracts a transport lane later maps onto its own wire shape.

import type { RpgGameId } from "@orb/kit/ids";

/** `createGame`'s result — the birth summary. `trackersReadOnly` is the honest-arms verdict AT BIRTH (§4.4):
 *  the create succeeds on a non-tool connection but says so, so the client shows the read-only pill from turn
 *  one. `chatId` echoes the pointer target the create wrote. */
export interface CreateGameResult {
  readonly gameId: RpgGameId;
  readonly trackersReadOnly: boolean;
}

/** `rollDice`'s baked outcome (§4.4) — rolled ONCE server-side (CSPRNG), the total + the per-die faces + the
 *  composer stamp text the client inserts (`[dice: …]`). Zero state; seed-replay is rejected upstream. */
export interface RollDiceResult {
  readonly notation: string;
  readonly rolls: readonly number[];
  readonly modifier: number;
  readonly total: number;
  readonly stamp: string;
}
