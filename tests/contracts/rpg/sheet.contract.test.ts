// @orb/contracts/rpg/sheet — the per-actor identity sheet (§4.3). Pins: attributes is an open int record
// (a missing profile key is treated as absent by the reader), poolDefs/maxHp shapes, and defaults.

import { rpgSheetSchema } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("an empty sheet parses to the born-default (no attributes, null maxHp)", () => {
  const sheet = rpgSheetSchema.parse({ maxHp: null });
  expect(sheet.className).toBe("");
  expect(sheet.attributes).toEqual({});
  expect(sheet.poolDefs).toEqual([]);
  expect(sheet.maxHp).toBeNull();
});

test("attributes is an int record over the profile vocabulary", () => {
  const sheet = rpgSheetSchema.parse({ maxHp: 30, attributes: { str: 14, dex: 12 } });
  expect(sheet.attributes).toEqual({ str: 14, dex: 12 });
  expect(rpgSheetSchema.safeParse({ maxHp: null, attributes: { str: 1.5 } }).success).toBe(false);
});

test("poolDefs require a positive max", () => {
  expect(rpgSheetSchema.safeParse({ maxHp: null, poolDefs: [{ name: "mana", max: 0 }] }).success).toBe(false);
  expect(rpgSheetSchema.safeParse({ maxHp: null, poolDefs: [{ name: "mana", max: 10 }] }).success).toBe(true);
});
