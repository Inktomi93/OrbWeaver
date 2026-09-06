// domain/rpg/tools/apply — the PURE delta→plane appliers (rpg-design/05 §4.5). Zero I/O, so unit-tested
// directly over a hand-built effective state (no db, no accumulator). Pins: the tracker/wallet arithmetic,
// the R2 presence+identity split (a `presentUpsert` writes the ACTOR row and adds presence; a
// `presentRemove` drops presence and NOTHING else), the MA-4 scene patch (omit keeps), the timeOfDay→hour
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
  buildActorRefIndex,
  extractionToStateDelta,
  ghostTargetRefs,
  toStagedJournalEntry,
} from "../../../../../packages/server/src/domain/rpg/tools/apply.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** An actor row on the state plane — `over` patches the VOLATILE half. */
function actorRow(npcKey: string, over: Partial<RpgSnapshotState["actorState"][number]["volatile"]> = {}): RpgSnapshotState["actorState"][number] {
  return { actorRef: { kind: "npc", npcKey }, volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "", ...over } };
}

/** An npc row WITH its identity half (the display name + its stance). */
function castRow(
  npcKey: string,
  identity: Partial<NonNullable<RpgSnapshotState["actorState"][number]["identity"]>> & { name: string },
  over: Partial<RpgSnapshotState["actorState"][number]["volatile"]> = {},
): RpgSnapshotState["actorState"][number] {
  return { ...actorRow(npcKey, over), identity: { emoji: "", mood: "", relationship: { kind: "neutral", label: "" }, ...identity } };
}

/** The empty roster index — a target name that matches no roster member mints a `npc:<name>` (the non-roster
 *  scene-NPC path). Tests that exercise the roster resolution build a populated index instead. */
const NO_ROSTER = buildActorRefIndex([]);

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

test("update_party mints a fresh npc + applies a tracker DELTA", () => {
  const result = applyUpdateParty(emptyState(), { targetRef: "Goblin", trackerDeltas: [{ key: "rage", delta: 5 }] }, NO_ROSTER);
  const actor = result.actorState[0];
  // The ref key is the SLUG (R2); the model's own spelling rides the identity half as the display name.
  expect(actor?.actorRef).toEqual({ kind: "npc", npcKey: "goblin" });
  // TOTAL by construction: the whole `{value,items,max}` is written, so the plane merge (which recurses into
  // this object) can never strand a previous reading's siblings on the new one. `max` (the per-carrier ceiling
  // OVERRIDE) is born null and stays HOST-authored — no tool arm writes it.
  expect(actor?.volatile.trackerValues["rage"]).toEqual({ value: 5, items: null, max: null });
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
  const values = result.actorState[0]?.volatile.trackerValues;
  expect(values?.["role"]).toEqual({ value: "sellsword", items: null, max: null });
  expect(values?.["pack"]).toEqual({ value: null, items: ["rope", "torch"], max: null });
});

test("update_party: a SET arm naming neither a value nor items is a no-op, never a blanked tracker", () => {
  const base = emptyState({ actorState: [actorRow("mira", { trackerValues: { trust: { value: 62, items: null, max: null } } })] });
  const result = applyUpdateParty(base, { targetRef: "Mira", trackerSets: [{ key: "trust" }] }, NO_ROSTER);
  expect(result.actorState[0]?.volatile.trackerValues["trust"]).toEqual({ value: 62, items: null, max: null });
});

test("update_party on a ROSTER-member name mints under the roster ref, not a npc key (F2)", () => {
  const kaelId = castId<CharacterId>("character_kael");
  const roster = buildActorRefIndex([{ actorRef: { kind: "character", characterId: kaelId }, name: "Kael" }]);
  const result = applyUpdateParty(emptyState(), { targetRef: "Kael", trackerDeltas: [{ key: "focus", delta: 7 }] }, roster);
  // The write lands under the roster CHARACTER ref — the key the tracker view + reminder read.
  expect(result.actorState[0]?.actorRef).toEqual({ kind: "character", characterId: kaelId });
});

test("a DELTA on a tracker with no reading yet starts from zero (spend-from-what-you-never-had)", () => {
  const result = applyUpdateParty(emptyState(), { targetRef: "Wizard", trackerDeltas: [{ key: "mana", delta: -3 }] }, NO_ROSTER);
  // A negative reading is legal: a tracker's floor is the host's business (the def owns the ceiling), and the
  // old `max >= 1` mint belt existed only because the retired pool shape carried its own max.
  expect(result.actorState[0]?.volatile.trackerValues["mana"]).toEqual({ value: -3, items: null, max: null });
});

test("a DELTA accumulates over an existing reading and PRESERVES the carrier's ceiling override (host-authored)", () => {
  // This carrier deliberately tops out at 34 (the host set it) — the model moves the READING only.
  const base = emptyState({ actorState: [actorRow("wizard", { trackerValues: { mana: { value: 28, items: null, max: 34 } } })] });
  const result = applyUpdateParty(base, { targetRef: "Wizard", trackerDeltas: [{ key: "mana", delta: -3 }] }, NO_ROSTER);
  // No tool arm carries a max, and the write is a spread — a model turn can never wipe the host's ceiling.
  expect(result.actorState[0]?.volatile.trackerValues["mana"]).toEqual({ value: 25, items: null, max: 34 });
});

test("HEALTH rides the ordinary tracker-delta arm since R3 (no bespoke hp field, no refusal lane)", () => {
  const state = emptyState({ actorState: [actorRow("hero", { trackerValues: { hp: { value: 10, items: null, max: 20 } } })] });
  const result = applyUpdateParty(state, { targetRef: "Hero", trackerDeltas: [{ key: "hp", delta: -3 }] }, NO_ROSTER);
  // The per-carrier ceiling the host set survives the model's write, exactly like any other meter.
  expect(result.actorState[0]?.volatile.trackerValues["hp"]).toEqual({ value: 7, items: null, max: 20 });
});

test("a health delta on an actor with NO hp reading starts from 0 — the ACCEPTED semantic delta (ruled)", () => {
  // The retired `hpDelta` arm REFUSED here ("set a max HP by hand first"). Under the north star (steering, not
  // simulation) delta-from-0 on a CARRIED meter is the right trade, and the write surface is the real gate:
  // the per-actor key enum makes hp untypeable on an actor who does not carry it, so this arm is only ever
  // reached by an actor who does. The seeded def's own hint states the rule to the host.
  const result = applyUpdateParty(emptyState(), { targetRef: "Ghost", trackerDeltas: [{ key: "hp", delta: -1 }] }, NO_ROSTER);
  expect(result.actorState[0]?.volatile.trackerValues["hp"]).toEqual({ value: -1, items: null, max: null });
});

test("update_inventory adds an item + applies a wallet delta on the same actor", () => {
  const result = applyUpdateInventory(
    emptyState(),
    { targetRef: "Hero", add: [{ name: "Sword" }], walletDeltas: [{ name: "gold", delta: 25 }] },
    idSeq("item"),
    NO_ROSTER,
  );
  const actor = result.actorState[0];
  expect(actor?.volatile.inventory).toEqual([{ id: "item_1", name: "Sword", description: "", quantity: 1, location: "", type: "" }]);
  expect(actor?.volatile.wallet).toEqual([{ name: "gold", amount: 25 }]);
});

test("update_inventory patches an existing item without re-minting it", () => {
  const state = emptyState({
    actorState: [
      actorRow("hikari", {
        inventory: [{ id: "i1", name: "small brass key", description: "a worn key", quantity: 1, location: "shirt pocket", type: "key", icon: "key" }],
      }),
    ],
  });
  const result = applyUpdateInventory(
    state,
    { targetRef: "Mira", update: [{ name: "small brass key", description: "hanging from a silver chain", location: "around her neck" }] },
    idSeq("item"),
    NO_ROSTER,
  );
  expect(result.actorState[0]?.volatile.inventory).toEqual([
    { id: "i1", name: "small brass key", description: "hanging from a silver chain", quantity: 1, location: "around her neck", type: "key", icon: "key" },
  ]);
});

test("update_inventory salvages an update for a new story item as an add", () => {
  const state = emptyState({ actorState: [actorRow("hikari")] });
  const result = applyUpdateInventory(
    state,
    { targetRef: "Mira", update: [{ name: "Phone", description: "dead phone", location: "charging on counter" }] },
    idSeq("item"),
    NO_ROSTER,
  );
  expect(result.actorState[0]?.volatile.inventory).toEqual([
    { id: "item_1", name: "Phone", description: "dead phone", quantity: 1, location: "charging on counter", type: "" },
  ]);
});

test("update_inventory remove decrements quantity, dropping the item at zero", () => {
  const state = emptyState({
    actorState: [actorRow("hero", { inventory: [{ id: "i1", name: "Potion", description: "", quantity: 3, location: "", type: "" }] })],
  });
  const result = applyUpdateInventory(state, { targetRef: "Hero", remove: [{ name: "Potion", quantity: 3 }] }, idSeq("item"), NO_ROSTER);
  expect(result.actorState[0]?.volatile.inventory).toEqual([]);
});

test("update_scene maps timeOfDay to the representative hour + appends a beat", () => {
  const patch = applyUpdateScene(emptyState(), { timeOfDay: "night", recentEvent: "The bell tolled." }, NO_ROSTER);
  expect(patch.clock).toEqual({ day: 1, hour: 21, minute: 0 });
  expect(patch.recentEvents).toEqual(["The bell tolled."]);
});

test("update_scene writes weather TOTAL — the closed type plus a label that is always answered", () => {
  const withLabel = applyUpdateScene(emptyState(), { weather: { type: "snow", label: "torrential sleet" } }, NO_ROSTER);
  expect(withLabel.weather).toEqual({ type: "snow", label: "torrential sleet" });
  // An omitted label writes "" rather than nothing: the plane merge RECURSES into this object, so a partial
  // write would strand the previous sky's phrasing on the new weather ("torrential sleet" over `clear`).
  const stale = emptyState({ weather: { type: "snow", label: "torrential sleet" } });
  expect(applyUpdateScene(stale, { weather: { type: "clear" } }, NO_ROSTER).weather).toEqual({ type: "clear", label: "" });
  // Weather omitted entirely ⇒ the plane is untouched (MA-4 omit = keep).
  expect(applyUpdateScene(stale, { location: "the ford" }, NO_ROSTER).weather).toBeUndefined();
});

test("update_scene presentUpsert is a PATCH on the ACTOR row — an omitted field keeps the existing value", () => {
  const state = emptyState({ actorState: [castRow("elder", { name: "Elder", emoji: "🧙", mood: "calm" })], presentCharacters: ["npc:elder"] });
  const patch = applyUpdateScene(state, { presentUpsert: [{ name: "Elder", mood: "angry" }] }, NO_ROSTER);
  const elder = patch.actorState?.[0]?.identity;
  expect(elder?.mood).toBe("angry");
  expect(elder?.emoji).toBe("🧙"); // kept
  expect(elder?.relationship).toEqual({ kind: "neutral", label: "" }); // kept (omit = keep)
  // Presence is idempotent — an upsert on someone already on stage does not double-list them.
  expect(patch.presentCharacters).toEqual(["npc:elder"]);
});

// THE R2 RETENTION GUARANTEE. `presentRemove` used to delete the whole npc row, taking the NPC's name, mood,
// emoji, standing guides and relationship ARC with it while her tracked state survived invisibly on a second
// plane. A return then re-created her from nothing: neutral stance, blank guides, and (because
// `deriveRelationshipBeats` skips a first-seen member) no journal beat and no delta line — a silent arc reset.
test("depart → return RETAINS everything: a presentRemove drops PRESENCE ONLY (the MS-2 regression)", () => {
  const established = emptyState({
    actorState: [
      castRow(
        "mira",
        {
          name: "Mira",
          emoji: "🗡️",
          mood: "wary",
          relationship: { kind: "enemy", label: "" },
          appearance: "a lean duelist",
          thoughts: "she has not forgiven you",
        },
        {
          trackerValues: { trust: { value: 2, items: null, max: null } },
          inventory: [{ id: "i1", name: "dagger", description: "", quantity: 1, location: "", type: "" }],
        },
      ),
    ],
    presentCharacters: ["npc:mira"],
  });

  // SHE LEAVES.
  const departed = applyUpdateScene(established, { presentRemove: ["Mira"] }, NO_ROSTER);
  expect(departed.presentCharacters).toEqual([]);
  // …and her ROW comes back BYTE-IDENTICAL: a departure rewrites nothing about the person. (The old applier
  // filtered her npc row out of existence here, which is exactly what destroyed her half.)
  expect(departed.actorState).toEqual(established.actorState);

  // SHE COMES BACK — the same slug, so the upsert lands on the row that was waiting.
  const returned = applyUpdateScene({ ...established, presentCharacters: [] }, { presentUpsert: [{ name: "Mira" }] }, NO_ROSTER);
  expect(returned.presentCharacters).toEqual(["npc:mira"]);
  const row = returned.actorState?.[0];
  expect(row?.identity?.relationship).toEqual({ kind: "enemy", label: "" }); // the ARC survived
  expect(row?.identity?.appearance).toBe("a lean duelist"); // the standing guides survived
  expect(row?.identity?.thoughts).toBe("she has not forgiven you");
  expect(row?.identity?.emoji).toBe("🗡️");
  expect(row?.identity?.mood).toBe("wary");
  expect(row?.volatile.trackerValues["trust"]).toEqual({ value: 2, items: null, max: null }); // and the hard half
  expect(row?.volatile.inventory).toHaveLength(1);
});

test("an npc is addressed by SLUG, so a re-spelled name patches ONE actor (never a sibling identity)", () => {
  const base = emptyState({ actorState: [castRow("sister-vesna", { name: "Sister Vesna", mood: "warming" })], presentCharacters: ["npc:sister-vesna"] });
  const patch = applyUpdateScene(base, { presentUpsert: [{ name: "sister  vesna.", mood: "guarded" }] }, NO_ROSTER);
  expect(patch.actorState).toHaveLength(1);
  expect(patch.actorState?.[0]?.actorRef).toEqual({ kind: "npc", npcKey: "sister-vesna" });
  // The model's spelling IS the new display name (that is how a story renames), but the key never moved.
  expect(patch.actorState?.[0]?.identity?.name).toBe("sister  vesna.");
  expect(patch.presentCharacters).toEqual(["npc:sister-vesna"]);
});

test("a presentUpsert naming a ROSTER member adds PRESENCE and writes no identity (one name home)", () => {
  const kaelId = castId<CharacterId>("character_kael");
  const roster = buildActorRefIndex([{ actorRef: { kind: "character", characterId: kaelId }, name: "Kael" }]);
  const patch = applyUpdateScene(emptyState(), { presentUpsert: [{ name: "Kael", mood: "grim" }] }, roster);
  expect(patch.presentCharacters).toEqual([`character:${kaelId}`]);
  // Her name is the chat roster's and her standing prose is the sheet's — a second identity home is exactly
  // the split R2 dissolved, so the applier declines to mint one.
  expect(patch.actorState?.[0]?.identity).toBeUndefined();
});

test("update_scene writes a relationship — a custom kind carries its label, a built-in clears it (§2.1)", () => {
  const state = emptyState({ actorState: [castRow("mari", { name: "Mari", relationship: { kind: "friend", label: "" } })], presentCharacters: ["npc:mari"] });
  const toEnemy = applyUpdateScene(state, { presentUpsert: [{ name: "Mari", relationship: { kind: "enemy" } }] }, NO_ROSTER);
  expect(toEnemy.actorState?.[0]?.identity?.relationship).toEqual({ kind: "enemy", label: "" });
  const toCustom = applyUpdateScene(state, { presentUpsert: [{ name: "Mari", relationship: { kind: "custom", label: "vassal" } }] }, NO_ROSTER);
  expect(toCustom.actorState?.[0]?.identity?.relationship).toEqual({ kind: "custom", label: "vassal" });
});

// ── P5 — the plot plane (`update_scene.plot`, the snapshot-resident act spine) ──────────────────────────

test("update_scene plot: a first-ever patch births the plane (act 1, padded acts, titles applied)", () => {
  const patch = applyUpdateScene(emptyState(), { plot: { title: "The Bone Key", actTitle: "Arrival" } }, NO_ROSTER);
  expect(patch.plot).toEqual({ act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "" }] });
});

test("update_scene plot: an act ADVANCE pads untitled acts up to the new act and writes its title in place", () => {
  const state = emptyState({ plot: { act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "" }] } });
  const patch = applyUpdateScene(state, { plot: { act: 3, actTitle: "The Reckoning", actSummary: "All debts come due." } }, NO_ROSTER);
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
  const patch = applyUpdateScene(state, { plot: { actSummary: "quiet before the storm" } }, NO_ROSTER);
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
  const base = emptyState({ actorState: [castRow("mari", { name: "Mari", relationship: { kind: "friend", label: "" } })], presentCharacters: ["npc:mari"] });
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
  const base = emptyState({ actorState: [castRow("mari", { name: "Mari", relationship: { kind: "friend", label: "" } })], presentCharacters: ["npc:mari"] });
  // A scene write that changes mood but NOT relationship — no relationship beat.
  const extraction = { party: [], inventory: [], scene: { presentUpsert: [{ name: "Mari", mood: "wary" }] }, trackers: [], quests: [], journal: [] };
  const mints = { item: idSeq("item"), quest: idSeq<RpgQuestId>("q"), objective: idSeq("obj") };
  const delta = extractionToStateDelta(base, extraction, mints, NO_ROSTER);
  expect(delta.journal.find((e) => e.title.startsWith("Mari:"))).toBeUndefined();
});

// ── R5 — the GHOST-ACTOR guard (the model reads the ref enum as a MENU and names a stale/invented actor) ──

test("extractionToStateDelta DROPS a ghost-actor party arg and still applies the rest of the delta", () => {
  const userId = castId<UserId>("user_ghost");
  const roster = buildActorRefIndex([{ actorRef: { kind: "user", userId }, name: "You" }]);
  const base = emptyState();
  const extraction = {
    // "Aldric Vane" is the measured failure: an actor from a STALE enum, in no live scene.
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

  const actors = delta.statePatch["actorState"] as { actorRef: { kind: string }; volatile: { status: string; inventory: unknown[] } }[];
  // NO npc:aldric-vane mint — the ghost never becomes a tracked actor the panel renders forever.
  expect(actors).toHaveLength(1);
  expect(actors[0]?.actorRef).toEqual({ kind: "user", userId });
  expect(actors[0]?.volatile.status).toBe("wounded"); // the legitimate write in the SAME extraction still landed
  expect(actors[0]?.volatile.inventory).toEqual([]); // the ghost's inventory arg was dropped, not re-targeted
  expect(delta.journal).toHaveLength(1); // and the turn is otherwise untouched (errors-as-data, never a throw)
});

test("ghostTargetRefs names ONLY the unreachable targets (roster / tracked npcs / scene npcs are reachable)", () => {
  const userId = castId<UserId>("user_g2");
  const roster = buildActorRefIndex([{ actorRef: { kind: "user", userId }, name: "You" }]);
  const base = emptyState({
    // A tracked npc answers to BOTH spellings since R2: her stable slug AND her display name (the
    // enum offers the display name, so a write coming back under it must not read as a ghost).
    actorState: [actorRow("goblin"), castRow("bartender", { name: "Bartender" })],
    presentCharacters: ["npc:bartender"],
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
    party: [{ targetRef: "Mari", trackerDeltas: [{ key: "hp", delta: -2 }] }],
    inventory: [],
    scene: { presentUpsert: [{ name: "Mari", mood: "bleeding" }] },
    trackers: [],
    quests: [],
    journal: [],
  };
  expect(ghostTargetRefs(base, extraction, NO_ROSTER)).toEqual([]);
  const mints = { item: idSeq("item"), quest: idSeq<RpgQuestId>("q"), objective: idSeq("obj") };
  const delta = extractionToStateDelta(base, extraction, mints, NO_ROSTER);
  // ONE actor came out of both arms — the party write and the scene upsert resolve through the same slug, so
  // the wound and the introduction land on the same person (they used to be two rows on two planes).
  expect(delta.statePatch["presentCharacters"]).toEqual(["npc:mari"]);
  const actors = delta.statePatch["actorState"] as { identity?: { name: string }; volatile: { trackerValues: Record<string, unknown> } }[];
  expect(actors).toHaveLength(1);
  expect(actors[0]?.identity?.name).toBe("Mari");
  expect(actors[0]?.volatile.trackerValues["hp"]).toEqual({ value: -2, items: null, max: null });
});

test("set_tracker writes the GAME-subject plane by KEY, keeping the untouched fields", () => {
  const state = emptyState({ trackerValues: { corruption: { value: 10, items: null, max: null } } });
  expect(applySetTracker(state, { key: "corruption", value: 70 }).trackerValues["corruption"]).toEqual({ value: 70, items: null, max: null });
  // Both write arms run through the SAME mechanic the per-actor arm uses — one write behaviour, two subjects.
  expect(applySetTracker(state, { key: "corruption", delta: -4 }).trackerValues["corruption"]).toEqual({ value: 6, items: null, max: null });
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

// ── EXT-4c: objective completion is MODEL-EXPRESSIBLE (merge-by-match + the completeObjectives arm) ───────
// The defect: `update` carrying `objectives` re-minted every line `completed:false`, so the model could not
// mark one objective done without wiping the others (and the host's hand-ticked flags died with them). The
// authoring arm now MERGES by text; the completion arm names lines by text without restating the list.

/** A quest with two objectives, the first already done — the state every merge test starts from. */
function questWithProgress(): RpgSnapshotState {
  return emptyState({
    quests: [
      {
        id: castId<RpgQuestId>("q_vault"),
        name: "Reach the Vault of Ash",
        status: "active",
        description: "Get there before the new moon",
        objectives: [
          { id: "obj_a", text: "Find the road north", completed: true },
          { id: "obj_b", text: "Enter the vault", completed: false },
        ],
      },
    ],
  });
}

test("EXT-4c: an update RESTATING the objective list preserves each line's id AND completion (no re-mint)", () => {
  const updated = applyUpsertQuest(
    questWithProgress(),
    { name: "Reach the Vault of Ash", action: "update", objectives: ["Find the road north", "Enter the vault"] },
    () => castId<RpgQuestId>("q_new"),
    idSeq("obj"),
  );
  // The exact pre-fix regression: both flags used to come back false and both ids used to be fresh.
  expect(updated.quests[0]?.objectives).toEqual([
    { id: "obj_a", text: "Find the road north", completed: true },
    { id: "obj_b", text: "Enter the vault", completed: false },
  ]);
});

test("EXT-4c: the merge is trim/case-insensitive (a model retyping its own line is the SAME objective)", () => {
  const updated = applyUpsertQuest(
    questWithProgress(),
    { name: "Reach the Vault of Ash", action: "update", objectives: ["  find the road NORTH ", "Enter the vault"] },
    () => castId<RpgQuestId>("q_new"),
    idSeq("obj"),
  );
  // Same id + completion, and the incoming wording wins (the list IS the authoring arm).
  expect(updated.quests[0]?.objectives[0]).toEqual({ id: "obj_a", text: "  find the road NORTH ", completed: true });
});

test("EXT-4c: a NEW line in the list mints fresh; an omitted line is dropped (the list is absolute)", () => {
  const updated = applyUpsertQuest(
    questWithProgress(),
    { name: "Reach the Vault of Ash", action: "update", objectives: ["Find the road north", "Bribe the gatekeeper"] },
    () => castId<RpgQuestId>("q_new"),
    idSeq("obj"),
  );
  expect(updated.quests[0]?.objectives).toEqual([
    { id: "obj_a", text: "Find the road north", completed: true },
    { id: "obj_1", text: "Bribe the gatekeeper", completed: false },
  ]);
});

test("EXT-4c: completeObjectives ticks a line DONE without restating the list; an unknown name is dropped", () => {
  const updated = applyUpsertQuest(
    questWithProgress(),
    { name: "Reach the Vault of Ash", action: "update", completeObjectives: ["enter the vault", "Slay the dragon"] },
    () => castId<RpgQuestId>("q_new"),
    idSeq("obj"),
  );
  // The named line flipped; the already-done line is untouched; the GHOST completion minted nothing.
  expect(updated.quests[0]?.objectives).toEqual([
    { id: "obj_a", text: "Find the road north", completed: true },
    { id: "obj_b", text: "Enter the vault", completed: true },
  ]);
});

test("EXT-4c: an update touching NEITHER objective arm leaves the plane byte-identical (omit = keep)", () => {
  const before = questWithProgress();
  const updated = applyUpsertQuest(
    before,
    { name: "Reach the Vault of Ash", action: "update", description: "reworded" },
    () => castId<RpgQuestId>("q_new"),
    idSeq("obj"),
  );
  expect(updated.quests[0]?.objectives).toBe(before.quests[0]?.objectives);
  expect(updated.quests[0]?.description).toBe("reworded");
});

test("EXT-4c: a CREATE can mint objectives and mark one done in the same call", () => {
  const created = applyUpsertQuest(
    emptyState(),
    { name: "Find the key", action: "create", objectives: ["Search the crypt", "Open the door"], completeObjectives: ["Search the crypt"] },
    () => castId<RpgQuestId>("q_1"),
    idSeq("obj"),
  );
  expect(created.quests[0]?.objectives).toEqual([
    { id: "obj_1", text: "Search the crypt", completed: true },
    { id: "obj_2", text: "Open the door", completed: false },
  ]);
});

// ── EXT-4b: the journal type HEAL (the nested-required blind spot, the `title` precedent) ─────────────────
test("EXT-4b: a journal entry with NO type heals to `note` and still lands (never a dropped beat)", () => {
  expect(toStagedJournalEntry({ content: "The gate groaned open." })).toEqual({
    type: "note",
    label: "",
    title: "The gate groaned open.",
    content: "The gate groaned open.",
  });
});

test("EXT-4b: the heal does NOT resurrect the custom label — a healed entry is a built-in kind", () => {
  // R4c: `label` is meaningful only on `custom`. A model that emitted a label but dropped the type heals to
  // `note`, so the label is cleared exactly as it would be on any other built-in.
  expect(toStagedJournalEntry({ label: "ritual", content: "They lit the candles." }).label).toBe("");
  expect(toStagedJournalEntry({ type: "custom", label: "ritual", content: "They lit the candles." }).label).toBe("ritual");
});

// ── buildActorRefIndex — the player self-alias (R2, belt-and-suspenders with the schema enum constraint) ──
test("the player (user-kind) actor answers to the universal self-aliases (player/you/self/me)", () => {
  const userId = castId<UserId>("user_nate");
  const idx = buildActorRefIndex([{ actorRef: { kind: "user", userId }, name: "Alex" }]);
  // The roster name AND each self-alias resolve to the SAME user ref — never a phantom npc:player.
  for (const key of ["alex", "player", "you", "self", "me", "the player"]) {
    expect(idx.get(key)).toEqual({ kind: "user", userId });
  }
});

test('a "player" targetRef on a user-roster game lands on the user ref — NOT a npc:player phantom (R2)', () => {
  const userId = castId<UserId>("user_p");
  const roster = buildActorRefIndex([{ actorRef: { kind: "user", userId }, name: "You" }]);
  const result = applyUpdateParty(emptyState(), { targetRef: "player", status: "wounded" }, roster);
  expect(result.actorState[0]?.actorRef).toEqual({ kind: "user", userId });
});

test("an explicit roster name that collides with an alias WINS (aliases fill only gaps)", () => {
  const userId = castId<UserId>("user_pl");
  const charId = castId<CharacterId>("character_you_npc");
  // A character literally named "You" — the roster mapping for "you" must stay the character, not the alias.
  const idx = buildActorRefIndex([
    { actorRef: { kind: "character", characterId: charId }, name: "You" },
    { actorRef: { kind: "user", userId }, name: "Player One" },
  ]);
  expect(idx.get("you")).toEqual({ kind: "character", characterId: charId }); // explicit name wins
  expect(idx.get("player")).toEqual({ kind: "user", userId }); // alias fills the remaining gap
});

test("no user-kind actor in the roster → no self-alias entries (a character-only game mints nothing phantom)", () => {
  const charId = castId<CharacterId>("character_only");
  const idx = buildActorRefIndex([{ actorRef: { kind: "character", characterId: charId }, name: "Kael" }]);
  expect(idx.get("player")).toBeUndefined();
  expect(idx.get("you")).toBeUndefined();
});
