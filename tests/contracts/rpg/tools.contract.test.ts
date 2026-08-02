// @orb/contracts/rpg/tools — the 7 lite tool arg schemas (§4.5). Pins: the name tuple, and that EVERY arg
// schema PROJECTS to JSON Schema without throwing (the [tool-schema-no-branded-transform] class — a
// branded id / `.transform()` throws in z.toJSONSchema; the tool registry projects these at registration).

import {
  addJournalEntryArgsSchema,
  journalTitleFor,
  journalTypeFor,
  RPG_LITE_TOOL_NAMES,
  rollDiceArgsSchema,
  setTrackerArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "@orb/contracts/rpg";
import { z } from "zod";
import { expect, test } from "../../support/fixtures";

test("RPG_LITE_TOOL_NAMES is the committed 7-tuple full will keep", () => {
  expect(RPG_LITE_TOOL_NAMES).toEqual(["update_party", "update_inventory", "update_scene", "set_tracker", "upsert_quest", "add_journal_entry", "roll_dice"]);
});

test("every arg schema projects to JSON Schema without throwing (the z.toJSONSchema class)", () => {
  const schemas = [
    updatePartyArgsSchema,
    updateInventoryArgsSchema,
    updateSceneArgsSchema,
    setTrackerArgsSchema,
    upsertQuestArgsSchema,
    addJournalEntryArgsSchema,
    rollDiceArgsSchema,
  ];
  for (const schema of schemas) {
    expect(() => z.toJSONSchema(schema)).not.toThrow();
  }
});

test("update_party carries the targetRef + the two TRACKER write arms + condition/status", () => {
  // The write axis is LOUD in the wire (the tracked-field unification): `delta` = a resource the beat spends
  // or restores; `set` = a state the beat observes. One key-addressed arm each, replacing `poolDeltas`
  // (name-addressed, meters only) and the cast row's opaque `customFields` string record.
  const parsed = updatePartyArgsSchema.parse({
    targetRef: "Hero",
    trackerDeltas: [{ key: "mana", delta: -1 }],
    trackerSets: [{ key: "trust", value: "guarded" }],
  });
  expect(parsed.targetRef).toBe("Hero");
  expect(parsed.trackerDeltas).toEqual([{ key: "mana", delta: -1 }]);
  expect(parsed.trackerSets).toEqual([{ key: "trust", value: "guarded" }]);
});

test("hpDelta is GONE from the wire (R3) — damage rides trackerDeltas with key:'hp'", () => {
  // The bespoke arm's replacement is a STRONGER gate, not a weaker one: `trackerDeltas[].key` is enum-
  // constrained per target actor to the trackers that actor CARRIES, so hp on an actor with no hp is
  // untypeable — where the retired arm accepted it and refused after the fact.
  expect(Object.keys(updatePartyArgsSchema.shape)).not.toContain("hpDelta");
  const parsed = updatePartyArgsSchema.parse({ targetRef: "Hero", hpDelta: -3, trackerDeltas: [{ key: "hp", delta: -3 }] });
  expect("hpDelta" in parsed).toBe(false);
  expect(parsed.trackerDeltas).toEqual([{ key: "hp", delta: -3 }]);
});

test("set_tracker writes a GAME-subject tracker by KEY, on either write arm", () => {
  expect(setTrackerArgsSchema.parse({ key: "alarm", value: 35 }).value).toBe(35);
  expect(setTrackerArgsSchema.parse({ key: "alarm", delta: -5 }).delta).toBe(-5);
  expect(setTrackerArgsSchema.parse({ key: "pack", items: ["rope"] }).items).toEqual(["rope"]);
  // Never a LABEL: the retired `set_widget_value` addressed by label, so a rename orphaned the value.
  expect(setTrackerArgsSchema.safeParse({ key: "", value: 1 }).success).toBe(false);
});

test("update_inventory carries walletDeltas (the stored wallet writer)", () => {
  const parsed = updateInventoryArgsSchema.parse({ targetRef: "Hero", walletDeltas: [{ name: "gold", delta: 25 }] });
  expect(parsed.walletDeltas).toEqual([{ name: "gold", delta: 25 }]);
});

test("update_scene's presentUpsert carries display fields only — tracked values are update_party's arm", () => {
  const parsed = updateSceneArgsSchema.parse({
    timeOfDay: "evening",
    presentUpsert: [{ name: "Elder", mood: "wary", thoughts: "he is hiding something" }],
  });
  expect(parsed.presentUpsert?.[0]?.mood).toBe("wary");
  // The unification killed the second tracked-value wire vocabulary: a cast member's tracked values are
  // written through `update_party` (targeting them by name), exactly like a party member's.
  expect(Object.keys(parsed.presentUpsert?.[0] ?? {})).not.toContain("customFields");
});

test("upsert_quest bounds action to create/update/complete/fail", () => {
  expect(upsertQuestArgsSchema.safeParse({ name: "Q", action: "complete" }).success).toBe(true);
  expect(upsertQuestArgsSchema.safeParse({ name: "Q", action: "delete" }).success).toBe(false);
});

test("EXT-4c: upsert_quest carries BOTH objective gestures — the authoring list and completeObjectives", () => {
  // The completion arm is a flat string array (matched by TEXT at apply): the xgrammar-cheapest shape that
  // says "these are done" without a nested `{text,completed}` object in the required-field blind spot.
  const parsed = upsertQuestArgsSchema.safeParse({
    name: "Reach the Vault of Ash",
    action: "update",
    objectives: ["Find the road north", "Enter the vault"],
    completeObjectives: ["Find the road north"],
  });
  expect(parsed.success).toBe(true);
  expect(parsed.success && parsed.data.completeObjectives).toEqual(["Find the road north"]);
  // Progress can be reported with NO objectives list at all — that's the whole point of the arm.
  expect(upsertQuestArgsSchema.safeParse({ name: "Q", action: "update", completeObjectives: ["step one"] }).success).toBe(true);
  // Still projection-clean (the wire tools + the extraction plane both project this schema).
  expect(() => z.toJSONSchema(upsertQuestArgsSchema)).not.toThrow();
});

// THE RELIABLE BLOCKER FIX (ruling #10, LIVE-MEASURED 2026-07-27): an 8B dropped the nested-required
// `journal[].title` in 5/8 structured extractions (xgrammar does not enforce `required` on nested array items),
// failing the WHOLE `safeParse` and silently dropping the turn's state. `title` is now OPTIONAL + derived.
test("add_journal_entry: a title-LESS entry now PARSES (the blocker fix — title is optional)", () => {
  const parsed = addJournalEntryArgsSchema.safeParse({ type: "combat", content: "The troll fell." });
  expect(parsed.success).toBe(true);
  expect(parsed.success && parsed.data.title).toBeUndefined();
});

// EXT-4b — `type` sits in the IDENTICAL nested-array blind spot `title` did, so it gets the identical
// treatment: optional at parse + healed at apply, with the projection re-requiring it for the backends that
// DO enforce nested `required` (pinned in extraction.contract). `content` deliberately stays required.
test("add_journal_entry: a type-LESS entry PARSES and heals to `note`; a content-LESS entry is refused", () => {
  const typeless = addJournalEntryArgsSchema.safeParse({ content: "The gate groaned open." });
  expect(typeless.success).toBe(true);
  expect(typeless.success && typeless.data.type).toBeUndefined();
  expect(journalTypeFor(typeless.success ? typeless.data : { content: "" })).toBe("note");
  expect(journalTypeFor({ type: "combat" })).toBe("combat"); // a stated kind is never overridden
  // A content-less entry has nothing to log (the title derives FROM the content) — it is malformed, and every
  // delivery path drops exactly that ENTRY (never the turn's other planes — EXT-4a).
  expect(addJournalEntryArgsSchema.safeParse({ type: "note", title: "a title, no body" }).success).toBe(false);
});

test("journalTitleFor: model title wins; absent → derived from the content head, capped", () => {
  // Model supplied a title — used verbatim.
  expect(journalTitleFor({ title: "Troll Fight", content: "x" })).toBe("Troll Fight");
  // Title absent — derive the first sentence of the content head.
  expect(journalTitleFor({ content: "They reached the tower. It was tall." })).toBe("They reached the tower.");
  // Title absent, single long line — capped with an ellipsis.
  const long = "a".repeat(80);
  const derived = journalTitleFor({ content: long });
  expect(derived.endsWith("…")).toBe(true);
  expect(derived.length).toBeLessThanOrEqual(61); // 60 chars + the ellipsis
  // Empty (title-less AND content-less) — "" (the caller drops it).
  expect(journalTitleFor({ content: "" })).toBe("");
});
