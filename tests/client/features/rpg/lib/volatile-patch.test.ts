// Unit: the shared `actorState` overlay builder every hand edit writes through. The load-bearing fact is
// that the overlay seeds from the target's ACTUAL existing row — and the plane has TWO halves: roster
// members ride `actors[].volatile`, a scene-cast NPC's `cast:<key>` row is projected only under
// `castVolatile`. Reading the roster half alone made every cast edit mint an EMPTY volatile, whose
// `hp: null` / `inventory: []` / `wallet: []` / `status: ""` are AUTHORED into the write — a clear the
// server's additive keyed-plane policy (b962df48) cannot undo, because it preserves rows a write OMITS,
// never fields it NAMES. So: edit one NPC tracker, keep her hp, pack, purse and status.

import type { RpgActorRef, RpgActorView, RpgActorVolatile, RpgTrackerView } from "@orb/contracts/rpg";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { actorStatePatch, writeTrackerValue } from "../../../../../packages/client/src/features/rpg/lib/volatile-patch";
import { expect, test } from "../../../../support/fixtures";

const MARA: CharacterId = castId<CharacterId>("character_mara");
const MARA_REF: RpgActorRef = { kind: "character", characterId: MARA };
const SERA_REF: RpgActorRef = { kind: "cast", castKey: "sera" };

function volatileRow(actorRef: RpgActorRef, over: Partial<RpgActorVolatile> = {}): RpgActorVolatile {
  return { actorRef, hp: null, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "", ...over };
}

function rosterActor(volatile: RpgActorVolatile | null): RpgActorView {
  return {
    actorRef: MARA_REF,
    name: "Mara",
    sheet: { className: "Warden", attributes: {}, maxHp: null, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
    trackers: [],
    volatile,
  };
}

/** The populated NPC row the panel can SEE (`castVolatile`) but the old builder could not read. */
const SERA_ROW: RpgActorVolatile = volatileRow(SERA_REF, {
  hp: { value: 9, max: 14 },
  trackerValues: { trust: { value: 3, items: null, max: null } },
  conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: 2 }],
  inventory: [{ id: "item_key", name: "bone key", description: "", quantity: 1, location: "", type: "" }],
  wallet: [{ name: "gold", amount: 40 }],
  status: "guarding the stair",
});

function plane(over: Partial<Pick<RpgTrackerView, "actors" | "castVolatile">> = {}): Pick<RpgTrackerView, "actors" | "castVolatile"> {
  return { actors: [rosterActor(volatileRow(MARA_REF, { trackerValues: { vitality: { value: 24, items: null, max: null } } }))], castVolatile: {}, ...over };
}

test("a cast NPC's tracker edit carries her EXISTING hp / inventory / wallet / status, not an empty row", () => {
  const { actorState } = actorStatePatch(plane({ castVolatile: { sera: SERA_ROW } }), SERA_REF, (v) => writeTrackerValue(v, "trust", { value: 5 }));

  const sera = actorState.find((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "sera");
  expect(sera).toBeDefined();
  // The edited field landed…
  expect(sera?.trackerValues["trust"]?.value).toBe(5);
  // …and every sibling the empty mint used to author over survived it.
  expect(sera?.hp).toEqual({ value: 9, max: 14 });
  expect(sera?.inventory).toEqual(SERA_ROW.inventory);
  expect(sera?.wallet).toEqual([{ name: "gold", amount: 40 }]);
  expect(sera?.status).toBe("guarding the stair");
  expect(sera?.conditions).toEqual(SERA_ROW.conditions);
});

test("a cast NPC with NO volatile row yet is still MINTED (a first hand edit is a real write, not a no-op)", () => {
  const { actorState } = actorStatePatch(plane({ castVolatile: { sera: null } }), SERA_REF, (v) => writeTrackerValue(v, "trust", { value: 1 }));

  const sera = actorState.find((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "sera");
  expect(sera?.trackerValues["trust"]?.value).toBe(1);
  expect(sera?.hp).toBeNull();
  expect(sera?.inventory).toEqual([]);
});

test("the ROSTER path is unchanged — every carrying actor is re-sent, the target mutated in place", () => {
  const { actorState } = actorStatePatch(plane({ castVolatile: { sera: SERA_ROW } }), MARA_REF, (v) => writeTrackerValue(v, "vitality", { value: 18 }));

  // Exactly the roster half: the untouched cast row is OMITTED (the server's additive plane keeps it),
  // never re-sent through a surface that doesn't own it.
  expect(actorState).toHaveLength(1);
  expect(actorState[0]?.actorRef).toEqual(MARA_REF);
  expect(actorState[0]?.trackerValues["vitality"]?.value).toBe(18);
});

test("a roster actor with no volatile row is minted + appended (the carrying actors keep their rows)", () => {
  const { actorState } = actorStatePatch({ actors: [rosterActor(null)], castVolatile: {} }, MARA_REF, (v) => ({ ...v, status: "wounded" }));

  expect(actorState).toHaveLength(1);
  expect(actorState[0]?.status).toBe("wounded");
});
