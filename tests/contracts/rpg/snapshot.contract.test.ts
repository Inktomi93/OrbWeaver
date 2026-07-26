// @orb/contracts/rpg/snapshot — the swipe-volatile plane shapes (§2.4-2.5). Pins the quests-in-snapshot
// shape (ratification #1: quests fold INTO the snapshot state), the objective `n/m` shape, present-cast,
// widget binding arms, and the full snapshot state's collection defaults + nullable ambient.

import { rpgFieldLocksSchema, rpgPresentCharacterSchema, rpgQuestSchema, rpgSnapshotStateSchema, rpgWidgetBindingSchema } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("a quest is a stable-id object with status + n/m objectives (the snapshot-resident shape)", () => {
  const quest = rpgQuestSchema.parse({
    id: "q1",
    name: "Find the amulet",
    status: "active",
    objectives: [
      { id: "o1", text: "Search the crypt", completed: true },
      { id: "o2", text: "Defeat the warden" },
    ],
  });
  expect(quest.status).toBe("active");
  expect(quest.objectives).toHaveLength(2);
  expect(quest.objectives[1]?.completed).toBe(false);
});

test("quest status is bounded to the tuple", () => {
  expect(rpgQuestSchema.safeParse({ id: "q", name: "x", status: "abandoned" }).success).toBe(false);
});

test("the snapshot state folds quests INSIDE it and defaults every collection (ratification #1)", () => {
  const state = rpgSnapshotStateSchema.parse({ clock: null, calendarDate: null, weather: null, fieldLocks: null });
  expect(state.quests).toEqual([]);
  expect(state.presentCharacters).toEqual([]);
  expect(state.actorState).toEqual([]);
  expect(state.recentEvents).toEqual([]);
  expect(state.widgetValues).toEqual({});
  expect(state.location).toBe("");
  expect(state.clock).toBeNull();
});

test("widget binding parses the custom + lite-live pool/hp arms", () => {
  expect(rpgWidgetBindingSchema.safeParse({ source: "custom", subjectName: null }).success).toBe(true);
  expect(rpgWidgetBindingSchema.safeParse({ source: "pool", actorKey: "hero", poolName: "mana" }).success).toBe(true);
  expect(rpgWidgetBindingSchema.safeParse({ source: "hp", actorKey: "hero" }).success).toBe(true);
});

test("present character defaults its display fields and keeps customFields as a record", () => {
  const cast = rpgPresentCharacterSchema.parse({ key: "elder", name: "The Elder", customFields: { title: "Sage" } });
  expect(cast.emoji).toBe("");
  expect(cast.customFields).toEqual({ title: "Sage" });
});

test("fieldLocks is a presence-key record of true", () => {
  expect(rpgFieldLocksSchema.safeParse({ "quests.q1": true, location: true }).success).toBe(true);
  expect(rpgFieldLocksSchema.safeParse({ "quests.q1": false }).success).toBe(false);
});
