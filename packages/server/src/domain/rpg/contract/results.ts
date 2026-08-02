// domain/rpg/contract/results — the shapes the verbs RETURN that aren't already a `@orb/contracts/rpg` view
// (rpg-design/05 §4.4). The read VIEWS (`RpgGameView`/`RpgTrackerView`/`RpgConfigView`/`RpgJournalEntryView`)
// are cross-boundary wire shapes homed in `@orb/contracts/rpg` (§4.8) — this file homes only the
// domain-internal verb results that have no view home: `createGame`'s birth summary, `rollDice`'s baked
// outcome, and `editSnapshot`'s accept/refuse verdict. All are small internal contracts a transport lane later
// maps onto its own wire shape.

import type { RpgActorEntry } from "@orb/contracts/rpg";
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
/** THE HAND-DOOR VERDICT — the ERRORS-AS-DATA channel the input contract promises ("a bad path is
 *  errors-as-data, never a wire reject", `contracts/rpg/inputs.ts`). ONE shape for the three hand doors that
 *  can refuse legibly (`editSnapshot` · `patchActor` · `dismissActor` — R1), because a human at a keyboard
 *  reads the same sentence whichever door they used. The refusal classes:
 *    • an unknown PLANE — a top-level patch key outside `RPG_HAND_PATCH_PLANES` (the `{ambient: null}` class:
 *      a TRACKER-VIEW grouping addressed as if it were state), or an OP-SHAPED plane naming its verb;
 *    • an unreachable DATUM — an op naming an item/condition the actor does not carry, or a dismissal of an
 *      actor the game has no row for;
 *    • an invalid VALUE — the next state failed the F1 write-boundary parse (a `null` cleared onto a
 *      non-nullable leaf, a malformed element).
 *  `reason` says which and why. `ok:true` means the write COMMITTED — never "the call arrived". */
export type HandDoorResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** What the PURE actor-op applier returns (`substrate/actor-ops.ts`): the next row + the FINE lock paths its
 *  ops earned, or an errors-as-data refusal (an op naming an item/condition the actor does not carry). Homed
 *  here because a domain type has no home in the substrate that produces it (substrate-not-a-type-home). */
export type ApplyActorOpsResult =
  | { readonly ok: true; readonly actor: RpgActorEntry; readonly lockPaths: readonly string[] }
  | { readonly ok: false; readonly reason: string };

export interface RollDiceResult {
  readonly notation: string;
  readonly rolls: readonly number[];
  readonly modifier: number;
  readonly total: number;
  readonly stamp: string;
}
