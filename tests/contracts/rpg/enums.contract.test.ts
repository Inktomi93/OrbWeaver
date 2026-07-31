// @orb/contracts/rpg/enums — the string-union tuples are the ONE home for each axis (the db CHECK derives
// from them). Pins the committed membership + that every schema derives from its tuple (no inline re-spell).

import {
  RPG_CHECKPOINT_TRIGGERS,
  RPG_GAME_MODES,
  RPG_GAME_STATUSES,
  RPG_JOURNAL_TYPES,
  RPG_QUEST_STATUSES,
  RPG_TRACKER_CARRIER_CLASSES,
  RPG_TRACKER_SHAPES,
  RPG_TRACKER_SUBJECTS,
  RPG_TRACKER_WRITES,
  rpgCheckpointTriggerSchema,
  rpgGameModeSchema,
  rpgGameStatusSchema,
  rpgJournalTypeSchema,
  rpgQuestStatusSchema,
  rpgTrackerCarrierClassSchema,
  rpgTrackerShapeSchema,
  rpgTrackerSubjectSchema,
  rpgTrackerWriteSchema,
} from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("RPG_GAME_MODES is the committed [lite, full] axis and the schema derives from it", () => {
  expect(RPG_GAME_MODES).toEqual(["lite", "full"]);
  expect(rpgGameModeSchema.options).toEqual(RPG_GAME_MODES);
  expect(rpgGameModeSchema.safeParse("full").success).toBe(true);
  expect(rpgGameModeSchema.safeParse("guided").success).toBe(false);
});

test("RPG_GAME_STATUSES ships the full wizard vocabulary; lite mints active", () => {
  expect(RPG_GAME_STATUSES).toEqual(["setup", "ready", "active", "concluded"]);
  expect(rpgGameStatusSchema.options).toEqual(RPG_GAME_STATUSES);
  expect(rpgGameStatusSchema.safeParse("active").success).toBe(true);
});

test("RPG_QUEST_STATUSES = [active, completed, failed]", () => {
  expect(RPG_QUEST_STATUSES).toEqual(["active", "completed", "failed"]);
  expect(rpgQuestStatusSchema.options).toEqual(RPG_QUEST_STATUSES);
});

test("RPG_JOURNAL_TYPES is the whole label vocabulary + the R4c `custom` escape", () => {
  expect(RPG_JOURNAL_TYPES).toEqual(["location", "npc", "combat", "quest", "item", "event", "note", "custom"]);
  expect(rpgJournalTypeSchema.options).toEqual(RPG_JOURNAL_TYPES);
  // R4c — `custom` is the escape a closed enum + a DB CHECK otherwise walls off (the relationship-kind shape).
  expect(rpgJournalTypeSchema.safeParse("custom").success).toBe(true);
  expect(rpgJournalTypeSchema.safeParse("ritual").success).toBe(false);
});

test("RPG_CHECKPOINT_TRIGGERS is lite's [manual] only (full ADDS members)", () => {
  expect(RPG_CHECKPOINT_TRIGGERS).toEqual(["manual"]);
  expect(rpgCheckpointTriggerSchema.safeParse("session").success).toBe(false);
});

test("the four TRACKER axes are the committed vocabularies and derive their schemas", () => {
  // The tracked-field unification: pool/meter/cast-field/band-orb/widget were ONE def read along these axes,
  // and the retired widget-type/position tuples are gone with the concept they described.
  expect(RPG_TRACKER_SHAPES).toEqual(["meter", "text", "list"]);
  expect(RPG_TRACKER_WRITES).toEqual(["delta", "set"]);
  expect(RPG_TRACKER_SUBJECTS).toEqual(["actor", "game"]);
  expect(RPG_TRACKER_CARRIER_CLASSES).toEqual(["party", "npcs", "everyone"]);
  expect(rpgTrackerShapeSchema.options).toEqual(RPG_TRACKER_SHAPES);
  expect(rpgTrackerWriteSchema.options).toEqual(RPG_TRACKER_WRITES);
  expect(rpgTrackerSubjectSchema.options).toEqual(RPG_TRACKER_SUBJECTS);
  expect(rpgTrackerCarrierClassSchema.options).toEqual(RPG_TRACKER_CARRIER_CLASSES);
});
