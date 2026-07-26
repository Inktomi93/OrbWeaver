// tests/server/domain/rpg/substrate/reminder — the lite steering-injection assembler (rpg-design/05 §4.7).
// Pure string-building, so a unit test over hand-built tracker views: the state block per entity, the versioned
// license, the update-guidance gated on tool-capability, and `steeringNote` LAST.

import type { RpgTrackerView } from "@orb/contracts/rpg";
import { buildLiteReminder, RPG_STEERING_LICENSE } from "../../../../../packages/server/src/domain/rpg/substrate/reminder";
import { expect, test } from "../../../../support/fixtures";

/** A minimal empty tracker view (a fresh game — no state to report). */
function emptyView(over: Partial<RpgTrackerView> = {}): RpgTrackerView {
  return {
    ambient: null,
    actors: [],
    cast: [],
    widgets: [],
    quests: [],
    recentBeats: [],
    trackersReadOnly: false,
    poolOrbs: [],
    ...over,
  };
}

test("a fresh game reminder is just the license (no phantom empty headers)", () => {
  const out = buildLiteReminder({ view: emptyView(), toolCapable: false, steeringNote: "" });
  expect(out).toBe(RPG_STEERING_LICENSE);
});

test("the state block reports each plane, label-as-mini-prompt", () => {
  const view = emptyView({
    ambient: { location: "The Rusty Anchor", calendarDate: null, clock: { day: 2, hour: 21, minute: 0 }, weather: { type: "rain" } },
    actors: [
      {
        actorRef: { kind: "cast", castKey: "kael" },
        name: "Kael",
        sheet: { className: "Rogue", attributes: { dex: 16 }, poolDefs: [], maxHp: null },
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
  const out = buildLiteReminder({ view, toolCapable: true, steeringNote: "" });
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
});

test("update-guidance rides ONLY a tool-capable turn (the designed honest degrade)", () => {
  const withTools = buildLiteReminder({ view: emptyView(), toolCapable: true, steeringNote: "" });
  const withoutTools = buildLiteReminder({ view: emptyView(), toolCapable: false, steeringNote: "" });
  expect(withTools).toContain("update_party");
  expect(withoutTools).not.toContain("update_party");
});

test("the steering note is the always-wins tail (LAST)", () => {
  const out = buildLiteReminder({ view: emptyView(), toolCapable: true, steeringNote: "Keep it grim." });
  expect(out.endsWith("Keep it grim.")).toBe(true);
  // It sits after the license and the guidance.
  expect(out.indexOf("Keep it grim.")).toBeGreaterThan(out.indexOf(RPG_STEERING_LICENSE));
});

test("an active-only quest filter (completed quests never clutter the reminder)", () => {
  const view = emptyView({
    quests: [
      { id: "q1", name: "Open quest", status: "active", description: "", objectives: [] },
      { id: "q2", name: "Done quest", status: "completed", description: "", objectives: [] },
    ],
  });
  const out = buildLiteReminder({ view, toolCapable: false, steeringNote: "" });
  expect(out).toContain("Open quest");
  expect(out).not.toContain("Done quest");
});
