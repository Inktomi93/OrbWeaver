// The shared whole-`actorState` overlay builder for the volatile hand edits (Status trackers/conditions/status,
// Sheet wallet — every `editSnapshot` write on the per-actor volatile plane). The wire shape is a FULL
// `actorState` array replace ([merge-clear]); the server's keyed-array grammar (substrate/merge.ts)
// correlates elements by `actorRefKey`, so the FINE lock paths this module also derives
// (`actorState.<refKey>.<field>[…]`, the #10 per-field pin) address exactly the value the hand touched.
// A target actor with no volatile row yet gets one MINTED here (an empty volatile the mutate seeds), so a
// first hand edit on a fresh actor is a real write, never a silent no-op — but the mint is the LAST resort:
// the overlay always seeds from the actor's ACTUAL existing row, read from BOTH halves of the plane.

import type { RpgActorRef, RpgActorView, RpgActorVolatile, RpgSnapshotState, RpgTrackerValue, RpgTrackerView } from "@orb/contracts/rpg";
import { actorRefKey, RPG_TRACKER_VALUE_EMPTY } from "@orb/contracts/rpg";

/** The tracker view's WHOLE per-actor volatile plane — both halves. The roster half rides `actors[].volatile`;
 *  a scene-cast NPC's `cast:<key>` row is projected SEPARATELY under `castVolatile` (the cast row itself is
 *  scene IDENTITY and carries no volatile), so a builder that reads only `actors` is blind to every NPC. */
type VolatilePlane = Pick<RpgTrackerView, "actors" | "castVolatile">;

/** The empty volatile plane a first hand edit seeds for an actor with no state row yet. */
function emptyVolatile(actorRef: RpgActorRef): RpgActorVolatile {
  return { actorRef, hp: null, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" };
}

/** The target's EXISTING volatile row, wherever the view homes it — roster half first, then `castVolatile`
 *  for a `cast:` ref. Seeding the overlay from this (never from `emptyVolatile`) is what keeps a hand edit
 *  ADDITIVE at the leaf: the empty row's `hp: null` / `inventory: []` / `wallet: []` / `status: ""` are
 *  AUTHORED values, so minting one over a populated NPC clears her state — a loss the server's additive
 *  keyed-plane policy cannot undo (it can only preserve rows a write OMITS, not fields it names). */
function existingVolatile(plane: VolatilePlane, targetRef: RpgActorRef): RpgActorVolatile | null {
  const targetKey = actorRefKey(targetRef);
  const roster = plane.actors.find((a) => actorRefKey(a.actorRef) === targetKey)?.volatile ?? null;
  if (roster !== null) {
    return roster;
  }
  return targetRef.kind === "cast" ? (plane.castVolatile[targetRef.castKey] ?? null) : null;
}

/** Build the whole-`actorState` overlay with ONE actor's volatile mutated (matched by `actorRefKey`).
 *  Every ROSTER actor with volatile is re-sent; a target the roster half doesn't carry is seeded from its
 *  `castVolatile` row (else minted empty) and appended. */
export function actorStatePatch(
  plane: VolatilePlane,
  targetRef: RpgActorRef,
  mutate: (v: RpgActorVolatile) => RpgActorVolatile,
): { readonly actorState: RpgSnapshotState["actorState"] } {
  const targetKey = actorRefKey(targetRef);
  const carrying = plane.actors.filter((a): a is RpgActorView & { volatile: RpgActorVolatile } => a.volatile !== null);
  const found = carrying.some((a) => actorRefKey(a.actorRef) === targetKey);
  const actorState = carrying.map((a) => (actorRefKey(a.actorRef) === targetKey ? mutate(a.volatile) : a.volatile));
  if (!found) {
    actorState.push(mutate(existingVolatile(plane, targetRef) ?? emptyVolatile(targetRef)));
  }
  return { actorState };
}

/** The per-actor lock-path base (#10) — `actorState.<refKey>`; append `.status` / `.trackerValues.<key>` /
 *  `.wallet.<name>` / `.conditions` / `.inventory` for the fine pin the edit stamps. */
export function actorLockBase(ref: RpgActorRef): string {
  return `actorState.${actorRefKey(ref)}`;
}

/** Overlay ONE tracker's reading (and/or its per-carrier ceiling override) on an actor's volatile plane,
 *  keeping the value TOTAL (`{value,items,max}` always whole — the snapshot merge recurses into this object,
 *  so a partial write would strand the previous reading's siblings on the new one). */
export function writeTrackerValue(v: RpgActorVolatile, key: string, patch: Partial<RpgTrackerValue>): RpgActorVolatile {
  return { ...v, trackerValues: { ...v.trackerValues, [key]: { ...RPG_TRACKER_VALUE_EMPTY, ...v.trackerValues[key], ...patch } } };
}
