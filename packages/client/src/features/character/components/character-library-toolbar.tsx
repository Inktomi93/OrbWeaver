// The library pane's VIEW controls: a persistent search input (a returning user just starts typing —
// rule 6), the nine-sort `@orb/ui/select`, the flat⇄categorized view toggle, and the §4.6 bulk-mode pencil.
// Reads/writes the library view-prefs store directly (a feature component may read its own store); search
// stays a controlled value owned by the surface (it feeds `useDeferredValue`).
//
// The micro-caps "CHARACTERS" title + the create/import picker are NOT here any more: they moved into the
// LIST chrome band (`characters-list-header.tsx`, D66 A1/A2 — the north-star N2 migration the other
// sections had already made).
//
// TWO LINES, TWO REGISTERS (program #102, the owner-picked variant B of the characters density pass): the
// FIELDS you type into, then a NAMED group of the commands that redraw the pane. The filter vocabulary is
// the third register and lives one component down (`character-filter-chips.tsx`). Before this, all twelve
// controls between the search box and the first character rendered one pixel-identical treatment.

import type { CharacterListSort } from "@orb/contracts/character";
import { CHARACTER_LIST_SORTS } from "@orb/contracts/character";
import { Icon, LayoutGrid, Pencil } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
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
  // The refinery signal (`characters.refinery.score`) — unscored cards sort LAST both ways, so the labels
  // say "scoring", not "score", and never imply an unscored card is a bad one.
  bestScore: "Best scoring",
  worstScore: "Worst scoring",
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
      {/* THE FIELD ROW — search + sort, and NOTHING ELSE (program #102 variant B). The two view commands
          used to wrap beneath them out of this same row; they sit on their own NAMED line below now, which
          is a stronger form of the same fix.
          THE COMMANDS DO NOT COME BACK UP HERE, and that is a ruling, not a preference. Four controls in
          one row is a 320px pane's whole width: measured, the search box came out 95px against the 119px
          its own placeholder needs and rendered "Search chai" (side-eye P2) — and the B mockup re-tried it
          as glyph buttons and re-opened the same wrap. The search keeps its floor; it is the row's PRIMARY
          control. The commands never needed relocating, they needed NAMING. */}
      <Row align="center" className="flex-wrap" gap="field">
        <Input aria-label="Search characters" className="min-w-40 flex-1" onValueChange={onQueryChange} placeholder="Search characters…" value={query} />
        {/* `w-auto` beats the trigger's own `w-full` (FIELD_CONTROL): as a flex sibling of a `flex-1` Input a
            100%-wide trigger claims the whole row and crushes the search box to its ~26px minimum (stickler
            2026-08-01 F1 — measured 298.5px trigger vs a 26px input). Content-sized, the sort takes only its
            selected label and the search — the row's PRIMARY control — grows into everything left. */}
        <Select
          aria-label="Sort characters"
          // @orb-waive ui-size-via-variant(w-auto): content-width Select leaves the row slack to its filter; auto overrides the standard w-full deterministically.
          className="w-auto"
          items={SORT_ITEMS}
          onValueChange={(value): void => {
            if (value !== null) {
              setCharacterSortMode(value);
            }
          }}
          value={sortMode}
        />
      </Row>
      {/* THE VIEW GROUP (program #102 variant B — the CD1 grouping, spelled inline). These two REDRAW the
          pane: one re-folds the list, one re-modes it into a selection surface. They used to render in the
          identical muted 13px/500 box as the tag words below them, so the whole block read as one
          undifferentiated soup — the accessibility tree already carried the grouping (`role="group"`), and
          only the pixels did not. `intent="command"` is the foreground register that separates a control
          you operate from the vocabulary you skim. */}
      <Section aria-label="View" kicker="View" kickerLayout="inline" role="group">
        <Toggle
          aria-label="Group by tag"
          intent="command"
          onPressedChange={(pressed): void => setCharacterViewMode(pressed ? "categorized" : "flat")}
          pressed={viewMode === "categorized"}
          size="sm"
        >
          <Icon icon={LayoutGrid} size="sm" />
          Group
        </Toggle>
        {/* Bulk mode joins the view controls now that the band owns the title row it used to sit in.
            IT CARRIES ITS WORD (side-eye leg-4 P3): beside the text toggle "Group", a bare pencil read as
            one phrase — "Group ✎" — which decodes as neither control. Two labelled toggles read as two. */}
        <Toggle aria-label="Select multiple" intent="command" onPressedChange={(pressed): void => setBulkMode(pressed)} pressed={bulkMode} size="sm">
          <Icon icon={Pencil} size="sm" />
          Select
        </Toggle>
      </Section>
    </Stack>
  );
}
