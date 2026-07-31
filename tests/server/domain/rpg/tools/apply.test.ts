// domain/rpg/tools/apply — the PURE delta→plane appliers (rpg-design/05 §4.5). Zero I/O, so unit-tested
// directly over a hand-built effective state (no db, no accumulator). Pins: the delta arithmetic (hp/pool/
// wallet), the errors-as-data hpDelta-on-null-hp lane, the MA-4 scene patch (omit keeps), the timeOfDay→hour
// mapping, quest create-vs-flip, and item add/remove.

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { CharacterId, RpgQuestId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  applySetTracker,
  applyUpdateInventory,
  applyUpdateParty,
  applyUpdateScene,
  applyUpsertQuest,
  buildRosterRefIndex,
  extractionToStateDelta,
  ghostTargetRefs,
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
    trackerValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
    ...over,
  };
}

// A monotonic id-mint for a test — generic over the branded id so a branded mint (quest) is produced by a
// REAL `castId`, never a `as unknown as` double-cast that would survive the mint signature changing.
const idSeq = <T extends string = string>(prefix: string): (() => T) => {
  let n = 0;
  return () => castId<T>(`${prefix}_${++n}`);
};

test("update_party mints a fresh cast actor + applies a tracker DELTA", () => {
  const result = applyUpdateParty(emptyState(), { targetRef: "Goblin", trackerDeltas: [{ key: "rage", delta: 5 }] }, NO_ROSTER);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const actor = result.patch.actorState[0];
  expect(actor?.actorRef).toEqual({ kind: "cast", castKey: "Goblin" });
  // TOTAL by construction: the whole `{value,max,items}` is written, so the plane merge (which recurses into
  // this object) can never strand a previous reading's siblings on the new one.
  expect(actor?.trackerValues["rage"]).toEqual({ value: 5, items: null });
});

test("update_party writes a tracker SET arm — a text reading and a list, keyed by tracker key", () => {
  const result = applyUpdateParty(
    emptyState(),
    {
      targetRef: "Mira",
      trackerSets: [
        { key: "role", value: "sellsword" },
        { key: "pack", items: ["rope", "torch"] },
      ],
    },
    NO_ROSTER,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const values = result.patch.actorState[0]?.trackerValues;
  expect(values?.["role"]).toEqual({ value: "sellsword", items: null });
  expect(values?.["pack"]).toEqual({ value: null, items: ["rope", "torch"] });
});

test("update_party: a SET arm naming neither a value nor items is a no-op, never a blanked tracker", () => {
  const base = emptyState({
    actorState: [
      {
        actorRef: { kind: "cast", castKey: "Mira" },
        hp: null,
        trackerValues: { trust: { value: 62, items: null } },
        conditions: [],
        inventory: [],
        wallet: [],
        status: "",
      },
    ],
  });
  const result = applyUpdateParty(base, { targetRef: "Mira", trackerSets: [{ key: "trust" }] }, NO_ROSTER);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.patch.actorState[0]?.trackerValues["trust"]).toEqual({ value: 62, items: null });
});

test("update_party on a ROSTER-member name mints under the roster ref, not a cast key (F2)", () => {
  const kaelId = castId<CharacterId>("character_kael");
  const roster = buildRosterRefIndex([{ actorRef: { kind: "character", characterId: kaelId }, name: "Kael" }]);
  const result = applyUpdateParty(emptyState(), { targetRef: "Kael", trackerDeltas: [{ key: "focus", delta: 7 }] }, roster);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  // The write lands under the roster CHARACTER ref — the key the tracker view + reminder read.
  expect(result.patch.actorState[0]?.actorRef).toEqual({ kind: "character", characterId: kaelId });
});

test("a DELTA on a tracker with no reading yet starts from zero (spend-from-what-you-never-had)", () => {
  const result = applyUpdateParty(emptyState(), { targetRef: "Wizard", trackerDeltas: [{ key: "mana", delta: -3 }] }, NO_ROSTER);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  // A negative reading is legal: a tracker's floor is the host's business (the def owns the ceiling), and the
  // old `max >= 1` mint belt existed only because the retired pool shape carried its own max.
  expect(result.patch.actorState[0]?.trackerValues["mana"]).toEqual({ value: -3, items: null });
});

test("a DELTA accumulates over an existing reading and KEEPS its max (the ceiling is the def's)", () => {
  const base = emptyState({
    actorState: [
      {
        actorRef: { kind: "cast", castKey: "Wizard" },
        hp: null,
        trackerValues: { mana: { value: 28, items: null } },
        conditions: [],
        inventory: [],
        wallet: [],
        status: "",
      },
    ],
  });
  const result = applyUpdateParty(base, { targetRef: "Wizard", trackerDeltas: [{ key: "mana", delta: -3 }] }, NO_ROSTER);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.patch.actorState[0]?.trackerValues["mana"]).toEqual({ value: 25, items: null });
});

test("update_party hpDelta on an existing hp actor applies the delta", () => {
  const state = emptyState({
    actorState: [
      { actorRef: { kind: "cast", castKey: "Hero" }, hp: { value: 10, max: 20 }, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" },
    ],
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
        trackerValues: {},
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

test("update_scene writes weather TOTAL — the closed type plus a label that is always answered", () => {
  const withLabel = applyUpdateScene(emptyState(), { weather: { type: "snow", label: "torrential sleet" } });
  expect(withLabel.weather).toEqual({ type: "snow", label: "torrential sleet" });
  // An omitted label writes "" rather than nothing: the plane merge RECURSES into this object, so a partial
  // write would strand the previous sky's phrasing on the new weather ("torrential sleet" over `clear`).
  const stale = emptyState({ weather: { type: "snow", label: "torrential sleet" } });
  expect(applyUpdateScene(stale, { weather: { type: "clear" } }).weather).toEqual({ type: "clear", label: "" });
  // Weather omitted entirely ⇒ the plane is untouched (MA-4 omit = keep).
  expect(applyUpdateScene(stale, { location: "the ford" }).weather).toBeUndefined();
});

test("update_scene presentUpsert is a PATCH — an omitted field keeps the existing value", () => {
  const state = emptyState({
    presentCharacters: [{ key: "Elder", name: "Elder", emoji: "🧙", mood: "calm", relationship: { kind: "neutral", label: "" } }],
  });
  const patch = applyUpdateScene(state, { presentUpsert: [{ name: "Elder", mood: "angry" }] });
  const elder = patch.presentCharacters?.[0];
  expect(elder?.mood).toBe("angry");
  expect(elder?.emoji).toBe("🧙"); // kept
  expect(elder?.relationship).toEqual({ kind: "neutral", label: "" }); // kept (omit = keep)
});

test("update_scene writes a relationship — a custom kind carries its label, a built-in clears it (§2.1)", () => {
  const state = emptyState({
    presentCharacters: [{ key: "Mari", name: "Mari", emoji: "", mood: "", relationship: { kind: "friend", label: "" } }],
  });
  const toEnemy = applyUpdateScene(state, { presentUpsert: [{ name: "Mari", relationship: { kind: "enemy" } }] });
  expect(toEnemy.presentCharacters?.[0]?.relationship).toEqual({ kind: "enemy", label: "" });
  const toCustom = applyUpdateScene(state, { presentUpsert: [{ name: "Mari", relationship: { kind: "custom", label: "vassal" } }] });
  expect(toCustom.presentCharacters?.[0]?.relationship).toEqual({ kind: "custom", label: "vassal" });
});

// ── P5 — the plot plane (`update_scene.plot`, the snapshot-resident act spine) ──────────────────────────

test("update_scene plot: a first-ever patch births the plane (act 1, padded acts, titles applied)", () => {
  const patch = applyUpdateScene(emptyState(), { plot: { title: "The Bone Key", actTitle: "Arrival" } });
  expect(patch.plot).toEqual({ act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "" }] });
});

test("update_scene plot: an act ADVANCE pads untitled acts up to the new act and writes its title in place", () => {
  const state = emptyState({ plot: { act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "" }] } });
  const patch = applyUpdateScene(state, { plot: { act: 3, actTitle: "The Reckoning", actSummary: "All debts come due." } });
  expect(patch.plot).toEqual({
    act: 3,
    title: "The Bone Key",
    acts: [
      { title: "Arrival", summary: "" },
      { title: "", summary: "" },
      { title: "The Reckoning", summary: "All debts come due." },
    ],
  });
  // The base plane is untouched (a fresh object, never a shared ref — the clone-forward posture).
  expect(state.plot?.acts).toHaveLength(1);
});

test("update_scene plot: omit = keep (MA-4) — a patch naming only actSummary keeps act/title/actTitle", () => {
  const state = emptyState({
    plot: {
      act: 2,
      title: "T",
      acts: [
        { title: "A1", summary: "" },
        { title: "A2", summary: "" },
      ],
    },
  });
  const patch = applyUpdateScene(state, { plot: { actSummary: "quiet before the storm" } });
  expect(patch.plot).toEqual({
    act: 2,
    title: "T",
    acts: [
      { title: "A1", summary: "" },
      { title: "A2", summary: "quiet before the storm" },
    ],
  });
});

test("extractionToStateDelta includes the plot plane in the statePatch when the scene wrote it", () => {
  const delta = extractionToStateDelta(
    emptyState(),
    { party: [], inventory: [], scene: { plot: { act: 2, actTitle: "Descent" } }, trackers: [], quests: [], journal: [] },
    { item: () => "i", quest: () => castId<RpgQuestId>("q"), objective: () => "o" },
    NO_ROSTER,
  );
  expect(delta.statePatch["plot"]).toEqual({
    act: 2,
    title: "",
    acts: [
      { title: "", summary: "" },
      { title: "Descent", summary: "" },
    ],
  });
});

test("extractionToStateDelta DERIVES a relationship-change journal beat (§2.4 — not model-authored)", () => {
  const base = emptyState({
    presentCharacters: [{ key: "Mari", name: "Mari", emoji: "", mood: "", relationship: { kind: "friend", label: "" } }],
  });
  const extraction = {
    party: [],
    inventory: [],
    scene: { presentUpsert: [{ name: "Mari", relationship: { kind: "enemy" as const } }] },
    trackers: [],
    quests: [],
    journal: [],
  };
  const mints = { item: idSeq("item"), quest: idSeq<RpgQuestId>("q"), objective: idSeq("obj") };
  const delta = extractionToStateDelta(base, extraction, mints, NO_ROSTER);
  const beat = delta.journal.find((e) => e.title.startsWith("Mari:"));
  expect(beat).toBeDefined();
  expect(beat?.title).toBe("Mari: friend → enemy");
  expect(beat?.type).toBe("event");
});

test("extractionToStateDelta does NOT derive a beat when the relationship is unchanged", () => {
  const base = emptyState({
    presentCharacters: [{ key: "Mari", name: "Mari", emoji: "", mood: "", relationship: { kind: "friend", label: "" } }],
  });
  // A scene write that changes mood but NOT relationship — no relationship beat.
  const extraction = { party: [], inventory: [], scene: { presentUpsert: [{ name: "Mari", mood: "wary" }] }, trackers: [], quests: [], journal: [] };
  const mints = { item: idSeq("item"), quest: idSeq<RpgQuestId>("q"), objective: idSeq("obj") };
  const delta = extractionToStateDelta(base, extraction, mints, NO_ROSTER);
  expect(delta.journal.find((e) => e.title.startsWith("Mari:"))).toBeUndefined();
});

// ── R5 — the GHOST-ACTOR guard (the model reads the ref enum as a MENU and names a stale/invented actor) ──

test("extractionToStateDelta DROPS a ghost-actor party arg and still applies the rest of the delta", () => {
  const userId = castId<UserId>("user_ghost");
  const roster = buildRosterRefIndex([{ actorRef: { kind: "user", userId }, name: "You" }]);
  const base = emptyState();
  const extraction = {
    // "Aldric Vane" is the measured failure: an actor from a STALE enum, in no live cast.
    party: [
      { targetRef: "Aldric Vane", status: "brooding" },
      { targetRef: "player", status: "wounded" },
    ],
    inventory: [{ targetRef: "Aldric Vane", add: [{ name: "signet ring" }] }],
    trackers: [],
    quests: [],
    journal: [{ type: "event" as const, content: "A stranger is named." }],
  };
  const mints = { item: idSeq("item"), quest: idSeq<RpgQuestId>("q"), objective: idSeq("obj") };
  const delta = extractionToStateDelta(base, extraction, mints, roster);

  const actors = delta.statePatch["actorState"] as { actorRef: { kind: string }; status: string; inventory: unknown[] }[];
  // NO cast:Aldric Vane mint — the ghost never becomes a tracked actor the panel renders forever.
  expect(actors).toHaveLength(1);
  expect(actors[0]?.actorRef).toEqual({ kind: "user", userId });
  expect(actors[0]?.status).toBe("wounded"); // the legitimate write in the SAME extraction still landed
  expect(actors[0]?.inventory).toEqual([]); // the ghost's inventory arg was dropped, not re-targeted
  expect(delta.journal).toHaveLength(1); // and the turn is otherwise untouched (errors-as-data, never a throw)
});

test("ghostTargetRefs names ONLY the unreachable targets (roster / tracked cast / scene cast are reachable)", () => {
  const userId = castId<UserId>("user_g2");
  const roster = buildRosterRefIndex([{ actorRef: { kind: "user", userId }, name: "You" }]);
  const base = emptyState({
    actorState: [{ actorRef: { kind: "cast", castKey: "Goblin" }, hp: null, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" }],
    presentCharacters: [{ key: "Bartender", name: "Bartender", emoji: "", mood: "", relationship: { kind: "neutral", label: "" } }],
  });
  const ghosts = ghostTargetRefs(
    base,
    {
      party: [{ targetRef: "Goblin" }, { targetRef: "player" }, { targetRef: "Aldric Vane" }],
      inventory: [{ targetRef: "Bartender" }, { targetRef: "Aldric Vane" }, { targetRef: "Zzyzx" }],
      trackers: [],
      quests: [],
      journal: [],
    },
    roster,
  );
  expect(ghosts).toEqual(["Aldric Vane", "Zzyzx"]); // deduped across both planes, in encounter order
});

test("an actor the SAME extraction puts on stage is NOT a ghost (introduce-and-wound in one beat)", () => {
  const base = emptyState();
  const extraction = {
    party: [{ targetRef: "Mari", hpDelta: -2 }],
    inventory: [],
    scene: { presentUpsert: [{ name: "Mari", mood: "bleeding" }] },
    trackers: [],
    quests: [],
    journal: [],
  };
  expect(ghostTargetRefs(base, extraction, NO_ROSTER)).toEqual([]);
  const mints = { item: idSeq("item"), quest: idSeq<RpgQuestId>("q"), objective: idSeq("obj") };
  const delta = extractionToStateDelta(base, extraction, mints, NO_ROSTER);
  // The write lands as a cast actor (the hpDelta itself is refused — no HP track — but the arg was NOT dropped
  // as a ghost: the status-carrying arm proves reachability, so the cast plane still gained her).
  expect((delta.statePatch["presentCharacters"] as { key: string }[])[0]?.key).toBe("Mari");
});

test("set_tracker writes the GAME-subject plane by KEY, keeping the untouched fields", () => {
  const state = emptyState({ trackerValues: { corruption: { value: 10, items: null } } });
  expect(applySetTracker(state, { key: "corruption", value: 70 }).trackerValues["corruption"]).toEqual({ value: 70, items: null });
  // Both write arms run through the SAME mechanic the per-actor arm uses — one write behaviour, two subjects.
  expect(applySetTracker(state, { key: "corruption", delta: -4 }).trackerValues["corruption"]).toEqual({ value: 6, items: null });
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
