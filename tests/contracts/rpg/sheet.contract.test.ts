// @orb/contracts/rpg/sheet — the per-actor identity sheet (§4.3). Pins: attributes is an open int record
// (a missing profile key is treated as absent by the reader), the maxHp shape, the per-actor TRACKER
// EXCEPTIONS (grants/revokes — the only tracker data a sheet carries since the unification), and defaults.

import { rpgSheetSchema } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("an empty sheet parses to the born-default (no attributes, null maxHp)", () => {
  const sheet = rpgSheetSchema.parse({ maxHp: null });
  expect(sheet.className).toBe("");
  expect(sheet.attributes).toEqual({});
  expect(sheet.maxHp).toBeNull();
  expect(sheet.trackerGrants).toEqual([]);
  expect(sheet.trackerRevokes).toEqual([]);
});

test("attributes is an int record over the profile vocabulary", () => {
  const sheet = rpgSheetSchema.parse({ maxHp: 30, attributes: { str: 14, dex: 12 } });
  expect(sheet.attributes).toEqual({ str: 14, dex: 12 });
  expect(rpgSheetSchema.safeParse({ maxHp: null, attributes: { str: 1.5 } }).success).toBe(false);
});

test("the sheet carries tracker EXCEPTIONS by key, never tracker DEFS", () => {
  const sheet = rpgSheetSchema.parse({ maxHp: null, trackerGrants: ["bound_will"], trackerRevokes: ["mana"] });
  expect(sheet.trackerGrants).toEqual(["bound_will"]);
  expect(sheet.trackerRevokes).toEqual(["mana"]);
  // Defs home ONCE in `config.trackers` — an old-shape pool def on the sheet is simply not a field here.
  expect("poolDefs" in sheet).toBe(false);
  expect(rpgSheetSchema.safeParse({ maxHp: null, trackerGrants: [""] }).success).toBe(false);
});
