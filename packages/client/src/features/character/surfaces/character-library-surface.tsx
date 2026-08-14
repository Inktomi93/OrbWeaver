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
// The two reads that deliberately do NOT ride the lens: the FAVORITES strip (its own `starred: true` page —
// it is a shortcut across the library, not a view of the filtered set, and reading the filtered page would
// empty it the moment you typed) and the TAG VOCABULARY (`tag.listTagsWithUsage` — the chips must offer
// tags the loaded rows don't happen to carry, and an ACTIVE filter has to render its chip even when its tag
// matches nothing at all: a filter you cannot see is a filter you cannot turn off).

import type { CharacterListSort } from "@orb/contracts/character";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Search, Users } from "@orb/ui/icons";
import { Stack, Surface } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { FaceStrip } from "#components";
import type { Trpc } from "#data";
import { createCollectionSurface, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useDebouncedValue, useFocusOnMount } from "#lib";
import {
  clearCharacterFilters,
  clearCharacterSelection,
  cycleTagFilter,
  selectCharacter,
  selectCharacterFromPicker,
  selectChat,
  setActiveSection,
  startNewChat,
  toggleFavoritesOnly,
  toggleShowArchived,
  useCharacterBulkMode,
  useCharacterSortMode,
  useCharacterViewMode,
  useFavoritesOnly,
  useSelectedCharacterId,
  useShowArchived,
  useTagFilter,
} from "#state";
import { CharacterBulkBar } from "../components/character-bulk-bar.tsx";
import type { CharacterCardItem } from "../components/character-card.tsx";
import { CharacterCardTile } from "../components/character-card.tsx";
import { CharacterCategorizedList } from "../components/character-categorized-list.tsx";
import { CharacterCreateButton } from "../components/character-create-actions.tsx";
import { CharacterFilterChips } from "../components/character-filter-chips.tsx";
import { CharacterLibraryToolbar } from "../components/character-library-toolbar.tsx";
import { useDuplicateCharacter, useRemoveCharacter } from "../hooks/use-character-context-mutations.ts";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { useRestoreRowFocus } from "../hooks/use-restore-row-focus.ts";
import { resultCountLabel, tagIdsInState, tagVocabulary } from "../lib/character-library-lens.ts";
import { groupByTag, resumeTargets } from "../lib/character-list-view.ts";

const ESTIMATED_ROW_PX = 80;
const SKELETON_ROW_COUNT = 6;

/** How deep the resume-or-new map looks back. The server's own page ceiling — one read, no keyset walk. */
const RESUME_WINDOW = 100;

/** Keystroke→request damper for the server-side search (the chats pane's value). Long enough that typing a
 *  name is one query rather than eight, short enough that the list answers while you are still looking. */
const SEARCH_DEBOUNCE_MS = 250;

/** How many favorites the strip reads. Its own bounded page, UNFILTERED by the pane's lenses. */
const FAVORITES_STRIP_LIMIT = 24;

type CharacterListPage = inferOutput<Trpc["character"]["list"]>;
type CharacterLibraryItem = CharacterListPage["items"][number];

/** The pane's whole lens, as query INPUT. Every field is part of the query key. */
interface CharacterLibraryParams {
  readonly sort: CharacterListSort;
  readonly pageSize: number;
  /** DEBOUNCED + trimmed; `""` is the unsearched library. */
  readonly search: string;
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  /** SORTED id lists — the chips' own order changes as they cycle, and an unsorted array would re-key the
   *  query (and refetch the whole run) on a reorder that means nothing. */
  readonly includeTagIds: readonly TagId[];
  readonly excludeTagIds: readonly TagId[];
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
        ...(params.search === "" ? {} : { search: params.search }),
        ...(params.favoritesOnly ? { starred: true } : {}),
        // Tri-state on the wire: the toggle's ON state is the UNFILTERED library (archived rows shown
        // BESIDE the rest, the client predicate's own semantics), so it sends nothing at all.
        ...(params.showArchived ? {} : { archived: false }),
        ...(params.includeTagIds.length === 0 ? {} : { includeTagIds: [...params.includeTagIds] }),
        ...(params.excludeTagIds.length === 0 ? {} : { excludeTagIds: [...params.excludeTagIds] }),
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
  /** The character whose row should reclaim keyboard focus when the library (re)mounts — the modal pane's
   *  ← Back return target, so backing out of her chats projection lands focus on the row it came from, not
   *  `<body>` (list-pane-projection §3.7; the facet-editor back-focus precedent). `null` = no restore (the
   *  initial mount, where stealing focus would jump the tab order past the rail nav). */
  readonly focusCharacterId?: CharacterId | null;
}

/** The character library: header + favorites + filters + the flat/categorized paged list + bulk mode. */
export function CharacterLibrarySurface({ ariaLabel = "Character library", focusCharacterId = null }: CharacterLibrarySurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [query, setQuery] = useState("");
  // DEBOUNCED, not deferred: deferring picks a render, and every distinct string here is a round trip now
  // that the predicate is the server's (the chats pane's ruling, `chat-list-surface.tsx`).
  const settledQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const sortMode = useCharacterSortMode();
  const viewMode = useCharacterViewMode();
  const favoritesOnly = useFavoritesOnly();
  const showArchived = useShowArchived();
  const tagFilter = useTagFilter();
  const bulkMode = useCharacterBulkMode();
  // ⑪ — the user's library page size (cache-first; the settings read is already loaded app-wide). Until it
  // resolves, fall back to the schema default so the first page fetches at the same size as pre-wire.
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const pageSize = settingsQuery.data?.config.library.pageSize ?? DEFAULT_USER_SETTINGS.library.pageSize;
  const collection = useCharacterLibraryCollection(
    { trpc },
    {
      sort: sortMode,
      pageSize,
      search: settledQuery,
      favoritesOnly,
      showArchived,
      includeTagIds: tagIdsInState(tagFilter, "include"),
      excludeTagIds: tagIdsInState(tagFilter, "exclude"),
    },
  );
  const selectedId = useSelectedCharacterId();
  const update = useUpdateCharacter({ trpc, invalidation });
  const duplicate = useDuplicateCharacter({ trpc, invalidation });
  const remove = useRemoveCharacter({ trpc, invalidation });

  // The resume-or-new map (§4.4/§9c), over a BOUNDED recents page (2026-08-09): `listChats` is keyset-paged
  // now, and this used to read the caller's entire membership list on every library mount. A row whose
  // character is not in the recents window falls through to "start a new chat", which is the same visible
  // affordance — the CTA's label does not change, only which chat it lands in. The exact fix is a batch
  // reverse read (`characterIds → resume chatId`), which is a new server capability, not this lane's.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({ limit: RESUME_WINDOW }));
  const resumeMap = resumeTargets(chatsQuery.data?.items ?? []);

  // The rows are the SERVER's answer whole — no client pass. The only thing left to derive is the view fold.
  const items: readonly CharacterCardItem[] = collection.items;
  // The strip's own read: the caller's starred characters, independent of the pane's current lens (a
  // shortcut must not vanish because you typed in the search box).
  const favoritesQuery = useQuery(trpc.character.list.queryOptions({ starred: true, limit: FAVORITES_STRIP_LIMIT }));
  const favorites = favoritesQuery.data?.items ?? [];
  // The chip vocabulary is the OWNER'S TAG LIBRARY, not the loaded rows' tags (the dead-filter class): a
  // chip that only exists once a matching row happens to be loaded is a filter you cannot turn off.
  const tagLibraryQuery = useQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const availableTags = tagVocabulary(tagLibraryQuery.data ?? [], tagFilter);

  // A pick FROM THE PICKER (a card click / a favorites face): the same selection write, plus the focus
  // decision the pane swap needs — the projection that replaces this library takes focus (§3.7).
  const openEditor = (id: string): void => selectCharacterFromPicker(castId<CharacterId>(id));
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
    const target = resumeMap.get(characterId);
    if (target === undefined) {
      startNewChat({ characterIds: [characterId] });
    } else {
      selectChat(target);
    }
    setActiveSection("chats");
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

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  useRestoreRowFocus(surfaceRef, focusCharacterId, items);
  const selectedCount = collection.selection.selected.size;

  return (
    // INSTRUMENT tier (density-pass-spec.md §3.1 LIST panes): the library is a list you SCAN for a face
    // and a name, not a form you operate.
    <Surface tier="instrument">
      <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" gap="row">
        <CharacterLibraryToolbar onQueryChange={setQuery} query={query} />
        <CharacterFilterChips
          availableTags={availableTags}
          favoritesOnly={favoritesOnly}
          onCycleTag={cycleTagFilter}
          onToggleArchived={toggleShowArchived}
          onToggleFavorites={toggleFavoritesOnly}
          showArchived={showArchived}
          tagFilter={tagFilter}
        />
        {/* THE RESULT COUNT, SPOKEN (side-eye 2026-08-03 P2). Cycling a chip changes what is on screen and
            said nothing, so a screen-reader user operating a three-state control got no feedback that it
            had done anything. `role="status"` is polite by default; the line is always mounted (a region
            that appears WITH its first message announces nothing) and always states the count, because a
            count that only exists while filtered is a layout that shifts on every chip press.
            It counts the SERVER's matches now, not the loaded rows — and says so when the two differ. */}
        <Text role="status" voice="gloss">
          {resultCountLabel(items.length, collection.totalCount)}
        </Text>
        {/* The favorites strip is the shared `FaceStrip` composite now (list-pane-projection §11.2) — the
          private avatar-in-Button copy it used to carry is retired, not duplicated. Portraits only: the
          names are already the rows' titles right below. */}
        <FaceStrip items={favorites} label="Favorite characters" onSelect={openEditor} selectedId={selectedId} verb="Open" />
        <Stack className="min-h-0 flex-1">
          <CharacterLibraryBody
            ariaLabel={ariaLabel}
            categorized={viewMode === "categorized"}
            error={collection.error}
            filtered={items}
            filtersActive={favoritesOnly || tagFilter.length > 0}
            hasNextPage={collection.hasNextPage}
            isFetchingNextPage={collection.isFetchingNextPage}
            isPending={collection.isPending}
            listProps={collection.listProps}
            onClearSearch={(): void => setQuery("")}
            onRetry={collection.refetch}
            query={settledQuery}
            renderRow={renderRow}
          />
        </Stack>
        {bulkMode && selectedCount > 0 ? (
          <CharacterBulkBar ids={[...collection.selection.selected]} onClear={collection.selection.clear} selectedCount={selectedCount} trpc={trpc} />
        ) : null}
      </Stack>
    </Surface>
  );
}

interface CharacterLibraryBodyProps {
  readonly ariaLabel: string;
  readonly query: string;
  /** Any chip narrowing the SERVER read (favorites / tag include-exclude). Archived is deliberately not one:
   *  its OFF state is the resting library, so an empty library is not "the Archived toggle did this". */
  readonly filtersActive: boolean;
  readonly categorized: boolean;
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly filtered: readonly CharacterCardItem[];
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly listProps: ReturnType<typeof useCharacterLibraryCollection>["listProps"];
  readonly onClearSearch: () => void;
  readonly onRetry: () => void;
  readonly renderRow: (item: CharacterCardItem) => ReactNode;
}

/** Loading → error → empty → no-matches → the flat virtual list OR the categorized grouped list.
 *
 *  The three empties are DIFFERENT CLAIMS and the server now lets each be honest: with the predicates on the
 *  server an empty page means "nothing in the whole library matches", so the search arm no longer has to
 *  hedge and the chip arm's old "load more to keep looking" affordance is gone — there is nothing further to
 *  load, and offering it would be a dead end pretending to be a next step. */
function CharacterLibraryBody({
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
      return (
        <EmptyState
          action={
            <Button intent="secondary" onClick={onClearSearch} size="sm">
              Clear search
            </Button>
          }
          description={`No character matches "${query}".`}
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
    return (
      <EmptyState
        action={<CharacterCreateButton />}
        description="Weave your first one to begin."
        icon={<Icon icon={Users} size="lg" />}
        title="No characters yet"
      />
    );
  }
  if (categorized) {
    return (
      <CharacterCategorizedList
        groups={groupByTag(filtered)}
        hasNextPage={hasNextPage}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={listProps.onEndApproach}
        renderRow={renderRow}
      />
    );
  }
  return (
    <Stack aria-label={ariaLabel} className="h-full min-h-0" role="list">
      <VirtualList
        className="h-full"
        endApproachRows={listProps.endApproachRows}
        estimateSize={(): number => ESTIMATED_ROW_PX}
        gapToken="row"
        getItemKey={(item): string => item.id}
        items={filtered}
        onEndApproach={listProps.onEndApproach}
        renderItem={renderRow}
      />
    </Stack>
  );
}
