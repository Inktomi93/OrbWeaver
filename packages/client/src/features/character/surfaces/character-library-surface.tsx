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
// THE TAG LIBRARY IS ALSO THE FILTER'S REFERENTIAL AUTHORITY (staleness-and-session-freshness.md §4.2.2).
// `orb:character-library` persists raw `TagId`s that outlive the rows they name — a deleted tag, or a whole
// previous dev era's db. Because the server's tag predicate is AND on both arms, ONE such include-id matches
// zero rows and empties the entire library, invisibly and across every reload: the owner's import repro, whose
// only cure was wiping localStorage. So an entry the tag library does not know is dropped from the REQUEST
// (`effectiveTagFilter`) while staying in the store, where the chip row renders it clearable — visible + inert.
//
// THE BROWSE POSITION SURVIVES THE PANE SWAP (#255). Opening somebody swaps this whole LIST pane to her
// chats projection (per the projection design's D2 arm — selection ⇒ projection, back = deselect,
// `docs/design/list-pane-projection-proposal.md` §10), which UNMOUNTS this surface.
// The paged rows survive that in the query cache; the list's scroll offset did not, so backing out of a card
// 300 rows down landed at the top and browsing a real library was a click-and-Back-and-scroll loop. The
// offset is captured at the CLICK (`captureBrowseOffset`) and re-applied at mount through `VirtualList`'s
// `initialScrollOffset`. This changes nothing about D2 itself: the swap is still unconditional, back is
// still deselect, and no chrome is added — D2's priced cost ("can't browse the library while editing her")
// is untouched; losing your PLACE was never part of that price.
//
// The two reads that deliberately do NOT ride the lens: the FAVORITES strip (its own `starred: true` page —
// it is a shortcut across the library, not a view of the filtered set, and reading the filtered page would
// empty it the moment you typed) and the TAG VOCABULARY (`tag.listTagFilterVocabulary` — the chips must offer
// tags the loaded rows don't happen to carry, and an ACTIVE filter has to render its chip even when its tag
// matches nothing at all: a filter you cannot see is a filter you cannot turn off).

import type { CharacterListSort } from "@orb/contracts/character";
import { CHAT_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack, Surface } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { FaceStrip } from "#components";
import type { Trpc } from "#data";
import { createCollectionSurface, useInvalidation, useStartChat, useTRPC } from "#data";
import { useDebouncedValue, useFocusOnMount } from "#lib";
import {
  clearCharacterFilters,
  clearCharacterSelection,
  cycleTagFilter,
  getCharacterBrowseOffset,
  selectCharacter,
  selectCharacterFromPicker,
  selectChat,
  setActiveSection,
  setCharacterBrowseOffset,
  toggleFavoritesOnly,
  toggleFiltersOpen,
  toggleShowArchived,
  useCharacterBulkMode,
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
import { useLibraryLens } from "../hooks/use-library-lens.ts";
import { useRestoreRowFocus } from "../hooks/use-restore-row-focus.ts";
import { effectiveTagFilter, knownTagIds, loadedProgressLabel, partialGroupingLabel, resultCountLabel, tagVocabulary } from "../lib/character-library-lens.ts";
import { resumeTargets } from "../lib/character-list-view.ts";

/** How deep the resume-or-new map looks back. The server's own page ceiling — one read, no keyset walk. */
const RESUME_WINDOW = CHAT_LIST_MAX_LIMIT;

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
   *  `<body>` (the facet-editor back-focus precedent). `null` = no restore (the
   *  initial mount, where stealing focus would jump the tab order past the rail nav). */
  readonly focusCharacterId?: CharacterId | null;
}

/** The character library: header + favorites + filters + the flat/categorized paged list + bulk mode. */
export function CharacterLibrarySurface({ ariaLabel = "Character library", focusCharacterId = null }: CharacterLibrarySurfaceProps): ReactElement {
  const trpc = useTRPC();
  const surfaceRef = useRef<HTMLDivElement>(null);
  // The browse position to REMOUNT at, snapshotted once (`useState`'s lazy initializer, not a subscription):
  // this is a mount-time initializer, and a live subscription would re-scroll the list under the user every
  // time the value changed. `0` — the store's own default — is the honest first-visit value.
  const [initialScrollOffset] = useState(getCharacterBrowseOffset);
  const { startChat } = useStartChat();
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
  const filtersOpen = useFiltersOpen();
  const bulkMode = useCharacterBulkMode();
  // ⑪ — the user's library page size (cache-first; the settings read is already loaded app-wide). Until it
  // resolves, fall back to the schema default so the first page fetches at the same size as pre-wire.
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const pageSize = settingsQuery.data?.config.library.pageSize ?? DEFAULT_USER_SETTINGS.library.pageSize;
  // The chip vocabulary is the OWNER'S TAG LIBRARY, not the loaded rows' tags (the dead-filter class): a
  // chip that only exists once a matching row happens to be loaded is a filter you cannot turn off. It is
  // ALSO the referential authority for the persisted filter — hoisted above the collection because the
  // collection's query INPUT now depends on it.
  // THE CHIPS READ A PROJECTION, NOT THE MANAGEMENT ROLLUP (side-eye 2026-08-18 P2-6). This used to be
  // `tag.listTagsWithUsage` — the Tags screen's five-junction read — and on the owner's library that is
  // 433,399 bytes over 1,736 rows, parsed on the section's cold entry, to paint 8 chips and a "+1,728 more"
  // link. `listTagFilterVocabulary` is the same owned ROWS (it must be: this answer is also the referential
  // authority for the persisted filter below) with four columns instead of eleven and one GROUP BY instead
  // of five: 132,996 bytes for the same library.
  const tagLibraryQuery = useQuery(trpc.tag.listTagFilterVocabulary.queryOptions());
  const tagLibrary = tagLibraryQuery.data ?? [];
  const availableTags = tagVocabulary(tagLibrary, tagFilter);
  // A persisted entry whose tag the library does not know can never match a row, and the server's tag
  // predicate is AND on both arms, so leaving it on the wire vetoes the ENTIRE library with nothing on screen
  // explaining it (the owner's import repro). The authority is the SETTLED read: pending (and errored) is
  // `null` = "not answered", which is NOT the same as "knows nothing" — trusting the blob until the answer
  // lands is what keeps a LIVE filter from flashing off on every boot (`effectiveTagFilter`). A dropped entry
  // stays in the store and still renders its chip: visible + inert, never a write-on-render.
  const effectiveFilter = effectiveTagFilter(tagFilter, tagLibraryQuery.isSuccess ? knownTagIds(tagLibrary) : null);
  // The chip lens reaches the LIST one render behind the chips — the whole WHY (and the review premise
  // that died) is in `use-library-lens.ts`.
  const lens = useLibraryLens(favoritesOnly, effectiveFilter);
  const collection = useCharacterLibraryCollection(
    { trpc },
    {
      sort: sortMode,
      pageSize,
      search: settledQuery,
      favoritesOnly: lens.favoritesOnly,
      showArchived,
      includeTagIds: lens.includeTagIds,
      excludeTagIds: lens.excludeTagIds,
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

  // A pick FROM THE PICKER (a card click / a favorites face): the same selection write, plus the focus
  // decision the pane swap needs — the projection that replaces this library takes focus (§3.7).
  //
  // …AND THE BROWSE POSITION (#255). This click is what swaps the LIST pane to her chats projection (per
  // the projection design's D2 arm — selection ⇒ projection, back = deselect,
  // `docs/design/list-pane-projection-proposal.md` §10), which unmounts this whole surface. Back-focus
  // already survived that (`focusCharacterId`); the SCROLL did not, so backing out of the 327th card landed
  // at the top of the library and browsing was a click-and-Back-and-scroll loop. The offset is read here,
  // straight off the list's scroll element, because this is the last moment it is both meaningful and
  // ATTACHED — an unmount-time read reports 0 (React runs cleanups around DOM removal), and a scroll-time
  // read would write to a `persist`-wrapped store on every frame. The element is found by the primitive's
  // own slot inside this surface's container — the scoped-querySelector precedent `useRestoreRowFocus`
  // already uses, never a document-wide reach.
  const captureBrowseOffset = (): void => {
    const scroller = surfaceRef.current?.querySelector<HTMLElement>('[data-slot="virtual-list-scroll"]');
    if (scroller !== null && scroller !== undefined) {
      setCharacterBrowseOffset(scroller.scrollTop);
    }
  };
  const openEditor = (id: string): void => {
    captureBrowseOffset();
    selectCharacterFromPicker(castId<CharacterId>(id));
  };
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
      // A real `chat.startChat` through the ONE shared creation seam (`#data`), which enters the room
      // itself; the section switch is this surface's own half.
      setActiveSection("chats");
      void startChat({ characterIds: [characterId] });
      return;
    }
    selectChat(target);
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

  useFocusOnMount(surfaceRef);
  useRestoreRowFocus(surfaceRef, focusCharacterId, items);
  const selectedCount = collection.selection.selected.size;

  return (
    // INSTRUMENT tier (density-pass-spec.md §3.1 LIST panes): the library is a list you SCAN for a face
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
        <CharacterLibraryToolbar onQueryChange={setQuery} query={query} />
        {/* THE RESULT COUNT, SPOKEN (side-eye 2026-08-03 P2), AND NOW HOUSED (side-eye 2026-08-17 taste a).
            It is a `role="status"` line that is ALWAYS mounted and always states the count (a region that
            appears with its first message announces nothing; a count that exists only while filtered shifts
            the layout on every chip press), and it counts the SERVER's matches, not the loaded rows.
            It renders inside the Filters group in the `datum` voice now: floating between the rail and the
            favorites strip in the `gloss` micro voice it read as a debug line, and it is the number the
            rail's own controls PRODUCE. The chips component draws it — see its datum line. */}
        <CharacterFilterChips
          availableTags={availableTags}
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
          vocabularyPending={tagLibraryQuery.isPending}
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
            filtersActive={lens.filtersActive}
            hasNextPage={collection.hasNextPage}
            initialScrollOffset={initialScrollOffset}
            isFetchingNextPage={collection.isFetchingNextPage}
            isPending={collection.isPending}
            listProps={collection.listProps}
            loadedProgress={loadedProgressLabel(items.length, collection.totalCount)}
            onClearSearch={(): void => setQuery("")}
            onRetry={collection.refetch}
            partialNotice={partialGroupingLabel(items.length, collection.totalCount)}
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
