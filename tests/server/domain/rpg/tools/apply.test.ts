// domain/rpg/tools/apply — the PURE delta→plane appliers (rpg-design/05 §4.5). Zero I/O, so unit-tested
// directly over a hand-built effective state (no db, no accumulator). Pins: the delta arithmetic (hp/pool/
// wallet), the errors-as-data hpDelta-on-null-hp lane, the MA-4 scene patch (omit keeps), the timeOfDay→hour
// mapping, quest create-vs-flip, and item add/remove.

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { CharacterId, RpgQuestId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  applySetWidgetValue,
  applyUpdateInventory,
  applyUpdateParty,
  applyUpdateScene,
  applyUpsertQuest,
  buildRosterRefIndex,
} from "../../../../../packages/server/src/domain/rpg/tools/apply";
import { expect, test } from "../../../../support/fixtures";

/** The empty roster index — a target name that matches no roster member mints a `cast:<name>` (the non-roster
 *  scene-NPC path). Tests that exercise the roster resolution build a populated index instead. */
const NO_ROSTER = buildRosterRefIndex([]);

function emptyState(over: Partial<RpgSnapshotState> = {}): RpgSnapshotState {
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
    ...over,
  };
}

const idSeq = (prefix: string): (() => string) => {
  let n = 0;
  return () => `${prefix}_${++n}`;
};

test("update_party mints a fresh cast actor + applies a pool delta", () => {
  const result = applyUpdateParty(emptyState(), { targetRef: "Goblin", poolDeltas: [{ name: "rage", delta: 5 }] }, NO_ROSTER);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const actor = result.patch.actorState[0];
  expect(actor?.actorRef).toEqual({ kind: "cast", castKey: "Goblin" });
  expect(actor?.pools).toEqual([{ name: "rage", value: 5, max: 5 }]);
});

test("update_party on a ROSTER-member name mints under the roster ref, not a cast key (F2)", () => {
  const kaelId = castId<CharacterId>("character_kael");
  const roster = buildRosterRefIndex([{ actorRef: { kind: "character", characterId: kaelId }, name: "Kael" }]);
  const result = applyUpdateParty(emptyState(), { targetRef: "Kael", poolDeltas: [{ name: "focus", delta: 7 }] }, roster);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  // The write lands under the roster CHARACTER ref — the key the tracker view + reminder read.
  expect(result.patch.actorState[0]?.actorRef).toEqual({ kind: "character", characterId: kaelId });
});

test("update_party floors a negative pool delta on a FRESH pool to a contract-valid mint (F1)", () => {
  // "spends 3 mana" on a pool that never existed — must NOT mint max<=0 (the contract belt pools[].max>=1).
  const result = applyUpdateParty(emptyState(), { targetRef: "Wizard", poolDeltas: [{ name: "mana", delta: -3 }] }, NO_ROSTER);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.patch.actorState[0]?.pools).toEqual([{ name: "mana", value: 0, max: 1 }]);
});

test("update_party hpDelta on an existing hp actor applies the delta", () => {
  const state = emptyState({
    actorState: [{ actorRef: { kind: "cast", castKey: "Hero" }, hp: { value: 10, max: 20 }, pools: [], conditions: [], inventory: [], wallet: [], status: "" }],
  });
  const result = applyUpdateParty(state, { targetRef: "Hero", hpDelta: -3 }, NO_ROSTER);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.patch.actorState[0]?.hp).toEqual({ value: 7, max: 20 });
});

test("update_party hpDelta on a null-hp actor is an errors-as-data denial (never a throw)", () => {
  const result = applyUpdateParty(emptyState(), { targetRef: "Ghost", hpDelta: -1 }, NO_ROSTER);
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.error).toContain("no HP track");
});

test("update_inventory adds an item + applies a wallet delta on the same actor", () => {
  const result = applyUpdateInventory(
    emptyState(),
    { targetRef: "Hero", add: [{ name: "Sword" }], walletDeltas: [{ name: "gold", delta: 25 }] },
    idSeq("item"),
    NO_ROSTER,
  );
  const actor = result.actorState[0];
  expect(actor?.inventory).toEqual([{ id: "item_1", name: "Sword", description: "", quantity: 1, location: "", type: "" }]);
  expect(actor?.wallet).toEqual([{ name: "gold", amount: 25 }]);
});

test("update_inventory remove decrements quantity, dropping the item at zero", () => {
  const state = emptyState({
    actorState: [
      {
        actorRef: { kind: "cast", castKey: "Hero" },
        hp: null,
        pools: [],
        conditions: [],
        inventory: [{ id: "i1", name: "Potion", description: "", quantity: 3, location: "", type: "" }],
        wallet: [],
        status: "",
      },
    ],
  });
  const result = applyUpdateInventory(state, { targetRef: "Hero", remove: [{ name: "Potion", quantity: 3 }] }, idSeq("item"), NO_ROSTER);
  expect(result.actorState[0]?.inventory).toEqual([]);
});

test("update_scene maps timeOfDay to the representative hour + appends a beat", () => {
  const patch = applyUpdateScene(emptyState(), { timeOfDay: "night", recentEvent: "The bell tolled." });
  expect(patch.clock).toEqual({ day: 1, hour: 21, minute: 0 });
  expect(patch.recentEvents).toEqual(["The bell tolled."]);
});

test("update_scene presentUpsert is a PATCH — an omitted field keeps the existing value", () => {
  const state = emptyState({ presentCharacters: [{ key: "Elder", name: "Elder", emoji: "🧙", mood: "calm", customFields: {} }] });
  const patch = applyUpdateScene(state, { presentUpsert: [{ name: "Elder", mood: "angry" }] });
  const elder = patch.presentCharacters?.[0];
  expect(elder?.mood).toBe("angry");
  expect(elder?.emoji).toBe("🧙"); // kept
});

test("set_widget_value writes only the provided fields, keeping the rest", () => {
  const state = emptyState({ widgetValues: { corruption: { value: 10, max: 100 } } });
  const patch = applySetWidgetValue(state, { widgetRef: "corruption", value: 70 });
  expect(patch.widgetValues["corruption"]).toEqual({ value: 70, max: 100 });
});

test("upsert_quest create mints a quest; a later flip addresses it by name", () => {
  const created = applyUpsertQuest(
    emptyState(),
    { name: "Find the key", action: "create", objectives: ["Search the crypt"] },
    () => "q_1" as RpgQuestId,
    idSeq("obj"),
  );
  expect(created.quests[0]).toMatchObject({ id: "q_1", name: "Find the key", status: "active" });
  expect(created.quests[0]?.objectives).toEqual([{ id: "obj_1", text: "Search the crypt", completed: false }]);

  const flipped = applyUpsertQuest(
    emptyState({ quests: created.quests }),
    { name: "Find the key", action: "complete" },
    () => "q_2" as RpgQuestId,
    idSeq("obj"),
  );
  expect(flipped.quests[0]?.id).toBe("q_1"); // same quest, addressed by name
  expect(flipped.quests[0]?.status).toBe("completed");
});

// ── buildRosterRefIndex — the player self-alias (R2, belt-and-suspenders with the schema enum constraint) ──
test("the player (user-kind) actor answers to the universal self-aliases (player/you/self/me)", () => {
  const userId = castId<UserId>("user_nate");
  const idx = buildRosterRefIndex([{ actorRef: { kind: "user", userId }, name: "Nate" }]);
  // The roster name AND each self-alias resolve to the SAME user ref — never a phantom cast:player.
  for (const key of ["nate", "player", "you", "self", "me", "the player"]) {
    expect(idx.get(key)).toEqual({ kind: "user", userId });
  }
});

test('a "player" targetRef on a user-roster game lands on the user ref — NOT a cast:player phantom (R2)', () => {
  const userId = castId<UserId>("user_p");
  const roster = buildRosterRefIndex([{ actorRef: { kind: "user", userId }, name: "You" }]);
  const result = applyUpdateParty(emptyState(), { targetRef: "player", status: "wounded" }, roster);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected ok");
  }
  expect(result.patch.actorState[0]?.actorRef).toEqual({ kind: "user", userId });
});

test("an explicit roster name that collides with an alias WINS (aliases fill only gaps)", () => {
  const userId = castId<UserId>("user_pl");
  const charId = castId<CharacterId>("character_you_npc");
  // A character literally named "You" — the roster mapping for "you" must stay the character, not the alias.
  const idx = buildRosterRefIndex([
    { actorRef: { kind: "character", characterId: charId }, name: "You" },
    { actorRef: { kind: "user", userId }, name: "Player One" },
  ]);
  expect(idx.get("you")).toEqual({ kind: "character", characterId: charId }); // explicit name wins
  expect(idx.get("player")).toEqual({ kind: "user", userId }); // alias fills the remaining gap
});

test("no user-kind actor in the roster → no self-alias entries (a character-only game mints nothing phantom)", () => {
  const charId = castId<CharacterId>("character_only");
  const idx = buildRosterRefIndex([{ actorRef: { kind: "character", characterId: charId }, name: "Kael" }]);
  expect(idx.get("player")).toBeUndefined();
  expect(idx.get("you")).toBeUndefined();
});
