// domain/rpg/substrate/actor-rekey — the PURE re-key of ONE actor across every plane that addresses it by key
// (the actor-state review §4.3 / R4 promotion). Zero I/O: it takes the resolved head's state + locks and a
// from→to ref pair, and returns the next state plus the lock DELTA. The verb (`verbs/promote-actor.ts`) owns
// the authority, the durable card mint, and the write; this module owns "what does it mean to move a person's
// key", so the arithmetic is unit-testable without a db.
//
// AN ACTOR'S KEY IS ADDRESSED FROM THREE PLACES, AND MISSING ONE IS A GHOST — the same three couplings
// `dismissActor` owns, which is why the review called promotion and dismissal "the same op family":
//   • the `actorState` ROW — re-keyed IN PLACE (position preserved: the roster/cast projections and the band's
//     first-actor-with-state derivation read this array in order, so re-appending would silently reorder the
//     panel);
//   • the scene PRESENCE entry — re-keyed if present, left absent if not (presence is a flat `actorRefKey`
//     list since R2, so this is one string swap for every actor kind);
//   • every LOCK at or below the actor's path — RE-BASED, not released. This is the half that is easy to get
//     wrong and impossible to see: a hand pin is the host saying "the story does not get to change this", and
//     a re-key that dropped the pins would hand the model back every field the host had frozen, silently, at
//     the exact moment the host was rewarding the character. `dismissActor` CLEARS these paths because its
//     element is gone; promotion MOVES them because its element is the same person.
//
// THE IDENTITY HALF IS DROPPED, DELIBERATELY (R2 law, not an oversight): `identity` is present for `cast`
// actors and absent for roster ones — a roster member's name is the chat roster's and her standing prose is the
// sheet's, and `applyActorOps`' identity arms REFUSE on a row that carries none. A re-keyed row that kept its
// identity would be a second name home beside the card AND dead data: `applyPresencePatch` writes identity only
// for `cast` refs, so the story could never update it again. The caller carries its DURABLE content onto the
// minted card first (`rpgPromotedCardDescription`); what is left (`mood`, `relationship`) has no roster home.

import type { RpgActorRef, RpgSnapshotState } from "@orb/contracts/rpg";
import { actorRefKey, rpgActorLockBase } from "@orb/contracts/rpg";
import type { HandEditLocks, HandStateHead } from "../contract/service";
import { emptyActorEntry } from "./actor-ops";

/** What a re-key produces: the next state + the lock delta that moves the actor's pins, or an errors-as-data
 *  refusal raised before anything durable happens.
 *  Non-exported: reachable only through {@link rekeyActor}'s signature — no consumer names it (knip). */
type RekeyActorResult =
  | { readonly ok: true; readonly state: RpgSnapshotState; readonly locks: HandEditLocks }
  | { readonly ok: false; readonly reason: string };

/** Move every pin at or below `from`'s path onto `to`'s. Returns the SYMMETRIC delta the hand-write tail
 *  applies: `clear` drops the old paths, `lock` stamps the identical fine sub-paths under the new base. */
function rebaseLocks(head: HandStateHead, from: RpgActorRef, to: RpgActorRef): HandEditLocks {
  const fromBase = rpgActorLockBase(from);
  const toBase = rpgActorLockBase(to);
  const clear: string[] = [];
  const lock: string[] = [];
  for (const path of Object.keys(head.locks ?? {})) {
    if (path !== fromBase && !path.startsWith(`${fromBase}.`)) {
      continue;
    }
    clear.push(path);
    lock.push(`${toBase}${path.slice(fromBase.length)}`);
  }
  return { lock, clear };
}

/** Re-key one actor from `from` to `to` across the state row, the presence entry and the locks.
 *
 *  REFUSES when the head carries no row for `from` (there is no person to move — a stale panel click), and when
 *  it ALREADY carries one for `to` (re-keying onto an occupied key would merge two people into one row, losing
 *  whichever volatile half lost the write; the caller's own collision gate should have caught it, and a silent
 *  merge here is exactly the class this verb family exists to make unreachable).
 *
 *  The re-keyed row is minted through {@link emptyActorEntry} for its `actorRef` and then carries the old row's
 *  VOLATILE half verbatim — so the trackers, conditions, pack, purse and status the story spent the whole
 *  acquaintance writing arrive intact under the new identity, and the identity half is dropped by construction
 *  (a roster ref's empty row has none) rather than by a field delete a later shape change could miss. */
export function rekeyActor(head: HandStateHead, from: RpgActorRef, to: RpgActorRef): RekeyActorResult {
  const fromKey = actorRefKey(from);
  const toKey = actorRefKey(to);
  const index = head.state.actorState.findIndex((a) => actorRefKey(a.actorRef) === fromKey);
  const existing = head.state.actorState[index];
  if (index === -1 || existing === undefined) {
    return { ok: false, reason: `no actor "${fromKey}" in this game's state — nothing to re-key` };
  }
  if (head.state.actorState.some((a) => actorRefKey(a.actorRef) === toKey)) {
    return { ok: false, reason: `this game already tracks "${toKey}" — re-keying onto it would merge two actors into one row` };
  }
  const moved = { ...emptyActorEntry(to), volatile: existing.volatile };
  const actorState = head.state.actorState.map((a, i) => (i === index ? moved : a));
  const presentCharacters = head.state.presentCharacters.map((key) => (key === fromKey ? toKey : key));
  return { ok: true, state: { ...head.state, actorState, presentCharacters }, locks: rebaseLocks(head, from, to) };
}
