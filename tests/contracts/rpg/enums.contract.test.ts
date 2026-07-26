// @orb/contracts/rpg/enums — the string-union tuples are the ONE home for each axis (the db CHECK derives
// from them). Pins the committed membership + that every schema derives from its tuple (no inline re-spell).

import {
  RPG_CHECKPOINT_TRIGGERS,
  RPG_GAME_MODES,
  RPG_GAME_STATUSES,
  RPG_JOURNAL_TYPES,
  RPG_QUEST_STATUSES,
  RPG_WIDGET_POSITIONS,
  RPG_WIDGET_TYPES,
  rpgCheckpointTriggerSchema,
  rpgGameModeSchema,
  rpgGameStatusSchema,
  rpgJournalTypeSchema,
  rpgQuestStatusSchema,
  rpgWidgetPositionSchema,
  rpgWidgetTypeSchema,
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

test("RPG_JOURNAL_TYPES is the whole label vocabulary", () => {
  expect(RPG_JOURNAL_TYPES).toEqual(["location", "npc", "combat", "quest", "item", "event", "note"]);
  expect(rpgJournalTypeSchema.options).toEqual(RPG_JOURNAL_TYPES);
});

test("RPG_CHECKPOINT_TRIGGERS is lite's [manual] only (full ADDS members)", () => {
  expect(RPG_CHECKPOINT_TRIGGERS).toEqual(["manual"]);
  expect(rpgCheckpointTriggerSchema.safeParse("session").success).toBe(false);
});

test("RPG_WIDGET_TYPES / RPG_WIDGET_POSITIONS derive their schemas", () => {
  expect(rpgWidgetTypeSchema.options).toEqual(RPG_WIDGET_TYPES);
  expect(rpgWidgetPositionSchema.options).toEqual(RPG_WIDGET_POSITIONS);
});
