import { characterListLens } from "../../../../../packages/server/src/domain/character/substrate/list-lens.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("scope normalization retains explicit booleans and removes empty search/tag axes", () => {
  expect(characterListLens({ search: "  RPG  ", archived: false, starred: false, includeTagIds: [], excludeTagIds: [] })).toEqual({
    search: "rpg",
    archived: false,
    starred: false,
  });
  expect(characterListLens({ search: "   " })).toEqual({});
  expect(characterListLens({ archived: true, starred: true })).toEqual({ archived: true, starred: true });
});
