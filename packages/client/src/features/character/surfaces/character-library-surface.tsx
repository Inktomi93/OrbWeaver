// The character library surface — the Characters list. `createCollectionSurface` over `character.list`
// (keyset-paged) with header/search, sort, filter chips, favorites strip, flat/categorized view, and bulk
// mode. The Chat CTA resumes the most-recent chat with a character or starts a new one.
//
// EVERY LENS IS THE SERVER'S (owner ruling 2026-08-13: "if i search then it should not just search on
// virtual stuff yeah? same for sort etc"; the `chat-list-surface` precedent, 2026-08-09). Search, the
// Favorites/Archived toggles and the three-state tag chips ride as query INPUT — so they are part of the
// key, and changing one resets the pages instead of filtering a stale window. What that fixed:
//   • The window was ≤150 rows (`maxPages: 5` × 30) with `getPreviousPageParam: () => undefined`, so a deep
//     scroll EVICTED the head pages unrecoverably and every predicate ran over whatever survived. The cap is
//     gone: pages accumulate, the DOM stays bounded by `<VirtualList>`, and nothing vanishes from the top.
//   • "No matches" is now a claim this surface has standing to make — the whole library was searched.
//   • The counts print the server's `totalCount`, not "loaded so far".
//
// THE TAG LIBRARY IS ALSO THE FILTER'S REFERENTIAL AUTHORITY (D138).
// `orb:character-library` persists raw `TagId`s that outlive the rows they name — a deleted tag, or a whole
// previous dev era's db. Because the server's tag predicate is AND on both arms, ONE such include-id matches
// zero rows and empties the entire library, invisibly and across every reload: the owner's import repro, whose
// only cure was wiping localStorage. So an entry the tag library does not know is dropped from the REQUEST
// (`effectiveTagFilter`) while staying in the store, where the chip row renders it clearable — visible + inert.
//
// THE PANE NO LONGER SWAPS, SO THE BROWSE POSITION IS NOT AT RISK (#501, owner ruling 2026-08-22 —
// "library stays docked"; it supersedes the earlier list-pane design RECOMMENDATION, which was never an
// owner-ruled entry). Opening somebody USED to swap this
// whole LIST pane to her chats projection, unmounting this surface — the paged rows survived in the query
// cache but the virtual list's scroll offset did not, so #255 captured the offset at the click and re-applied
// it at mount. Nothing unmounts on a selection now: the library keeps its window, its scroll and the focused
// row for free, and the two seams that stood in for them (`characterBrowseOffset`, `useRestoreRowFocus`) are
// deleted rather than left standing beside a swap that no longer happens.
//
// The two reads that deliberately do NOT ride the lens: the FAVORITES strip (its own `starred: true` page —
// it is a shortcut across the library, not a view of the filtered set, and reading the filtered page would
// empty it the moment you typed) and the TAG VOCABULARY (`tag.listTagFilterVocabulary` — the chips must offer
// tags the loaded rows don't happen to carry, and an ACTIVE filter has to render its chip even when its tag
// matches nothing at all: a filter you cannot see is a filter you cannot turn off).

import type { CharacterListSort } from "@orb/contracts/character";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack, Surface } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { FaceStrip } from "#components";
import type { Trpc } from "#data";
import { createCollectionSurface, useInvalidation, useStartChat, useTRPC } from "#data";
import { useDebouncedValue, useFocusOnMount } from "#lib";
import {
  clearCharacterFilters,
  clearCharacterSelection,
  cycleTagFilter,
  resumeChat,
  selectCharacter,
  setActiveSection,
  setCharacterSearch,
  toggleFavoritesOnly,
  toggleFiltersOpen,
  toggleShowArchived,
  useCharacterBulkMode,
  useCharacterSearch,
  useCharacterSortMode,
  useCharacterViewMode,
  useFavoritesOnly,
  useFiltersOpen,
  useSelectedCharacterId,
  useShowArchived,
  useTagFilter,
} from "#state";
import { CharacterBulkBar } from "../components/character-bulk-bar.tsx";
import type { CharacterCardItem } from "../components/character-card.tsx";
import { CharacterCardTile } from "../components/character-card.tsx";
import { CharacterFilterChips } from "../components/character-filter-chips.tsx";
import { CharacterLibraryBody } from "../components/character-library-body.tsx";
import { CharacterLibraryToolbar } from "../components/character-library-toolbar.tsx";
import { useDuplicateCharacter, useRemoveCharacter } from "../hooks/use-character-context-mutations.ts";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { useCharacterTagGroups } from "../hooks/use-character-tag-groups.ts";
import type { LibraryScopeArgs } from "../hooks/use-library-scope.ts";
import { useLibraryScope } from "../hooks/use-library-scope.ts";
import { CHARACTER_SEARCH_DEBOUNCE_MS, loadedProgressLabel, resultCountLabel } from "../lib/character-library-lens.ts";

/** How many favorites the strip reads. Its own bounded page, UNFILTERED by the pane's lenses. */
const FAVORITES_STRIP_LIMIT = 24;

type CharacterListPage = inferOutput<Trpc["character"]["list"]>;
type CharacterLibraryItem = CharacterListPage["items"][number];

/** The pane's whole read, as query INPUT. Every field is part of the query key. The NARROWING half is
 *  `scope`, resolved by `useLibraryScope` — the same object the LIST band spreads into its census, which is
 *  what stops the two regions from answering about different scopes (#518). */
interface CharacterLibraryParams {
  readonly sort: CharacterListSort;
  readonly pageSize: number;
  readonly scope: LibraryScopeArgs;
}

// ⑪ — `pageSize` is a PARAM the consumer supplies (from `UserSettings.library.pageSize`), never a
// factory-internal settings read (tier direction: the collection-surface factory takes it as data).
//
// NO `maxPages`. It used to be 5, with `getPreviousPageParam: () => undefined` — so past 150 rows TanStack
// evicted the HEAD page and nothing could ever fetch it back: rows disappeared off the top of the owner's
// library as he scrolled (the 2026-08-13 dogfood P1). Windowing a virtualized list buys nothing here — the
// DOM cost is already bounded by `<VirtualList>`, and the rows are light summaries.
const useCharacterLibraryCollection = createCollectionSurface({
  query: (trpc: Trpc, params: CharacterLibraryParams) =>
    trpc.character.list.infiniteQueryOptions(
      {
        limit: params.pageSize,
        sort: params.sort,
        ...params.scope,
      },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        getPreviousPageParam: () => undefined,
      },
    ),
  itemsOf: (page: CharacterListPage) => page.items,
  idOf: (item: CharacterLibraryItem) => item.id,
  totalOf: (page: CharacterListPage) => page.totalCount,
});

export interface CharacterLibrarySurfaceProps {
  readonly ariaLabel?: string;
}

/** The character library: header + favorites + filters + the flat/categorized paged list + bulk mode. */
export function CharacterLibrarySurface({ ariaLabel = "Character library" }: CharacterLibrarySurfaceProps = {}): ReactElement {
  const trpc = useTRPC();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { startChat } = useStartChat();
  const invalidation = useInvalidation();
  // THE SEARCH TEXT IS STORE STATE, NOT `useState` (#518, the #490 mechanism one section over): the LIST
  // chrome band prints the census, it is a sibling shell region with no shared React ancestor, and a census
  // that ignores the search box directly above the rows is not a fact about anything the reader can see.
  const query = useCharacterSearch();
  // DEBOUNCED, not deferred: deferring picks a render, and every distinct string here is a round trip now
  // that the predicate is the server's (the chats pane's ruling, `chat-list-surface.tsx`). The band damps
  // the same raw value with the same constant, so the number and the rows settle together.
  const settledQuery = useDebouncedValue(query.trim(), CHARACTER_SEARCH_DEBOUNCE_MS);
  const sortMode = useCharacterSortMode();
  const viewMode = useCharacterViewMode();
  const favoritesOnly = useFavoritesOnly();
  const showArchived = useShowArchived();
  const tagFilter = useTagFilter();
  const filtersOpen = useFiltersOpen();
  const bulkMode = useCharacterBulkMode();
  // ⑪ — the user's library page size (cache-first; the settings read is already loaded app-wide). Until it
  // resolves, fall back to the schema default so the first page fetches at the same size as pre-wire.
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const pageSize = settingsQuery.data?.config.library.pageSize ?? DEFAULT_USER_SETTINGS.library.pageSize;
  // WHAT THE LIBRARY IS A WINDOW INTO — the search, the scope pills, the three-state chips (referentially
  // checked), the chip vocabulary and the deferred lens, resolved ONCE at a seam the LIST band shares
  // (#518, `use-library-scope.ts`). It used to be resolved here, which is why the band could not answer the
  // lens at all: the band is a sibling shell region and cannot see this pane's props.
  const scope = useLibraryScope();
  // The GROUP-BY-TAG census (#1696) — asked for ONLY in the mode that renders it, over the scope resolved
  // one line up, so the buckets and the rows can never be answers about different libraries.
  const tagGroups = useCharacterTagGroups(viewMode === "categorized");
  const collection = useCharacterLibraryCollection({ trpc }, { sort: sortMode, pageSize, scope: scope.args });
  const selectedId = useSelectedCharacterId();
  const update = useUpdateCharacter({ trpc, invalidation });
  const duplicate = useDuplicateCharacter({ trpc, invalidation });
  const remove = useRemoveCharacter({ trpc, invalidation });

  // THE RESUME TARGET IS ON THE ROW (#1662). It used to be a client fold: a `listChats` page of 100 rooms,
  // read on every library mount, reverse-indexed into `characterId -> chatId` (`resumeTargets`, retired in
  // the same change) — so a character outside that window silently fell through to "start a new chat" from
  // a CTA that said resume. `CharacterSummary.lastChatId` is the SAME total order (recency -> updatedAt ->
  // id, #1503) computed over her WHOLE library by the read that already selects her, so the door costs no
  // request at all and cannot go stale against the stamp beside it.

  // The rows are the SERVER's answer whole — no client pass. The only thing left to derive is the view fold.
  const items: readonly CharacterCardItem[] = collection.items;
  // The strip's own read: the caller's starred characters, independent of the pane's current FILTER lens (a
  // shortcut must not vanish because you typed in the search box) — but NOT independent of the archived
  // axis (#1503). Archiving is not a filter, it is putting a character away, and a strip that kept offering
  // a one-click shortcut to someone the library below had just hidden made the archive read as a no-op.
  // The axis is lifted off the one resolved scope, never re-derived from the store.
  const archivedAxis = scope.args.archived === undefined ? {} : { archived: scope.args.archived };
  const favoritesQuery = useQuery(trpc.character.list.queryOptions({ starred: true, limit: FAVORITES_STRIP_LIMIT, ...archivedAxis }));
  const favorites = favoritesQuery.data?.items ?? [];

  // A pick (a card click / a favorites face) is now JUST the selection write (#501): this surface stays
  // mounted beside the editor it opens, so there is no pane swap to arbitrate focus with and no browse
  // position to rescue — the row the user pressed keeps the focus the browser gave it, and the virtual
  // list keeps its own scroll.
  const openEditor = (id: string): void => selectCharacter(castId<CharacterId>(id));
  const toggleStar = (id: string, next: boolean): void => update.mutate({ characterId: castId<CharacterId>(id), input: { starred: next } });
  const toggleArchive = (id: string, next: boolean): void => update.mutate({ characterId: castId<CharacterId>(id), input: { archived: next } });
  const toggleBulk = (id: string): void => collection.selection.toggle(id);
  const duplicateCharacter = (id: string): void => {
    void duplicate
      .mutateAsync({ characterId: castId<CharacterId>(id) })
      .then((created) => selectCharacter(created.id))
      .catch(() => undefined);
  };
  const deleteCharacter = (id: string): void => {
    const characterId = castId<CharacterId>(id);
    void remove
      .mutateAsync({ characterId })
      .then(() => {
        if (selectedId === characterId) {
          clearCharacterSelection();
        }
      })
      .catch(() => undefined);
  };
  const chatWith = (id: string): void => {
    const characterId = castId<CharacterId>(id);
    // `collection.items`, not the `items` alias below it: that alias is widened to the CARD's structural
    // subset (`CharacterCardItem`), which deliberately does not carry the resume target.
    const target = collection.items.find((item) => item.id === id)?.lastChatId ?? null;
    if (target === null) {
      // A real `chat.startChat` through the ONE shared creation seam (`#data`), which enters the room
      // itself; the section switch is this surface's own half.
      setActiveSection("chats");
      // @orb-waive caught-failure-ownership(startChat): useStartChat's mutation carries
      // errorToast: "Couldn't start the chat." — the toast is the surface. Ends if useStartChat drops errorToast.
      startChat({ characterIds: [characterId] }).catch(() => undefined); // useStartChat's errorToast owns failure.
      return;
    }
    resumeChat(target);
  };

  const renderRow = (item: CharacterCardItem): ReactNode => (
    <CharacterCardTile
      bulkMode={bulkMode}
      bulkSelected={collection.selection.isSelected(item.id)}
      character={item}
      onChat={chatWith}
      onDelete={deleteCharacter}
      onDuplicate={duplicateCharacter}
      onSelect={openEditor}
      onToggleArchive={toggleArchive}
      onToggleBulk={toggleBulk}
      onToggleStar={toggleStar}
      selected={selectedId === item.id}
    />
  );

  useFocusOnMount(surfaceRef);
  const selectedCount = collection.selection.selected.size;

  return (
    // INSTRUMENT tier (UI-Density-Law.md §3.1 LIST panes): the library is a list you SCAN for a face
    // and a name, not a form you operate.
    <Surface tier="instrument">
      <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" gap="row">
        {/* SKIP THE CHROME (#491, side-eye 2026-08-22 rail-characters P1-1). The app-shell's own
            `Skip to content` moves focus to `<main>` — it skips PAST this pane, so a keyboard user who came
            for the LIST had no shortcut at all: the search, the sort, the two view commands, up to 24
            favourite faces and the filter rail all stand in front of the first row. This lands directly ON
            the first character, which is the thing the section exists to offer.
            Same posture as the shell's: `not-focus-visible:sr-only`, never `sr-only focus-visible:not-sr-only`
            — `not-sr-only` is a RESET whose `padding:0; height:auto` lands in the same layer as the Button's
            own box and wins, which renders the revealed control under the WCAG 2.5.8 floor. It costs the
            keyboard user one press and the pointer user nothing.
            It is FIRST IN DOM ORDER inside the surface, which is the whole contract: a skip control that is
            not the first focusable is a second tab stop, not a skip. */}
        <Button
          className="not-focus-visible:sr-only focus-visible:self-start"
          intent="secondary"
          onClick={(): void => surfaceRef.current?.querySelector<HTMLElement>('[data-slot="list-row-body"]')?.focus()}
          size="sm"
          type="button"
        >
          Skip to characters
        </Button>
        <CharacterLibraryToolbar onQueryChange={setCharacterSearch} query={query} />
        {/* THE RESULT COUNT, SPOKEN (side-eye 2026-08-03 P2), AND NOW HOUSED (side-eye 2026-08-17 taste a).
            It is a `role="status"` line that is ALWAYS mounted and always states the count (a region that
            appears with its first message announces nothing; a count that exists only while filtered shifts
            the layout on every chip press), and it counts the SERVER's matches, not the loaded rows.
            It renders inside the Filters group in the `datum` voice now: floating between the rail and the
            favorites strip in the `gloss` micro voice it read as a debug line, and it is the number the
            rail's own controls PRODUCE. The chips component draws it — see its datum line. */}
        <CharacterFilterChips
          availableTags={scope.availableTags}
          favoritesOnly={favoritesOnly}
          onClearFilters={clearCharacterFilters}
          onCycleTag={cycleTagFilter}
          onToggleArchived={toggleShowArchived}
          onToggleFavorites={toggleFavoritesOnly}
          onToggleOpen={toggleFiltersOpen}
          open={filtersOpen}
          resultLabel={resultCountLabel(items.length, collection.totalCount)}
          showArchived={showArchived}
          tagFilter={tagFilter}
          vocabularyPending={scope.vocabularyPending}
        />
        {/* The favorites strip is the shared `FaceStrip` composite now — the
          private avatar-in-Button copy it used to carry is retired, not duplicated. Portraits only: the
          names are already the rows' titles right below. */}
        <FaceStrip items={favorites} label="Favorite characters" onSelect={openEditor} selectedId={selectedId} verb="Open" />
        <Stack className="min-h-0 flex-1">
          <CharacterLibraryBody
            ariaLabel={ariaLabel}
            categorized={viewMode === "categorized"}
            error={collection.error}
            filtered={items}
            filtersActive={scope.filtersActive}
            hasNextPage={collection.hasNextPage}
            isFetchingNextPage={collection.isFetchingNextPage}
            isPending={collection.isPending}
            listProps={collection.listProps}
            loadedProgress={loadedProgressLabel(items.length, collection.totalCount)}
            onClearSearch={(): void => setCharacterSearch("")}
            onRetry={collection.refetch}
            tagGroups={tagGroups}
            query={settledQuery}
            renderRow={renderRow}
          />
        </Stack>
        {bulkMode && selectedCount > 0 ? (
          <CharacterBulkBar
            ids={[...collection.selection.selected]}
            onClear={collection.selection.clear}
            onRemoveSubmitted={collection.selection.remove}
            selectedCount={selectedCount}
            trpc={trpc}
          />
        ) : null}
      </Stack>
    </Surface>
  );
}
