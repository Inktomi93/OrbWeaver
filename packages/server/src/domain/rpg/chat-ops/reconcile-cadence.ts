// domain/rpg/chat-ops/reconcile-cadence — the RECONCILE-BEAT check (crunchy-cluster §1.3), homed here because
// BOTH ends of a folded exchange need the SAME verdict for the SAME beat: the GATHER reads it to decide whether
// this turn's terminal tool schema forces establish-EVERYTHING, and the FLUSH reads it to tell its post-commit
// round the same thing. Two copies of the arithmetic would drift into a turn constrained one way and folded the
// other — so it is ONE function.
//
// Derived from a cheap snapshot COUNT (never a stamped counter): the count read BEFORE this beat's own write is
// the number of PRIOR beats, so this beat's ordinal is `count + 1` and a reconcile fires when
// `(count + 1) % N === 0` (beat N, 2N, 3N…). `N <= 0` is OFF (opt-out — byte-identical to the pre-cadence
// round). The gather and the flush both read it before the flush writes, so they see the same count.

import type { Db } from "@orb/db";
import type { RpgGameRow } from "../contract/service";
import { countSnapshots } from "../persistence/snapshots";

/** Is THIS beat the `reconcileEveryBeats`-th (so the round/fold re-emits the full refreshable planes and a
 *  drifted panel self-heals)? Locks stay lock-protected at the merge — a reconcile never clobbers a hand-pin. */
export async function isReconcileBeat(db: Db, game: RpgGameRow): Promise<boolean> {
  const n = game.config.reconcileEveryBeats;
  if (n <= 0) {
    return false; // opt-out — reconcile disabled for this game
  }
  const priorBeats = await countSnapshots(db, game.id);
  return (priorBeats + 1) % n === 0;
}
