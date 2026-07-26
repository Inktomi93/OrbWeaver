// @orb/contracts/rpg/tools — the 7 lite tool arg schemas (§4.5). Pins: the name tuple, and that EVERY arg
// schema PROJECTS to JSON Schema without throwing (the [tool-schema-no-branded-transform] class — a
// branded id / `.transform()` throws in z.toJSONSchema; the tool registry projects these at registration).

import {
  addJournalEntryArgsSchema,
  RPG_LITE_TOOL_NAMES,
  rollDiceArgsSchema,
  setWidgetValueArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "@orb/contracts/rpg";
import { z } from "zod";
import { expect, test } from "../../support/fixtures";

test("RPG_LITE_TOOL_NAMES is the committed 7-tuple full will keep", () => {
  expect(RPG_LITE_TOOL_NAMES).toEqual([
    "update_party",
    "update_inventory",
    "update_scene",
    "set_widget_value",
    "upsert_quest",
    "add_journal_entry",
    "roll_dice",
  ]);
});

test("every arg schema projects to JSON Schema without throwing (the z.toJSONSchema class)", () => {
  const schemas = [
    updatePartyArgsSchema,
    updateInventoryArgsSchema,
    updateSceneArgsSchema,
    setWidgetValueArgsSchema,
    upsertQuestArgsSchema,
    addJournalEntryArgsSchema,
    rollDiceArgsSchema,
  ];
  for (const schema of schemas) {
    expect(() => z.toJSONSchema(schema)).not.toThrow();
  }
});

test("update_party carries the targetRef + delta/condition/hp/status shape", () => {
  const parsed = updatePartyArgsSchema.parse({ targetRef: "Hero", hpDelta: -3, poolDeltas: [{ name: "mana", delta: -1 }] });
  expect(parsed.targetRef).toBe("Hero");
  expect(parsed.hpDelta).toBe(-3);
});

test("update_inventory carries walletDeltas (the stored wallet writer)", () => {
  const parsed = updateInventoryArgsSchema.parse({ targetRef: "Hero", walletDeltas: [{ name: "gold", delta: 25 }] });
  expect(parsed.walletDeltas).toEqual([{ name: "gold", delta: 25 }]);
});

test("update_scene customFields ride an array-of-pairs (the D79 additionalProperties:false regime)", () => {
  const parsed = updateSceneArgsSchema.parse({
    timeOfDay: "evening",
    presentUpsert: [{ name: "Elder", customFields: [{ name: "title", value: "Sage" }] }],
  });
  expect(parsed.presentUpsert?.[0]?.customFields).toEqual([{ name: "title", value: "Sage" }]);
});

test("upsert_quest bounds action to create/update/complete/fail", () => {
  expect(upsertQuestArgsSchema.safeParse({ name: "Q", action: "complete" }).success).toBe(true);
  expect(upsertQuestArgsSchema.safeParse({ name: "Q", action: "delete" }).success).toBe(false);
});
