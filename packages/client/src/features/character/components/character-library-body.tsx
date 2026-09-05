// The library pane's BODY ladder: loading → error → empty → no-matches → the flat virtual list OR the
// categorized grouped list. Split out of `character-library-surface.tsx` (the `component-size` cap): the
// surface owns the reads and the lens, this owns what the pane shows once they have answered.
//
// THE EMPTIES ARE DIFFERENT CLAIMS, and the server-side predicates let each be honest: an empty page means
// "nothing in the whole library matches", so the search arm no longer hedges and the chip arm's old "load
// more to keep looking" affordance is gone — there is nothing further to load, and offering it would be a
// dead end pretending to be a next step.
//
// …AND NONE OF THEM MINTS A DOOR THE BAND ALREADY CARRIES (#532). Each empty arm offers the exit its own
// CAUSE needs — Clear search / Clear filters are this body's alone — but the EMPTY-LIBRARY arm's exit is
// creating a character, which the list band above this pane already provides. It points at that one instead
// of duplicating it; see the arm's own note.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Search, Users } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement, ReactNode } from "react";
import type { CollectionSurface } from "#data";
import { QueryErrorState, SkeletonRows } from "#data";
import { clearCharacterFilters } from "#state";
import type { TagGroupCensus } from "../lib/character-list-view.ts";
import { groupByTag } from "../lib/character-list-view.ts";
import type { CharacterCardItem } from "./character-card.tsx";
import { CharacterCategorizedList } from "./character-categorized-list.tsx";

const ESTIMATED_ROW_PX = 80;
const SKELETON_ROW_COUNT = 6;

export interface CharacterLibraryBodyProps {
  readonly ariaLabel: string;
  readonly query: string;
  /** Any chip narrowing the SERVER read (favorites / tag include-exclude). Archived is deliberately not one:
   *  its OFF state is the resting library, so an empty library is not "the Archived toggle did this". Nor is
   *  a tag entry dropped as unknown: it reaches no request, so blaming an empty library on it — and
   *  offering "Clear filters" as the way out — would be a claim the pane has no standing to make. */
  readonly filtersActive: boolean;
  readonly categorized: boolean;
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly filtered: readonly CharacterCardItem[];
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** The TAIL-FETCH half of `CollectionSurface["listProps"]`, and only that half. `getItemKey` is
   *  deliberately not taken: it is typed over the collection's own row (the server summary), which is
   *  WIDER than the `CharacterCardItem` this body renders, so importing the whole slot would flip the
   *  callback's variance and fail to assign. The list keys by `item.id` below, which is the same key. */
  readonly listProps: Pick<CollectionSurface<CharacterCardItem>["listProps"], "endApproachRows" | "onEndApproach">;
  /** "30 of 327 loaded" — the loaded-vs-census progress line, `null` once the whole matched set is in
   *  (#493). It renders at the FOOT of the list, beside the tail-fetch sentinel: that is where "how much of
   *  it have I got" is the question, and it is the number the pane's top status line had to stop printing
   *  because at rest it read as a result count (`character-library-lens.ts`'s own note). */
  readonly loadedProgress: string | null;
  /** The GROUP-BY-TAG census (#1696) — the buckets and their LIBRARY sizes under the current lens, or `null`
   *  while `character.listTagGroups` is in flight. Only the categorized arm reads it, and only that arm's
   *  hook asks for it. */
  readonly tagGroups: TagGroupCensus | null;
  readonly onClearSearch: () => void;
  readonly onRetry: () => void;
  readonly renderRow: (item: CharacterCardItem) => ReactNode;
}

export function CharacterLibraryBody({
  ariaLabel,
  query,
  filtersActive,
  categorized,
  isPending,
  error,
  filtered,
  hasNextPage,
  isFetchingNextPage,
  listProps,
  loadedProgress,
  tagGroups,
  onClearSearch,
  onRetry,
  renderRow,
}: CharacterLibraryBodyProps): ReactElement {
  if (isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} />;
  }
  if (error !== null) {
    return <QueryErrorState label="the character library" onRetry={onRetry} />;
  }
  if (filtered.length === 0) {
    if (query !== "") {
      // BOTH CAUSES, BOTH EXITS (side-eye 2026-08-17 P2 — se-chars-combined.json). With a tag chip on AND a
      // no-match search, this arm named only the search and offered only "Clear search" — so a user who
      // cleared it landed in a still-empty library with a filter nobody had mentioned, and the pane had
      // already spent its one explanation. A claim that names one of two causes is a wrong claim, not a
      // short one.
      return (
        <EmptyState
          action={
            <Row gap="field">
              <Button intent="secondary" onClick={onClearSearch} size="sm">
                Clear search
              </Button>
              {filtersActive ? (
                <Button intent="secondary" onClick={clearCharacterFilters} size="sm">
                  Clear filters
                </Button>
              ) : null}
            </Row>
          }
          description={filtersActive ? `No character matches "${query}" with the current filters.` : `No character matches "${query}".`}
          icon={<Icon icon={Search} size="lg" />}
          title="No matches"
        />
      );
    }
    if (filtersActive) {
      return (
        <EmptyState
          action={
            <Button intent="secondary" onClick={clearCharacterFilters} size="sm">
              Clear filters
            </Button>
          }
          description="No character in your library matches the current filters."
          icon={<Icon icon={Users} size="lg" />}
          title="No matches"
        />
      );
    }
    // #532 — ONE New DOOR ON THE PLANE, and the #520 mechanism applied where it needs no condition at all.
    // This empty state used to mint its own New, which put a THIRD New on the Characters plane beside the
    // LIST band's (the hero in the CONTENT pane was the second, closed by #520). The band is not a
    // sometimes-thing here the way it is for the hero: this body renders INSIDE the list panel, and
    // `PanelChrome` renders the `.shell-panel-header` band with every panel that has a body (D66 A1) — so
    // whenever this state is on screen, the band's New is directly above it. There is no arm in which the
    // hero's `useSectionListMode` gate would resolve differently, so the copy-pointer arm is unconditional.
    //
    // THE TEACHING IS NOT THINNED (empty states are load-bearing): the original invitation survives verbatim
    // and the pointer is ADDED to it, naming the band's primary by its visible label (WCAG 2.5.3 — a
    // voice-control user says what is written), so this is a de-duplicated door, never a dead end.
    return (
      <EmptyState
        description="Weave your first one to begin — use New at the top of this pane."
        icon={<Icon icon={Users} size="lg" />}
        title="No characters yet"
      />
    );
  }
  if (categorized) {
    return (
      <CharacterCategorizedList
        groups={groupByTag(filtered, tagGroups)}
        hasNextPage={hasNextPage}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={listProps.onEndApproach}
        renderRow={renderRow}
      />
    );
  }
  return (
    // THE STACK IS LAYOUT, NOT A LIST (side-eye 2026-08-18 P1-1). It used to carry `role="list"` +
    // `aria-label` around a `<VirtualList>` that emits its OWN `role="list"` with `listitem` descendants — so
    // the pane announced "list, 1 item" (the inner list) and then "list, 11 items", and the outer container
    // failed `aria-required-children` on both axe and Lighthouse's agentic audit (agent-nav 50/100). The
    // label belongs on the element that actually holds the items.
    <Stack className="h-full min-h-0">
      <VirtualList
        aria-label={ariaLabel}
        className="min-h-0 flex-1"
        endApproachRows={listProps.endApproachRows}
        estimateSize={(): number => ESTIMATED_ROW_PX}
        gapToken="row"
        getItemKey={(item): string => item.id}
        items={filtered}
        onEndApproach={listProps.onEndApproach}
        renderItem={renderRow}
      />
      {/* THE PROGRESS LINE, AT THE FOOT (#493). `aria-hidden`: the pane's `role="status"` line already
          speaks the count that MATCHED, and a second live number under an infinite scroller would announce
          itself on every page the tail-fetch pulls. This one is for the eye — it is the answer to "is the
          list still growing under me", which the top line was being read as and could not honestly be. */}
      {loadedProgress === null ? null : (
        <Text aria-hidden={true} className="shrink-0 self-center" voice="gloss">
          {loadedProgress}
        </Text>
      )}
    </Stack>
  );
}
