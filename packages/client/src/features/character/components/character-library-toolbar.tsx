// The library pane's VIEW controls: a persistent search input (a returning user just starts typing —
// rule 6), the nine-sort `@orb/ui/select`, the flat⇄categorized view toggle, and the §4.6 bulk-mode pencil.
// Reads/writes the library view-prefs store directly (a feature component may read its own store); search
// stays a controlled value owned by the surface (it feeds `useDeferredValue`).
//
// The micro-caps "CHARACTERS" title + the create/import picker are NOT here any more: they moved into the
// LIST chrome band (`characters-list-header.tsx`, D66 A1/A2 — the north-star N2 migration the other
// sections had already made).

import type { CharacterListSort } from "@orb/contracts/character";
import { CHARACTER_LIST_SORTS } from "@orb/contracts/character";
import { Icon, Pencil } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import { setBulkMode, setCharacterSortMode, setCharacterViewMode, useCharacterBulkMode, useCharacterSortMode, useCharacterViewMode } from "#state";

/** The §4.5 sort labels — a TOTAL Record over `CHARACTER_LIST_SORTS` (a new sort member fails `tsc`;
 *  Spine §5.5). The `random`/`name-desc` drops never appear because the tuple is the one home. */
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
};

const SORT_ITEMS = CHARACTER_LIST_SORTS.map((sort) => ({ label: SORT_LABELS[sort], value: sort }));

export interface CharacterLibraryToolbarProps {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
}

/** The header + sort/view controls row. */
export function CharacterLibraryToolbar({ query, onQueryChange }: CharacterLibraryToolbarProps): ReactElement {
  const sortMode = useCharacterSortMode();
  const viewMode = useCharacterViewMode();
  const bulkMode = useCharacterBulkMode();
  return (
    <Stack gap="field">
      {/* The title + create MOVED to the LIST chrome band (`characters-list-header.tsx`, D66 A1/A2 — the
          A1/N2 gap this section was the last to carry). What stays is the pane's own view machinery. */}
      {/* WRAPS AT THE NARROWEST MOUNT (side-eye P2). Four controls in one row is a 320px pane's whole
          width: measured, the search box came out 95px against the 119px its own placeholder needs and
          rendered "Search chai". The search is the row's PRIMARY control, so it carries a real floor and
          the three view controls wrap beneath it instead — no viewport query, no second layout: the row
          simply reflows when the pane cannot seat it. */}
      <Row align="center" className="flex-wrap" gap="field">
        <Input aria-label="Search characters" className="min-w-40 flex-1" onValueChange={onQueryChange} placeholder="Search characters…" value={query} />
        {/* `w-auto` beats the trigger's own `w-full` (FIELD_CONTROL): as a flex sibling of a `flex-1` Input a
            100%-wide trigger claims the whole row and crushes the search box to its ~26px minimum (stickler
            2026-08-01 F1 — measured 298.5px trigger vs a 26px input). Content-sized, the sort takes only its
            selected label and the search — the row's PRIMARY control — grows into everything left. */}
        <Select
          aria-label="Sort characters"
          className="w-auto"
          items={SORT_ITEMS}
          onValueChange={(value): void => {
            if (value !== null) {
              setCharacterSortMode(value);
            }
          }}
          value={sortMode}
        />
        <Toggle
          aria-label="Group by tag"
          onPressedChange={(pressed): void => setCharacterViewMode(pressed ? "categorized" : "flat")}
          pressed={viewMode === "categorized"}
          size="sm"
        >
          Group
        </Toggle>
        {/* Bulk mode joins the view controls now that the band owns the title row it used to sit in. */}
        <Toggle aria-label="Select multiple" onPressedChange={(pressed): void => setBulkMode(pressed)} pressed={bulkMode} size="sm">
          <Icon icon={Pencil} size="sm" />
        </Toggle>
      </Row>
    </Stack>
  );
}
