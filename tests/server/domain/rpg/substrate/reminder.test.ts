// tests/server/domain/rpg/substrate/reminder — the lite steering-injection assembler (rpg-design/05 §4.7).
// Pure string-building, so a unit test over hand-built tracker views: the state block per entity, the versioned
// license, and `steeringNote` LAST. The char turn is tool-less (owner ruling 2026-07-27) — the reminder carries
// NO tool-update guidance (that checklist lives in the tool round's prompt, entry/compose/rpg.ts).

import type { RpgSnapshotState, RpgTrackerView } from "@orb/contracts/rpg";
import type { LiteReminderInput } from "../../../../../packages/server/src/domain/rpg/contract/params";
import { buildLiteReminder, RPG_STEERING_LICENSE } from "../../../../../packages/server/src/domain/rpg/substrate/reminder";
import { expect, test } from "../../../../support/fixtures";

/** A minimal empty tracker view (a fresh game — no state to report). */
function emptyView(over: Partial<RpgTrackerView> = {}): RpgTrackerView {
  return {
    ambient: null,
    actors: [],
    cast: [],
    castFields: [],
    widgets: [],
    quests: [],
    recentBeats: [],
    trackersReadOnly: false,
    poolOrbs: [],
    ...over,
  };
}

/** An empty snapshot state (the delta block's inputs — the reminder tests default to a no-change pair so the
 *  delta block OMITS, keeping the pre-delta assertions byte-stable; the delta placement is its own test). */
function emptyState(): RpgSnapshotState {
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
  };
}

/** A reminder input with the delta pair defaulted to a no-change (omitted-block) pair. */
function input(over: Partial<LiteReminderInput> = {}): LiteReminderInput {
  return { view: emptyView(), steeringNote: "", curSnapshot: emptyState(), prevSnapshot: emptyState(), relationshipHints: {}, rosterNames: {}, ...over };
}

test("a fresh game reminder is just the license (no phantom empty headers; no-change delta omitted)", () => {
  const out = buildLiteReminder(input());
  expect(out).toBe(RPG_STEERING_LICENSE);
});

test("the reminder NEVER carries tool-update guidance (the char turn is tool-less; F7)", () => {
  // The dead UPDATE_GUIDANCE block was removed — the reminder is state flavor + license + note only. A
  // tool name appearing here would mean the dead block came back (the maintenance-trap the stickler flagged).
  const view = emptyView({
    actors: [
      {
        actorRef: { kind: "cast", castKey: "k" },
        name: "K",
        sheet: { className: "", attributes: {}, poolDefs: [], maxHp: null, level: null },
        volatile: null,
      },
    ],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).not.toContain("update_party");
  expect(out).not.toContain("MUST record");
});

test("the state block reports each plane, label-as-mini-prompt", () => {
  const view = emptyView({
    ambient: { location: "The Rusty Anchor", calendarDate: null, clock: { day: 2, hour: 21, minute: 0 }, weather: { type: "rain" } },
    actors: [
      {
        actorRef: { kind: "cast", castKey: "kael" },
        name: "Kael",
        sheet: { className: "Rogue", attributes: { dex: 16 }, poolDefs: [], maxHp: null, level: 3 },
        volatile: {
          actorRef: { kind: "cast", castKey: "kael" },
          hp: { value: 8, max: 12 },
          pools: [{ name: "focus", value: 3, max: 5 }],
          conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
          inventory: [{ id: "i1", name: "dagger", description: "", quantity: 2, location: "", type: "" }],
          wallet: [{ name: "gold", amount: 40 }],
          status: "on edge",
        },
      },
    ],
    quests: [{ id: "q1", name: "Find the ledger", status: "active", description: "", objectives: [{ id: "o1", text: "search the office", completed: false }] }],
    recentBeats: ["The door slammed shut."],
  });
  const out = buildLiteReminder(input({ view }));
  // Ambient (time-of-day derived from hour 21 → "night"), the actor line, quest + open objective, beat.
  expect(out).toContain("The Rusty Anchor");
  expect(out).toContain("night");
  expect(out).toContain("Kael");
  expect(out).toContain("HP 8/12");
  expect(out).toContain("focus 3/5");
  expect(out).toContain("40 gold");
  expect(out).toContain("dagger ×2");
  expect(out).toContain("poisoned");
  expect(out).toContain("Find the ledger");
  expect(out).toContain("search the office");
  expect(out).toContain("The door slammed shut.");
  expect(out).toContain("Lv 3"); // §2.6 — the actor's hand-only level rides the party line
});

test("the cast line renders relationship + cast-fields kind-aware (features 1 + C)", () => {
  const view = emptyView({
    cast: [
      {
        key: "Mari",
        name: "Mari",
        emoji: "",
        mood: "wary",
        customFields: { suspicion: "7", trust: "guarded" },
        relationship: { kind: "custom", label: "vassal" },
      },
    ],
    castFields: [
      { key: "suspicion", label: "suspicion", kind: "meter", max: 10 },
      { key: "trust", label: "trust", kind: "text" },
    ],
  });
  const out = buildLiteReminder(input({ view, relationshipHints: { vassal: "sworn to serve but resentful" } }));
  expect(out).toContain("Mari");
  expect(out).toContain("wary");
  expect(out).toContain("vassal (sworn to serve but resentful)"); // M1 hint gloss
  expect(out).toContain("suspicion 7/10"); // meter kind-aware
  expect(out).toContain("trust: guarded"); // text kind
});

test("a neutral relationship is silent in the cast line (no steering signal)", () => {
  const view = emptyView({
    cast: [{ key: "Bob", name: "Bob", emoji: "", mood: "", customFields: {}, relationship: { kind: "neutral", label: "" } }],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).toContain("Bob");
  expect(out).not.toContain("neutral");
});

test("the steering note is the always-wins tail (LAST)", () => {
  const out = buildLiteReminder(input({ steeringNote: "Keep it grim." }));
  expect(out.endsWith("Keep it grim.")).toBe(true);
  // It sits after the license.
  expect(out.indexOf("Keep it grim.")).toBeGreaterThan(out.indexOf(RPG_STEERING_LICENSE));
});

test("an active-only quest filter (completed quests never clutter the reminder)", () => {
  const view = emptyView({
    quests: [
      { id: "q1", name: "Open quest", status: "active", description: "", objectives: [] },
      { id: "q2", name: "Done quest", status: "completed", description: "", objectives: [] },
    ],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).toContain("Open quest");
  expect(out).not.toContain("Done quest");
});

test("the DELTA block renders BETWEEN the state block and the license (§2.7 placement, always-on)", () => {
  // A prev→cur pair with a real change: the delta must appear AFTER the game-state absolutes and BEFORE the
  // license (the license's "let the change land" gets its referent).
  const actor = (hp: number): RpgSnapshotState => ({
    ...emptyState(),
    location: "The Docks",
    actorState: [{ actorRef: { kind: "cast", castKey: "kael" }, hp: { value: hp, max: 20 }, pools: [], conditions: [], inventory: [], wallet: [], status: "" }],
  });
  const view = emptyView({ ambient: { location: "The Docks", calendarDate: null, clock: null, weather: null } });
  const out = buildLiteReminder(input({ view, curSnapshot: actor(16), prevSnapshot: actor(12) }));
  expect(out).toContain("CHANGES SINCE LAST BEAT");
  expect(out).toContain("kael HP 12→16 (+4)");
  // Placement: after the game-state header, before the license.
  expect(out.indexOf("# Game state")).toBeLessThan(out.indexOf("CHANGES SINCE LAST BEAT"));
  expect(out.indexOf("CHANGES SINCE LAST BEAT")).toBeLessThan(out.indexOf(RPG_STEERING_LICENSE));
});

test("no-change delta is OMITTED — the reminder is byte-stable on a quiet turn", () => {
  const s = { ...emptyState(), location: "The Docks" };
  const out = buildLiteReminder(input({ curSnapshot: s, prevSnapshot: { ...s } }));
  expect(out).not.toContain("CHANGES SINCE LAST BEAT");
});

test("the first-snapshot delta labels the born state as SCENE OPENS (not everything-changed)", () => {
  const born: RpgSnapshotState = { ...emptyState(), location: "The Rusty Anchor" };
  const out = buildLiteReminder(input({ curSnapshot: born, prevSnapshot: null }));
  expect(out).toContain("SCENE OPENS");
  expect(out).toContain("The Rusty Anchor");
  expect(out).not.toContain("CHANGES SINCE LAST BEAT");
});
