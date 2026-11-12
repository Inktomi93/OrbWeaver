// The library pane's view controls beside its `ListPage` search: the sort `@orb/ui/select` and the named View
// group (the flat-to-categorized toggle and bulk mode). They read and write the library view-prefs store directly.

import type { CharacterListSort } from "@orb/contracts/character";
import { CHARACTER_LIST_SORTS } from "@orb/contracts/character";
import { Icon, LayoutGrid, Pencil } from "@orb/ui/icons";
import { Section } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import { setBulkMode, setCharacterSortMode, setCharacterViewMode, useCharacterBulkMode, useCharacterSortMode, useCharacterViewMode } from "#state";
import { CHARACTER_GROUP_BY_TAG_NAME, CHARACTER_SELECT_MULTIPLE_NAME, CHARACTER_SORT_NAME } from "../lib/character-names.ts";

/** The §4.5 sort labels — a TOTAL Record over `CHARACTER_LIST_SORTS` (a new sort member fails `tsc`;
 *  Spine-TypeScript-and-Patterns §7.5). The `random`/`name-desc` drops never appear because the tuple is the one home. */
const SORT_LABELS: Record<CharacterListSort, string> = {
  recent: "Recent",
  alpha: "A–Z",
  starred: "Starred first",
  newest: "Newest",
  oldest: "Oldest",
  mostChats: "Most chats",
  fewestChats: "Fewest chats",
  largestCards: "Largest cards",
  smallestCards: "Smallest cards",
  // The refinery signal (`characters.refinery.score`) — unscored cards sort LAST both ways, so the labels
  // say "scoring", not "score", and never imply an unscored card is a bad one.
  bestScore: "Best scoring",
  worstScore: "Worst scoring",
};

const SORT_ITEMS = CHARACTER_LIST_SORTS.map((sort) => ({ label: SORT_LABELS[sort], value: sort }));

/** The sort field on the search row. Content-sized, so the search, the row's primary control, keeps the rest. */
export function CharacterSortSelect(): ReactElement {
  const sortMode = useCharacterSortMode();
  return (
    <Select
      aria-label={CHARACTER_SORT_NAME}
      // `hug` keeps the field chrome at its value's width: a full-width trigger would crush the search box.
      layout="hug"
      items={SORT_ITEMS}
      onValueChange={(value): void => {
        if (value !== null) {
          setCharacterSortMode(value);
        }
      }}
      value={sortMode}
    />
  );
}

/** The commands that redraw the pane, on their own named line: `ink="foreground"` is the command register that
 *  separates a control you operate from the filter vocabulary you skim. */
export function CharacterViewGroup(): ReactElement {
  const viewMode = useCharacterViewMode();
  const bulkMode = useCharacterBulkMode();
  return (
    <Section aria-label="View" kicker="View" kickerLayout="inline" role="group">
      <Toggle
        aria-label={CHARACTER_GROUP_BY_TAG_NAME}
        ink="foreground"
        onPressedChange={(pressed): void => setCharacterViewMode(pressed ? "categorized" : "flat")}
        pressed={viewMode === "categorized"}
        size="sm"
      >
        <Icon icon={LayoutGrid} size="sm" />
        Group
      </Toggle>
      {/* It carries its word: beside the text toggle "Group", a bare pencil read as one phrase. */}
      <Toggle
        aria-label={CHARACTER_SELECT_MULTIPLE_NAME}
        ink="foreground"
        onPressedChange={(pressed): void => setBulkMode(pressed)}
        pressed={bulkMode}
        size="sm"
      >
        <Icon icon={Pencil} size="sm" />
        Select
      </Toggle>
    </Section>
  );
}
