// The shared whole-`actorState` overlay builder for the volatile hand edits (Status pools/conditions/status,
// Sheet wallet — every `editSnapshot` write on the per-actor volatile plane). The wire shape is a FULL
// `actorState` array replace ([merge-clear]); the server's keyed-array grammar (substrate/merge.ts)
// correlates elements by `actorRefKey`, so the FINE lock paths this module also derives
// (`actorState.<refKey>.<field>[…]`, the #10 per-field pin) address exactly the value the hand touched.
// A target actor with no volatile row yet gets one MINTED here (an empty volatile the mutate seeds), so a
// first hand edit on a fresh actor is a real write, never a silent no-op.

import type { RpgActorRef, RpgActorView, RpgActorVolatile, RpgSnapshotState } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";

/** The empty volatile plane a first hand edit seeds for an actor with no state row yet. */
function emptyVolatile(actorRef: RpgActorRef): RpgActorVolatile {
  return { actorRef, hp: null, pools: [], conditions: [], inventory: [], wallet: [], status: "" };
}

/** Build the whole-`actorState` overlay with ONE actor's volatile mutated (matched by `actorRefKey`).
 *  Every actor with volatile is re-sent; a target with no volatile row is minted + appended. */
export function actorStatePatch(
  actors: readonly RpgActorView[],
  targetRef: RpgActorRef,
  mutate: (v: RpgActorVolatile) => RpgActorVolatile,
): { readonly actorState: RpgSnapshotState["actorState"] } {
  const targetKey = actorRefKey(targetRef);
  const carrying = actors.filter((a): a is RpgActorView & { volatile: RpgActorVolatile } => a.volatile !== null);
  const found = carrying.some((a) => actorRefKey(a.actorRef) === targetKey);
  const actorState = carrying.map((a) => (actorRefKey(a.actorRef) === targetKey ? mutate(a.volatile) : a.volatile));
  if (!found) {
    actorState.push(mutate(emptyVolatile(targetRef)));
  }
  return { actorState };
}

/** The per-actor lock-path base (#10) — `actorState.<refKey>`; append `.status` / `.pools.<name>` /
 *  `.wallet.<name>` / `.conditions` for the fine pin the edit stamps. */
export function actorLockBase(ref: RpgActorRef): string {
  return `actorState.${actorRefKey(ref)}`;
}
