// lib/label-suggestion-groups — the inbox grouping decisions: seed tags dropped, near-duplicates merged.

import type { TagSuggestionView } from "@orb/contracts/tag";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { groupSuggestions } from "#client/features/tag/lib/label-suggestion-groups.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function suggestion(name: string, characterName: string): TagSuggestionView {
  return {
    id: mintTypeId(ID_PREFIX.tag) satisfies TagId,
    name,
    color: null,
    color2: null,
    source: "auto",
    folderType: "NONE",
    sortOrder: null,
    isHiddenOnCard: false,
    characterId: mintTypeId(ID_PREFIX.character) satisfies CharacterId,
    characterName,
  };
}

test("internal seed tags never reach the inbox, whatever their casing", () => {
  const groups = groupSuggestions([suggestion("assistant", "A"), suggestion("Default", "B"), suggestion("utility", "C"), suggestion("noir", "D")]);
  expect(groups.map((group) => group.name)).toEqual(["noir"]);
});

test("near-duplicate spellings merge into one group keyed by the most frequent spelling", () => {
  const groups = groupSuggestions([
    suggestion("Slice of Life", "A"),
    suggestion("slice-of-life", "B"),
    suggestion("slice-of-life", "C"),
    suggestion("noir", "D"),
  ]);
  expect(groups.map((group) => [group.name, group.rows.length])).toEqual([
    ["slice-of-life", 3],
    ["noir", 1],
  ]);
});
