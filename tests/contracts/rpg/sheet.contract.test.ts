// @orb/contracts/rpg/sheet — the per-actor identity sheet (§4.3). Pins: attributes is an open int record
// (a missing profile key is treated as absent by the reader), the per-actor TRACKER EXCEPTIONS
// (grants/revokes — the only tracker data a sheet carries since the unification), the defaults, and (R3) that
// `maxHp` is GONE: it was one half of a dual-max home with no reconciler anywhere, which is exactly the drift
// class the tracked-field unification killed for pools, surviving on the one exempt field.

import { rpgSheetSchema } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("an empty sheet parses to the born-default", () => {
  const sheet = rpgSheetSchema.parse({});
  expect(sheet.className).toBe("");
  expect(sheet.attributes).toEqual({});
  expect(sheet.trackerGrants).toEqual([]);
  expect(sheet.trackerRevokes).toEqual([]);
});

test("the sheet carries NO health dial (R3) — a meter's ceiling has ONE home, on the tracker value", () => {
  expect(Object.keys(rpgSheetSchema.shape)).not.toContain("maxHp");
});

test("attributes is an int record over the profile vocabulary", () => {
  const sheet = rpgSheetSchema.parse({ attributes: { str: 14, dex: 12 } });
  expect(sheet.attributes).toEqual({ str: 14, dex: 12 });
  expect(rpgSheetSchema.safeParse({ attributes: { str: 1.5 } }).success).toBe(false);
});

test("the sheet carries tracker EXCEPTIONS by key, never tracker DEFS", () => {
  const sheet = rpgSheetSchema.parse({ trackerGrants: ["bound_will"], trackerRevokes: ["mana"] });
  expect(sheet.trackerGrants).toEqual(["bound_will"]);
  expect(sheet.trackerRevokes).toEqual(["mana"]);
  // Defs home ONCE in `config.trackers` — an old-shape pool def on the sheet is simply not a field here.
  expect("poolDefs" in sheet).toBe(false);
  expect(rpgSheetSchema.safeParse({ trackerGrants: [""] }).success).toBe(false);
});
