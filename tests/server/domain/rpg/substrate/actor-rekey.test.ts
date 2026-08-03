// substrate/actor-rekey — the PURE re-key of one actor across every plane that addresses it by key (R4
// promotion). The verb's int test proves the re-key end-to-end at the db row; THIS file pins the arithmetic,
// including the two arms the wire cannot reach: a target the head does not carry, and a destination key the
// head ALREADY carries (a merge of two people into one row — silent, lossy, and exactly the class the op-shaped
// door family exists to make unreachable).
//
// The lock arm is the one worth reading twice. `dismissActor` CLEARS an element's pins because the element is
// gone; promotion MOVES them, because the element is the same person. A re-key that released them would hand
// the model back every field the host had frozen, silently, at the moment the host was rewarding the character.

import type { RpgActorEntry, RpgActorRef, RpgFieldLocks, RpgSnapshotState } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { rekeyActor } from "../../../../../packages/server/src/domain/rpg/substrate/actor-rekey.ts";
import { emptyState, expect, test } from "../_support.ts";

const VESNA: RpgActorRef = { kind: "cast", castKey: "vesna" };
const THORN: RpgActorRef = { kind: "cast", castKey: "thorn" };
/** A promotion destination. The re-key is pure — it never validates the id shape (the snapshot WRITE BOUNDARY
 *  does, at the verb), so a readable stand-in is honest here and unreadable ids would only hide the assertions. */
const CARD: RpgActorRef = { kind: "character", characterId: castId<CharacterId>("character_promoted") };
const CARD_KEY = actorRefKey(CARD);

/** A cast row carrying an identity + a distinguishable volatile half. */
function castRow(castKey: string, status: string): RpgActorEntry {
  return {
    actorRef: { kind: "cast", castKey },
    identity: { name: castKey, emoji: "", mood: "guarded", relationship: { kind: "ally", label: "" }, appearance: "a grey habit" },
    volatile: { trackerValues: { trust: { value: 4, items: null, max: null } }, conditions: [], inventory: [], wallet: [{ name: "gold", amount: 12 }], status },
  };
}

function head(
  actorState: readonly RpgActorEntry[],
  presentCharacters: readonly string[],
  locks: RpgFieldLocks | null,
): { state: RpgSnapshotState; locks: RpgFieldLocks | null } {
  return { state: { ...emptyState(), actorState: [...actorState], presentCharacters: [...presentCharacters] }, locks };
}

test("the row moves IN PLACE — position, volatile half and sibling rows all survive; the identity half does not", () => {
  const before = head([castRow("thorn", "waiting"), castRow("vesna", "limping")], ["cast:thorn", "cast:vesna"], null);

  const result = rekeyActor(before, VESNA, CARD);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  // Position preserved: the panel's roster/cast projections and the band's first-actor-with-state derivation
  // read this array in ORDER, so a re-append would silently reorder what the host sees.
  const keys = result.state.actorState.map((a) => (a.actorRef.kind === "cast" ? `cast:${a.actorRef.castKey}` : "character"));
  expect(keys).toEqual(["cast:thorn", "character"]);
  const moved = result.state.actorState[1];
  expect(moved?.volatile.status).toBe("limping");
  expect(moved?.volatile.trackerValues["trust"]?.value).toBe(4);
  expect(moved?.volatile.wallet).toEqual([{ name: "gold", amount: 12 }]);
  // Dropped by CONSTRUCTION (a roster ref's born row has no identity), never by a field delete a later shape
  // change could miss.
  expect(moved?.identity).toBeUndefined();
  // The sibling is untouched — a re-key is scoped to its actor.
  expect(result.state.actorState[0]?.identity?.name).toBe("thorn");
});

test("presence follows the key, and an OFFSTAGE actor gains no presence on the way", () => {
  const onStage = rekeyActor(head([castRow("vesna", "")], ["cast:vesna"], null), VESNA, CARD);
  expect(onStage.ok && onStage.state.presentCharacters).toEqual([CARD_KEY]);

  // The common case: promotion happens from the Known-characters disclosure, where she is NOT on stage. A
  // re-key that "helpfully" added presence would put a character on the scene the story never brought back.
  const offstage = rekeyActor(head([castRow("vesna", "")], [], null), VESNA, CARD);
  expect(offstage.ok && offstage.state.presentCharacters).toEqual([]);
});

test("every pin at or below the actor's path is RE-BASED — never released, never left dangling on a dead key", () => {
  const locks: RpgFieldLocks = {
    "actorState.cast:vesna.volatile.status": true,
    "actorState.cast:vesna.volatile.trackerValues.trust": true,
    "actorState.cast:vesna.identity.mood": true,
    // A sibling's pin and a whole-plane pin must both survive untouched — the prefix match is `<base>.`, so
    // neither `cast:vesna-elder` (a longer key sharing the prefix) nor the bare plane path is swept up.
    "actorState.cast:thorn.volatile.status": true,
    "actorState.cast:vesna-elder.volatile.status": true,
    actorState: true,
  };
  const result = rekeyActor(head([castRow("vesna", "")], [], locks), VESNA, CARD);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const base = `actorState.${CARD_KEY}`;
  expect(result.locks.lock).toEqual([`${base}.volatile.status`, `${base}.volatile.trackerValues.trust`, `${base}.identity.mood`]);
  expect(result.locks.clear).toEqual([
    "actorState.cast:vesna.volatile.status",
    "actorState.cast:vesna.volatile.trackerValues.trust",
    "actorState.cast:vesna.identity.mood",
  ]);
});

test("REFUSES a target the head does not carry, and a destination it ALREADY carries", () => {
  const missing = rekeyActor(head([castRow("thorn", "")], [], null), VESNA, CARD);
  expect(missing.ok).toBe(false);
  expect(missing.ok === false && missing.reason).toContain("cast:vesna");

  // The merge arm: two rows, one key. Whichever volatile half lost the write would vanish without a trace, so
  // this is a refusal rather than a "last one wins".
  const occupied = rekeyActor(head([castRow("vesna", "limping"), castRow("thorn", "waiting")], [], null), VESNA, THORN);
  expect(occupied.ok).toBe(false);
  expect(occupied.ok === false && occupied.reason).toContain("merge two actors into one row");
});
