// tests/server/domain/rpg/substrate/delta — the prev→current SNAPSHOT DIFF (parity-plus §2.7). A PURE fn over
// two snapshot states, so a unit test over hand-built states: per-plane rendering (numeric sign / set add-remove
// / scene transition / quest flip / objective progress), the first-snapshot arm (SCENE OPENS, not
// everything-changed), the no-change OMIT arm (null, byte-stable), the §2.7.4 DEFENSIVE heal arm (a malformed
// plane degrades that line, the block survives), and the OPEN registry (a new renderer contributes without a
// monolith edit — the P1 seam). The swipe-consistency + hand-edit-source classes ride the gather int test (a
// flush→read ROUND-TRIP, not a pure peek) — they live in chat-ops/gather.int.test.ts.

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { DeltaContext } from "../../../../../packages/server/src/domain/rpg/contract/delta";
import {
  buildDeltaBlock,
  definePlaneDiff,
  PLANE_DIFF_RENDERERS,
  RPG_DELTA_HEADING,
  RPG_SCENE_OPENS_HEADING,
} from "../../../../../packages/server/src/domain/rpg/substrate/delta";
import { expect, test } from "../../../../support/fixtures";

/** The pure diff's data context (roster names + cast-field schemas + relationship hints). The default is empty
 *  (the pre-P1 behavior — short id tails, no cast-field lines); a case that needs a roster name / cast field /
 *  hint passes its own. */
function ctx(over: Partial<DeltaContext> = {}): DeltaContext {
  return { rosterNames: {}, castFields: [], relationshipHints: {}, ...over };
}

/** A present character (born with the neutral relationship default — the swipe-volatile plane shape). */
function member(key: string, name: string, over: Partial<RpgSnapshotState["presentCharacters"][number]> = {}): RpgSnapshotState["presentCharacters"][number] {
  return { key, name, emoji: "", mood: "", customFields: {}, relationship: { kind: "neutral", label: "" }, ...over };
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
    widgetValues: {},
    quests: [],
    fieldLocks: null,
    ...over,
  };
}

/** A cast actor's volatile row (the diff correlates by the cast key). */
function castVolatile(castKey: string, over: Partial<RpgSnapshotState["actorState"][number]> = {}): RpgSnapshotState["actorState"][number] {
  return {
    actorRef: { kind: "cast", castKey },
    hp: null,
    pools: [],
    conditions: [],
    inventory: [],
    wallet: [],
    status: "",
    ...over,
  };
}

test("HP — a signed numeric delta with the actor name", () => {
  const prev = state({ actorState: [castVolatile("kael", { hp: { value: 12, max: 20 } })] });
  const cur = state({ actorState: [castVolatile("kael", { hp: { value: 16, max: 20 } })] });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain(RPG_DELTA_HEADING);
  expect(out).toContain("kael HP 12→16 (+4)");
});

test("pools — a negative delta keeps its sign", () => {
  const prev = state({ actorState: [castVolatile("kael", { pools: [{ name: "mana", value: 5, max: 10 }] })] });
  const cur = state({ actorState: [castVolatile("kael", { pools: [{ name: "mana", value: 2, max: 10 }] })] });
  expect(buildDeltaBlock(prev, cur, ctx())).toContain("kael mana 5→2 (-3)");
});

test("conditions — added and removed per actor", () => {
  const prev = state({ actorState: [castVolatile("kael", { conditions: [{ name: "Poisoned", stat: null, modifier: 0, turnsLeft: null }] })] });
  const cur = state({ actorState: [castVolatile("kael", { conditions: [{ name: "Bleeding", stat: null, modifier: 0, turnsLeft: null }] })] });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("+Bleeding (kael)");
  expect(out).toContain("-Poisoned (kael)");
});

test("inventory — add, remove, and quantity change", () => {
  const item = (name: string, quantity: number): RpgSnapshotState["actorState"][number]["inventory"][number] => ({
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

test("wallet — a signed numeric delta per currency", () => {
  const prev = state({ actorState: [castVolatile("kael", { wallet: [{ name: "gold", amount: 40 }] })] });
  const cur = state({ actorState: [castVolatile("kael", { wallet: [{ name: "gold", amount: 55 }] })] });
  expect(buildDeltaBlock(prev, cur, ctx())).toContain("kael gold 40→55 (+15)");
});

test("ambient — location, weather, and time-of-day transitions (destination, not a numeric delta)", () => {
  const prev = state({ location: "The Docks", weather: { type: "clear" }, clock: { day: 1, hour: 9, minute: 0 } });
  const cur = state({ location: "Village of Dunmoor", weather: { type: "storm" }, clock: { day: 1, hour: 21, minute: 0 } });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("location → Village of Dunmoor");
  expect(out).toContain("weather → storm");
  expect(out).toContain("time → night"); // hour 9 (morning) → hour 21 (night)
});

test("ambient — a within-band minute tick is NOT a beat (no time delta line)", () => {
  const prev = state({ clock: { day: 1, hour: 21, minute: 0 } });
  const cur = state({ clock: { day: 1, hour: 21, minute: 30 } }); // still 'night'
  expect(buildDeltaBlock(prev, cur, ctx())).toBeNull();
});

test("present cast — joined and left the scene", () => {
  const prev = state({ presentCharacters: [member("mari", "Mari")] });
  const cur = state({ presentCharacters: [member("zandik", "Zandik")] });
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

test("widgets — a numeric delta keyed by label", () => {
  const prev = state({ widgetValues: { tension: { value: 3 } } });
  const cur = state({ widgetValues: { tension: { value: 7 } } });
  expect(buildDeltaBlock(prev, cur, ctx())).toContain("tension 3→7 (+4)");
});

test("first snapshot (prev === null) → SCENE OPENS, not everything-changed", () => {
  const cur = state({
    location: "The Rusty Anchor",
    presentCharacters: [member("mari", "Mari")],
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

test("first snapshot with an empty born state → OMIT (null, no phantom SCENE OPENS)", () => {
  expect(buildDeltaBlock(null, state(), ctx())).toBeNull();
});

test("no change → OMIT the block entirely (null, byte-stable quiet-turn signal)", () => {
  const s = state({ location: "The Docks", actorState: [castVolatile("kael", { hp: { value: 10, max: 10 } })] });
  // Same state on both ends — nothing moved.
  expect(buildDeltaBlock(s, structuredClone(s), ctx())).toBeNull();
});

test("HEAL (§2.7.4) — a malformed plane degrades its line, the block still renders the good planes", () => {
  // A hand-edit / future-applier bug slips a malformed actorState shape past the write backstop: `pools` is not
  // an array (a `.map` inside the pool renderer throws). The pool line degrades to nothing; HP still renders.
  const prev = state({ actorState: [castVolatile("kael", { hp: { value: 12, max: 20 } })] });
  const cur = state({
    actorState: [{ ...castVolatile("kael", { hp: { value: 16, max: 20 } }), pools: null as never }],
  });
  const out = buildDeltaBlock(prev, cur, ctx());
  // The block SURVIVED (didn't throw) and the well-formed HP plane still rendered.
  expect(out).toContain("kael HP 12→16 (+4)");
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

// ── P1 additions: relationship / cast-fields / widgets set-delta / calendar-agnostic ambient / roster names ──

test("relationship — a per-cast stance transition (feature 1, the steering loop signal)", () => {
  const prev = state({ presentCharacters: [member("mari", "Mari", { relationship: { kind: "friend", label: "" } })] });
  const cur = state({ presentCharacters: [member("mari", "Mari", { relationship: { kind: "enemy", label: "" } })] });
  expect(buildDeltaBlock(prev, cur, ctx())).toContain("Mari: friend → enemy");
});

test("relationship — a custom kind glosses with the M1 hint", () => {
  const prev = state({ presentCharacters: [member("mari", "Mari", { relationship: { kind: "neutral", label: "" } })] });
  const cur = state({ presentCharacters: [member("mari", "Mari", { relationship: { kind: "custom", label: "vassal" } })] });
  const out = buildDeltaBlock(prev, cur, ctx({ relationshipHints: { vassal: "sworn to serve but resentful" } }));
  expect(out).toContain("Mari: neutral → vassal (sworn to serve but resentful)");
});

test("cast-fields — a meter diffs numerically, a text field as a transition (feature C, §2.8)", () => {
  const prev = state({ presentCharacters: [member("mari", "Mari", { customFields: { suspicion: "3", trust: "guarded" } })] });
  const cur = state({ presentCharacters: [member("mari", "Mari", { customFields: { suspicion: "7", trust: "open" } })] });
  const castFields = [
    { key: "suspicion", label: "suspicion", kind: "meter", max: 10 },
    { key: "trust", label: "trust", kind: "text" },
  ] as const;
  const out = buildDeltaBlock(prev, cur, ctx({ castFields }));
  expect(out).toContain("Mari suspicion 3→7 (+4)");
  expect(out).toContain("Mari trust: guarded → open");
});

test("cast-fields — an UNDEFINED field key never diffs (no opaque-record fallback)", () => {
  const prev = state({ presentCharacters: [member("mari", "Mari", { customFields: { junk: "a" } })] });
  const cur = state({ presentCharacters: [member("mari", "Mari", { customFields: { junk: "b" } })] });
  // No cast-field schema defines "junk" → the feature is off for it → the block omits (nothing else changed).
  expect(buildDeltaBlock(prev, cur, ctx())).toBeNull();
});

test("widgets — the items SET-delta: added/removed produce lines (fold-in #4)", () => {
  const prev = state({ widgetValues: { loadout: { items: ["Sword", "Shield"] } } });
  const cur = state({ widgetValues: { loadout: { items: ["Sword", "Bow"] } } });
  const out = buildDeltaBlock(prev, cur, ctx());
  expect(out).toContain("loadout +Bow");
  expect(out).toContain("loadout -Shield");
});

test("widgets — a REORDER-ONLY items change produces NO line (set membership unchanged)", () => {
  const prev = state({ widgetValues: { loadout: { items: ["Sword", "Shield"] } } });
  const cur = state({ widgetValues: { loadout: { items: ["Shield", "Sword"] } } });
  expect(buildDeltaBlock(prev, cur, ctx())).toBeNull();
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

test("roster names — a character-kind actor names via the roster map, not the generic label (fold-in #5)", () => {
  const kael = (over: Partial<RpgSnapshotState["actorState"][number]>): RpgSnapshotState["actorState"][number] => ({
    actorRef: { kind: "character", characterId: "char_kael" as never },
    hp: null,
    pools: [],
    conditions: [],
    inventory: [],
    wallet: [],
    status: "",
    ...over,
  });
  const prev = state({ actorState: [kael({ hp: { value: 12, max: 20 } })] });
  const cur = state({ actorState: [kael({ hp: { value: 16, max: 20 } })] });
  const out = buildDeltaBlock(prev, cur, ctx({ rosterNames: { "character:char_kael": "Kael" } }));
  expect(out).toContain("Kael HP 12→16 (+4)"); // named, not "character HP …"
});
