import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { characterListLens } from "#server/domain/character/substrate/list-lens.ts";

test("scope normalization retains explicit booleans and removes empty search/tag axes", () => {
  expect(characterListLens({ search: "  RPG  ", archived: false, starred: false, includeTagIds: [], excludeTagIds: [] })).toEqual({
    search: "rpg",
    archived: false,
    starred: false,
  });
  expect(characterListLens({ search: "   " })).toEqual({});
  expect(characterListLens({ archived: true, starred: true })).toEqual({ archived: true, starred: true });
});
