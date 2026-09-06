// tests/server/domain/rpg/substrate/delta — the prev→current SNAPSHOT DIFF (parity-plus §2.7). A PURE fn over
// two snapshot states, so a unit test over hand-built states: per-plane rendering (numeric sign / set add-remove
// / scene transition / quest flip / objective progress), the first-snapshot arm (SCENE OPENS, not
// everything-changed), the no-change OMIT arm (null, byte-stable), the §2.7.4 DEFENSIVE heal arm (a malformed
// plane degrades that line, the block survives), and the OPEN registry (a new renderer contributes without a
// monolith edit — the P1 seam). The swipe-consistency + hand-edit-source classes ride the gather int test (a
// flush→read ROUND-TRIP, not a pure peek) — they live in chat-ops/gather.int.test.ts.

import type { RpgSnapshotState, RpgTrackerDef, RpgTrackerValue } from "@orb/contracts/rpg";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { DeltaContext } from "../../../../../packages/server/src/domain/rpg/contract/delta.ts";
import {
  buildDeltaBlock,
  definePlaneDiff,
  PLANE_DIFF_RENDERERS,
  RPG_DELTA_HEADING,
  RPG_SCENE_OPENS_HEADING,
} from "../../../../../packages/server/src/domain/rpg/substrate/delta.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The pure diff's data context (participant names + the game's tracker DEFS + relationship hints). The default is
 *  empty (no tracker lines, generic actor labels); a case that needs a participant name / tracker / hint passes
 *  its own. */
function ctx(over: Partial<DeltaContext> = {}): DeltaContext {
  return { participantNames: {}, trackerDefs: [], relationshipHints: {}, ...over };
}

/** A tracker def with the axes a case cares about; everything else takes its schema default. */
function def(over: Partial<RpgTrackerDef> & Pick<RpgTrackerDef, "key" | "label" | "shape" | "write" | "subject">): RpgTrackerDef {
  return rpgTrackerDefSchema.parse(over);
}

/** ONE tracker reading, TOTAL (the stored shape). */
function reading(value: number | string | null, items: string[] | null = null, max: number | null = null): RpgTrackerValue {
  return { value, items, max };
}

/** A cast ACTOR row with its identity half (R2 — a person is one row: name, stance and guides beside the
 *  tracked state, so a presence drop destroys none of it). */
function member(
  key: string,
  name: string,
  over: Partial<NonNullable<RpgSnapshotState["actorState"][number]["identity"]>> = {},
): RpgSnapshotState["actorState"][number] {
  return { ...castVolatile(key), identity: { name, emoji: "", mood: "", relationship: { kind: "neutral", label: "" }, ...over } };
}

/** An empty-born snapshot state (the createGame seed shape). */
function state(over: Partial<RpgSnapshotState> = {}): RpgSnapshotState {
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

/** An npc's row, keyed by its slug (the diff correlates by the actor ref key). `over` patches the
 *  VOLATILE half — the identity half is {@link member}'s job. */
function castVolatile(npcKey: string, over: Partial<RpgSnapshotState["actorState"][number]["volatile"]> = {}): RpgSnapshotState["actorState"][number] {
  return {
    actorRef: { kind: "npc", npcKey },
    volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "", ...over },
  };
}

test("HEALTH — an ordinary tracker delta line since R3 (no bespoke hp renderer, and it carries the HINT)", () => {
  const hp = def({ key: "hp", label: "HP", shape: "meter", write: "delta", subject: "actor", max: 20, hint: "physical health" });
  const prev = state({ actorState: [castVolatile("kael", { trackerValues: { hp: reading(12) } })] });
  const cur = state({ actorState: [castVolatile("kael", { trackerValues: { hp: reading(16) } })] });
  const out = buildDeltaBlock(prev, cur, ctx({ trackerDefs: [hp] }));
  expect(out).toContain(RPG_DELTA_HEADING);
  expect(out).toContain("kael HP 12→16 (+4) — physical health");
});

const MANA = def({ key: "mana", label: "mana", shape: "meter", write: "delta", subject: "actor", max: 10 });

test("trackers — a meter's negative delta keeps its sign", () => {
  const prev = state({ actorState: [castVolatile("kael", { trackerValues: { mana: reading(5) } })] });
  const cur = state({ actorState: [castVolatile("kael", { trackerValues: { mana: reading(2) } })] });
  expect(buildDeltaBlock(prev, cur, ctx({ trackerDefs: [MANA] }))).toContain("kael mana 5→2 (-3)");
});

test("R5b — a tracker delta line carries the def's HINT (the delta block is the license's referent)", () => {
  // The R4b argument applied to the CHANGES block: a line that says WHAT moved without saying what it MEANS
  // is a bare number, and a bare number measurably does not steer narration.
  const glossed = def({ key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "resolve you spend" });
  const prev = state({ actorState: [castVolatile("kael", { trackerValues: { grit: reading(6) } })] });
  const cur = state({ actorState: [castVolatile("kael", { trackerValues: { grit: reading(3) } })] });
  expect(buildDeltaBlock(prev, cur, ctx({ trackerDefs: [glossed] }))).toContain("kael Grit 6→3 (-3) — resolve you spend");
});

// The reminder's read half renders a ZERO reading and a locked tracker; the delta is its twin and must
// agree on both, or a drain-to-zero (the beat that matters most) or a host-owned tracker moving would be
// the one transition the model never hears about.
test("trackers — a drain to ZERO is a real transition, and a first reading of 0 sets to 0 (never swallowed)", () => {
  const prev = state({ actorState: [castVolatile("kael", { trackerValues: { mana: reading(3) } })] });
  const zero = state({ actorState: [castVolatile("kael", { trackerValues: { mana: reading(0) } })] });
  expect(buildDeltaBlock(prev, zero, ctx({ trackerDefs: [MANA] }))).toContain("kael mana 3→0 (-3)");
  // …and the unset→0 arm: an actor whose row (or whose tracker) is written for the FIRST time at 0.
  const unset = state({ actorState: [castVolatile("kael")] });
  expect(buildDeltaBlock(unset, zero, ctx({ trackerDefs: [MANA] }))).toContain("kael mana → 0/10");
});

test("trackers — a LOCKED tracker still diffs (the lock is a WRITE permission, never a read filter)", () => {
  const sealed = def({ key: "sealed", label: "Sealed", shape: "meter", write: "delta", subject: "actor", max: 10, locked: true, hint: "the host owns this" });
  const prev = state({ actorState: [castVolatile("kael", { trackerValues: { sealed: reading(4) } })] });
  const cur = state({ actorState: [castVolatile("kael", { trackerValues: { sealed: reading(9) } })] });
  expect(buildDeltaBlock(prev, cur, ctx({ trackerDefs: [sealed] }))).toContain("kael Sealed 4→9 (+5) — the host owns this");
});

test("trackers — a tracker with NO def never diffs (the read projects only DEFINED trackers)", () => {
  const prev = state({ actorState: [castVolatile("kael", { trackerValues: { junk: reading(1) } })] });
  const cur = state({ actorState: [castVolatile("kael", { trackerValues: { junk: reading(2) } })] });
  expect(buildDeltaBlock(prev, cur, ctx())).toBeNull();
});

test("conditions — added and removed per actor", () => {
  const prev = state({ actorState: [castVolatile("kael", { conditions: [{ name: "Poisoned", stat: null, modifier: 0, turnsLeft: null }] })] });
  const cur = state({ actorState: [castVolatile("kael", { conditions: [{ name: "Bleeding", stat: null, modifier: 0, turnsLeft: null }] })] });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("+Bleeding (kael)");
  expect(out).toContain("-Poisoned (kael)");
});

test("inventory — add, remove, and quantity change", () => {
  const item = (name: string, quantity: number): RpgSnapshotState["actorState"][number]["volatile"]["inventory"][number] => ({
    id: name,
    name,
    description: "",
    quantity,
    location: "",
    type: "",
  });
  const prev = state({ actorState: [castVolatile("kael", { inventory: [item("potion", 2), item("torch", 1)] })] });
  const cur = state({ actorState: [castVolatile("kael", { inventory: [item("potion", 1), item("rope", 1)] })] });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("kael potion ×2→×1");
  expect(out).toContain("+rope (kael)");
  expect(out).toContain("-torch (kael)");
});

test("inventory — reports carrying-detail changes on an existing item", () => {
  const item = (description: string, location: string): RpgSnapshotState["actorState"][number]["volatile"]["inventory"][number] => ({
    id: "key_1",
    name: "small brass key",
    description,
    quantity: 1,
    location,
    type: "key",
  });
  const prev = state({ actorState: [castVolatile("hikari", { inventory: [item("a worn key", "shirt pocket")] })] });
  const cur = state({ actorState: [castVolatile("hikari", { inventory: [item("hanging from a silver chain", "around her neck")] })] });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("hikari small brass key moved: shirt pocket → around her neck");
  expect(out).toContain("hikari small brass key description → hanging from a silver chain");
});

test("wallet — a signed numeric delta per currency", () => {
  const prev = state({ actorState: [castVolatile("kael", { wallet: [{ name: "gold", amount: 40 }] })] });
  const cur = state({ actorState: [castVolatile("kael", { wallet: [{ name: "gold", amount: 55 }] })] });
  expect(buildDeltaBlock(prev, cur, ctx())).toContain("kael gold 40→55 (+15)");
});

test("ambient — location, weather, and time-of-day transitions (destination, not a numeric delta)", () => {
  const prev = state({ location: "The Docks", weather: { type: "clear", label: "" }, clock: { day: 1, hour: 9, minute: 0 } });
  const cur = state({ location: "Village of Dunmoor", weather: { type: "storm", label: "" }, clock: { day: 1, hour: 21, minute: 0 } });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("location → Village of Dunmoor");
  expect(out).toContain("weather → storm");
  expect(out).toContain("time → night"); // hour 9 (morning) → hour 21 (night)
});

test("ambient — the weather transition reports the model's LABEL over the canonical type", () => {
  // The label is what the reader sees, so it is what the "what changed" block must say. And a re-LABELLED sky
  // is a real beat even when both phrasings bin to the same type — diffing on the type alone would eat it.
  const prev = state({ weather: { type: "rain", label: "a thin grey drizzle" } });
  const cur = state({ weather: { type: "rain", label: "torrential rain" } });
  expect(buildDeltaBlock(prev, cur, ctx())).toContain("weather → torrential rain");
  // Label CLEARED (a host repick) falls back to the type, and is still a transition.
  expect(buildDeltaBlock(prev, state({ weather: { type: "rain", label: "" } }), ctx())).toContain("weather → rain");
});

test("ambient — a within-band minute tick is NOT a beat (no time delta line)", () => {
  const prev = state({ clock: { day: 1, hour: 21, minute: 0 } });
  const cur = state({ clock: { day: 1, hour: 21, minute: 30 } }); // still 'night'
  expect(buildDeltaBlock(prev, cur, ctx())).toBeNull();
});

test("present characters — joined and left the scene (presence keys; the NAME comes off the actor row)", () => {
  const actors = [member("mari", "Mari"), member("zandik", "Zandik")];
  // Both actors are TRACKED throughout — only presence moves. That is the whole R2 semantic: a departure is
  // a presence drop, so Mari's row (stance, guides, pack) is still right there for her return.
  const prev = state({ actorState: actors, presentCharacters: ["npc:mari"] });
  const cur = state({ actorState: actors, presentCharacters: ["npc:zandik"] });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("+Zandik enters");
  expect(out).toContain("-Mari leaves");
});

test("quests — status flip and objective progress, matched by id", () => {
  const q = (status: string, done: number): RpgSnapshotState["quests"][number] => ({
    id: "q_missing_key" as never,
    name: "The Missing Key",
    status: status as never,
    description: "",
    objectives: [
      { id: "o1", text: "a", completed: done >= 1 },
      { id: "o2", text: "b", completed: done >= 2 },
      { id: "o3", text: "c", completed: false },
    ],
  });
  const prev = state({ quests: [q("active", 1)] });
  const cur = state({ quests: [q("completed", 2)] });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain('quest "The Missing Key" completed');
  expect(out).toContain("The Missing Key: 1/3 → 2/3");
});

test("game trackers — a numeric delta on the game-subject plane, keyed by tracker key", () => {
  const tension = def({ key: "tension", label: "tension", shape: "meter", write: "set", subject: "game" });
  const prev = state({ trackerValues: { tension: reading(3) } });
  const cur = state({ trackerValues: { tension: reading(7) } });
  expect(buildDeltaBlock(prev, cur, ctx({ trackerDefs: [tension] }))).toContain("tension 3→7 (+4)");
});

test("first snapshot (prev === null) → SCENE OPENS, not everything-changed", () => {
  const cur = state({
    location: "The Rusty Anchor",
    actorState: [member("mari", "Mari")],
    presentCharacters: ["npc:mari"],
    quests: [{ id: "q1" as never, name: "Find the ledger", status: "active", description: "", objectives: [] }],
  });
  const out = buildDeltaBlock(null, cur, ctx());
  expect(out).toContain(RPG_SCENE_OPENS_HEADING);
  expect(out).toContain("The Rusty Anchor");
  expect(out).toContain("Mari");
  expect(out).toContain("Find the ledger");
  // It must NOT read as a delta ("→" transitions) — the born state is an OPENING, not a change.
  expect(out).not.toContain(RPG_DELTA_HEADING);
});

// The SCENE OPENS block names a PARTICIPANT actor through `ctx.participantNames` — the ONE presence-key→name join
// (`presenceName` → `actorLabel`). A PARTICIPANT actor carries NO identity by R2 design, so a join that read only
// `identity?.name` fell back to the raw ref KEY and printed `with character:chr_…` into the model's prompt on
// turn 1 of effectively every new game (establish-when-unset FORCES a non-empty cast, and the model lists the
// participant character). A branded TypeID is never model-facing — the projection-clean law, and an id in the
// prompt invites the model to echo ids as names.
test("SCENE OPENS names a PARTICIPANT actor by her display name — never her raw ref key (the projection-clean law)", () => {
  const cur = state({
    location: "The Ford",
    actorState: [
      {
        actorRef: { kind: "character", characterId: "char_kael" as never },
        volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" },
      },
      member("mira", "Mira"),
    ],
    presentCharacters: ["character:char_kael", "npc:mira"],
  });
  const out = buildDeltaBlock(null, cur, ctx({ participantNames: { "character:char_kael": "Kael" } }));
  expect(out).toContain("with Kael, Mira");
  expect(out).not.toContain("char_kael");
  expect(out).not.toContain("character:");
});

test("SCENE OPENS falls back to the GENERIC label when the participant map has no name — still never a raw id", () => {
  // A gone member (or a caller that supplies no binding): `actorLabel`'s own fallback wins, and it is a WORD.
  const cur = state({
    location: "The Ford",
    actorState: [
      { actorRef: { kind: "user", userId: "usr_1" as never }, volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" } },
    ],
    presentCharacters: ["user:usr_1"],
  });
  const out = buildDeltaBlock(null, cur, ctx());
  expect(out).toContain("with you");
  expect(out).not.toContain("usr_1");
});

// The row-LESS arm (#1468 item 6). The two tests above cover a presence key whose ACTOR ROW is present; the
// hole was the key whose row is GONE — a rekey that lost it, a hand edit that dropped an actor still listed on
// stage, a stale key surviving a restore. `presenceName` returned the key itself there, so the same two
// model-facing surfaces the participant join was fixed for got `character:chr_…` after all.
test("SCENE OPENS never leaks a key whose ACTOR ROW is missing — the participant map answers, else a WORD", () => {
  const cur = state({
    location: "The Ford",
    actorState: [], // every row gone; the presence plane still lists them
    presentCharacters: ["character:char_kael", "user:usr_1", "npc:mira"],
  });
  const out = buildDeltaBlock(null, cur, ctx({ participantNames: { "character:char_kael": "Kael" } }));

  expect(out).toContain("Kael"); // the participant map is keyed by the SAME projection — it answers with no row
  expect(out).toContain("you"); // the unnamed participant ref takes the generic word
  expect(out).toContain("mira"); // an npc key's tail is its authored slug, not an id
  expect(out).not.toContain("char_kael");
  expect(out).not.toContain("usr_1");
  expect(out).not.toContain("character:");
  expect(out).not.toContain("user:");
  expect(out).not.toContain("npc:");
});

test("the ENTERS/LEAVES lines take the same arm — the leak was in one helper, so both readers had it", () => {
  const prev = state({ actorState: [], presentCharacters: [] });
  const cur = state({ actorState: [], presentCharacters: ["character:char_kael"] });
  const out = buildDeltaBlock(prev, cur, ctx());

  expect(out).toContain("+character enters"); // no name anywhere for this ref — the generic word, never the id
  expect(out).not.toContain("char_kael");
});

test("first snapshot with an empty born state → OMIT (null, no phantom SCENE OPENS)", () => {
  expect(buildDeltaBlock(null, state(), ctx())).toBeNull();
});

test("no change → OMIT the block entirely (null, byte-stable quiet-turn signal)", () => {
  const s = state({ location: "The Docks", actorState: [castVolatile("kael", { trackerValues: { hp: reading(10) } })] });
  // Same state on both ends — nothing moved.
  expect(buildDeltaBlock(s, structuredClone(s), ctx())).toBeNull();
});

test("HEAL (§2.7.4) — a malformed plane degrades its line, the block still renders the good planes", () => {
  // A hand-edit / future-applier bug slips a malformed actorState shape past the write backstop: `conditions`
  // is not an array (the conditions renderer's `.map` throws). That plane's line degrades to nothing; the
  // well-formed wallet plane still renders.
  const prev = state({ actorState: [castVolatile("kael", { wallet: [{ name: "gold", amount: 10 }] })] });
  const cur = state({
    actorState: [
      {
        ...castVolatile("kael", { wallet: [{ name: "gold", amount: 25 }] }),
        volatile: { ...castVolatile("kael").volatile, wallet: [{ name: "gold", amount: 25 }], conditions: null as never },
      },
    ],
  });
  const out = buildDeltaBlock(prev, cur, ctx());
  // The block SURVIVED (didn't throw) and the well-formed wallet plane still rendered.
  expect(out).toContain("kael gold 10→25 (+15)");
});

test("the registry is OPEN — a new PlaneDiffRenderer contributes without a monolith edit (the P1 seam)", () => {
  // Prove the extension shape P1 uses: `definePlaneDiff` binds a typed renderer into the registry's erased
  // shape, and the block concats registered lines. A renderer registered here emits its line into the block.
  const tag = definePlaneDiff<string>({
    plane: "test-plane",
    select: (s) => s.location,
    render: (p, c) => (p !== c ? [`custom: ${p} → ${c}`] : []),
  });
  // The shipped registry already carries the built-in planes; the seam is `definePlaneDiff` + array push.
  expect(PLANE_DIFF_RENDERERS.length).toBeGreaterThan(0);
  expect(tag.plane).toBe("test-plane");
  expect(tag.run(state({ location: "a" }), state({ location: "b" }), ctx())).toEqual(["custom: a → b"]);
});

// ── P1 additions: relationship / cast-fields / widgets set-delta / calendar-agnostic ambient / participant names ──

test("relationship — a per-npc stance transition (feature 1, the steering loop signal)", () => {
  const prev = state({ actorState: [member("mari", "Mari", { relationship: { kind: "friend", label: "" } })] });
  const cur = state({ actorState: [member("mari", "Mari", { relationship: { kind: "enemy", label: "" } })] });
  expect(buildDeltaBlock(prev, cur, ctx())).toContain("Mari: friend → enemy");
});

test("relationship — a custom kind glosses with the M1 hint", () => {
  const prev = state({ actorState: [member("mari", "Mari", { relationship: { kind: "neutral", label: "" } })] });
  const cur = state({ actorState: [member("mari", "Mari", { relationship: { kind: "custom", label: "vassal" } })] });
  const out = buildDeltaBlock(prev, cur, ctx({ relationshipHints: { vassal: "sworn to serve but resentful" } }));
  expect(out).toContain("Mari: neutral → vassal (sworn to serve but resentful)");
});

test("trackers — an NPC's trackers diff on the SAME per-actor plane a party member's do (one value home)", () => {
  // The unification: a npc's tracked values live on `actorState` under `npc:<key>` — the retired
  // `presentCharacters[].customFields` string record is gone, and with it the second diff grammar.
  const suspicion = def({ key: "suspicion", label: "suspicion", shape: "meter", write: "set", subject: "actor", appliesTo: "npcs", max: 10 });
  const trust = def({ key: "trust", label: "trust", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" });
  const prev = state({ actorState: [castVolatile("Mari", { trackerValues: { suspicion: reading(3), trust: reading("guarded") } })] });
  const cur = state({ actorState: [castVolatile("Mari", { trackerValues: { suspicion: reading(7), trust: reading("open") } })] });
  const out = buildDeltaBlock(prev, cur, ctx({ trackerDefs: [suspicion, trust] }));
  expect(out).toContain("Mari suspicion 3→7 (+4)");
  expect(out).toContain("Mari trust: guarded → open");
});

test("trackers — a LIST tracker diffs as one membership transition", () => {
  const loadout = def({ key: "loadout", label: "loadout", shape: "list", write: "set", subject: "game" });
  const prev = state({ trackerValues: { loadout: reading(null, ["Sword", "Shield"]) } });
  const cur = state({ trackerValues: { loadout: reading(null, ["Sword", "Bow"]) } });
  expect(buildDeltaBlock(prev, cur, ctx({ trackerDefs: [loadout] }))).toContain("loadout: Sword, Shield → Sword, Bow");
});

test("trackers — an unchanged list produces NO line", () => {
  const loadout = def({ key: "loadout", label: "loadout", shape: "list", write: "set", subject: "game" });
  const prev = state({ trackerValues: { loadout: reading(null, ["Sword", "Shield"]) } });
  const cur = state({ trackerValues: { loadout: reading(null, ["Sword", "Shield"]) } });
  expect(buildDeltaBlock(prev, cur, ctx({ trackerDefs: [loadout] }))).toBeNull();
});

test("ambient — the game calendar is OPAQUE: a free-text date string diffs as a raw label (fold-in #6)", () => {
  const prev = state({ calendarDate: "3rd of Frostmoon", clock: { day: 3, hour: 12, minute: 0 } });
  const cur = state({ calendarDate: "4th of Frostmoon", clock: { day: 4, hour: 12, minute: 0 } });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("date → 4th of Frostmoon"); // opaque string diff — never parsed
  expect(out).toContain("day 3 → day 4"); // the integer day counter, independent of the date string
});

test("ambient — a long rest fires all three time arms together (date + day + time-of-day)", () => {
  const prev = state({ calendarDate: "Day 3", clock: { day: 3, hour: 12, minute: 0 } }); // noon
  const cur = state({ calendarDate: "Day 4", clock: { day: 4, hour: 8, minute: 0 } }); // next morning
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("date → Day 4");
  expect(out).toContain("day 3 → day 4");
  expect(out).toContain("time → morning");
});

test("participant names — a character-kind actor names via the participant map, not the generic label (fold-in #5)", () => {
  const hp = def({ key: "hp", label: "HP", shape: "meter", write: "delta", subject: "actor", max: 20 });
  const kael = (value: number): RpgSnapshotState["actorState"][number] => ({
    actorRef: { kind: "character", characterId: "char_kael" as never },
    volatile: { trackerValues: { hp: reading(value) }, conditions: [], inventory: [], wallet: [], status: "" },
  });
  const out = buildDeltaBlock(
    state({ actorState: [kael(12)] }),
    state({ actorState: [kael(16)] }),
    ctx({ participantNames: { "character:char_kael": "Kael" }, trackerDefs: [hp] }),
  );
  expect(out).toContain("Kael HP 12→16 (+4)"); // named, not "character HP …"
});

// ── P5 — the plot plane renderer ────────────────────────────────────────────────────────────────────────

test("plot — an act ADVANCE renders the transition with act titles (P5)", () => {
  const prev = state({ plot: { act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "" }] } });
  const cur = state({
    plot: {
      act: 2,
      title: "The Bone Key",
      acts: [
        { title: "Arrival", summary: "" },
        { title: "Descent", summary: "" },
      ],
    },
  });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain('act 1 "Arrival" → act 2 "Descent"');
});

test("plot — the plane APPEARING renders a story-begins line; same-act title edits are silent", () => {
  const born = state({ plot: { act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "" }] } });
  const out = buildDeltaBlock(state(), born, ctx());
  expect(out).toContain('story begins: "The Bone Key" — act 1 "Arrival"');
  // A summary/title polish WITHIN the same act is authoring, not a beat.
  const polished = state({ plot: { act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "notes" }] } });
  expect(buildDeltaBlock(born, polished, ctx())).toBeNull();
});

test("plot — a null→null / unchanged plot renders nothing (byte-stable quiet turn)", () => {
  expect(buildDeltaBlock(state(), state(), ctx())).toBeNull();
  const p = { act: 1, title: "", acts: [] };
  expect(buildDeltaBlock(state({ plot: p }), state({ plot: { ...p } }), ctx())).toBeNull();
});
