// The character library surface — the Characters list. `createCollectionSurface` over `character.list`
// (keyset-paged) with header/search, sort, client-side filter chips, favorites strip, flat/categorized
// view, and bulk mode. The Chat CTA resumes the most-recent chat with a character or starts a new one.

import type { CharacterListSort } from "@orb/contracts/character";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Search, Users } from "@orb/ui/icons";
import { Stack, Surface } from "@orb/ui/layout";
import { VirtualList } from "@orb/ui/virtual-list";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FaceStrip } from "#components";
import type { Trpc } from "#data";
import { createCollectionSurface, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import {
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
import { CharacterBulkBar } from "../components/character-bulk-bar";
import type { CharacterCardItem } from "../components/character-card";
import { CharacterCardTile } from "../components/character-card";
import { CharacterCategorizedList } from "../components/character-categorized-list";
import { CharacterCreateButton } from "../components/character-create-actions";
import { CharacterFilterChips } from "../components/character-filter-chips";
import { CharacterLibraryToolbar } from "../components/character-library-toolbar";
import { useDuplicateCharacter, useRemoveCharacter } from "../hooks/use-character-context-mutations";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import { filterByChips, groupByTag, resumeTargets } from "../lib/character-list-view";
import { filterCharacters } from "../lib/filter-characters";

const ESTIMATED_ROW_PX = 80;
/** How many frames the back-focus restore waits for the virtualizer to mount her row before giving up. */
const MAX_ROW_FOCUS_FRAMES = 30;
const SKELETON_ROW_COUNT = 6;
const MAX_PAGES = 5;

type CharacterListPage = inferOutput<Trpc["character"]["list"]>;
type CharacterLibraryItem = CharacterListPage["items"][number];

// ⑪ — `pageSize` is a PARAM the consumer supplies (from `UserSettings.library.pageSize`), never a
// factory-internal settings read (tier direction: the collection-surface factory takes it as data).
const useCharacterLibraryCollection = createCollectionSurface({
  query: (trpc: Trpc, params: { sort: CharacterListSort; pageSize: number }) =>
    trpc.character.list.infiniteQueryOptions(
      { limit: params.pageSize, sort: params.sort },
      {
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        getPreviousPageParam: () => undefined,
        maxPages: MAX_PAGES,
      },
    ),
  itemsOf: (page: CharacterListPage) => page.items,
  idOf: (item: CharacterLibraryItem) => item.id,
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
  const deferredQuery = useDeferredValue(query, "");
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
  const collection = useCharacterLibraryCollection({ trpc }, { sort: sortMode, pageSize });
  const selectedId = useSelectedCharacterId();
  const update = useUpdateCharacter({ trpc, invalidation });
  const duplicate = useDuplicateCharacter({ trpc, invalidation });
  const remove = useRemoveCharacter({ trpc, invalidation });

  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({}));
  const resumeMap = useMemo(() => resumeTargets(chatsQuery.data ?? []), [chatsQuery.data]);

  const items = collection.items;
  const favorites = useMemo(() => items.filter((c) => c.starred), [items]);
  const availableTags = useMemo(() => tagVocabulary(items), [items]);
  const filtered: readonly CharacterCardItem[] = useMemo(
    () =>
      filterByChips(filterCharacters(items, deferredQuery), {
        favoritesOnly,
        showArchived,
        tagFilter,
      }),
    [items, deferredQuery, favoritesOnly, showArchived, tagFilter],
  );

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
        {/* The favorites strip is the shared `FaceStrip` composite now (list-pane-projection §11.2) — the
          private avatar-in-Button copy it used to carry is retired, not duplicated. Portraits only: the
          names are already the rows' titles right below. */}
        <FaceStrip items={favorites} label="Favorite characters" onSelect={openEditor} selectedId={selectedId} verb="Open" />
        <Stack className="min-h-0 flex-1">
          <CharacterLibraryBody
            ariaLabel={ariaLabel}
            categorized={viewMode === "categorized"}
            error={collection.error}
            filtered={filtered}
            hasNextPage={collection.hasNextPage}
            isEmpty={collection.isEmpty}
            isFetchingNextPage={collection.isFetchingNextPage}
            isPending={collection.isPending}
            listProps={collection.listProps}
            onClearSearch={(): void => setQuery("")}
            onRetry={collection.refetch}
            query={deferredQuery}
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

/** Restore keyboard focus to one character's ROW once the list has actually rendered it (§3.7 back-focus).
 *  The rows arrive with the paged query, not at mount, so this keys on `items` and gives up silently when
 *  the row isn't in the loaded window (a later page, or filtered out) — the surface container already holds
 *  focus in that case, which is the honest fallback, never a focus trap on nothing.
 *
 *  The row is located by the `ListRow` body's accessible NAME (the primitive takes no ref, and its
 *  `aria-label` IS the character name) inside this surface's own container — the scoped-querySelector
 *  precedent from `context-tabs-panel` / `settings-shell-surface`, never a document-wide reach. */
function useRestoreRowFocus(surfaceRef: RefObject<HTMLDivElement | null>, focusCharacterId: CharacterId | null, items: readonly CharacterCardItem[]): void {
  const [pendingId, setPendingId] = useState<CharacterId | null>(focusCharacterId);
  useEffect(() => {
    if (pendingId === null) {
      return;
    }
    const name = items.find((item) => item.id === pendingId)?.name;
    if (name === undefined) {
      return;
    }
    // The row lands a FRAME after its data does — the flat list is virtualized, so the item's node appears
    // only once the virtualizer has measured. A bounded rAF poll (the settings-anchor precedent) waits for
    // it and then gives up silently rather than spinning.
    let frames = 0;
    let raf = 0;
    const attempt = (): void => {
      const row = surfaceRef.current?.querySelector<HTMLElement>(`[data-slot="list-row-body"][aria-label=${CSS.escape(name)}]`);
      if (row !== null && row !== undefined) {
        row.focus();
        setPendingId(null);
        return;
      }
      frames += 1;
      if (frames <= MAX_ROW_FOCUS_FRAMES) {
        raf = globalThis.requestAnimationFrame(attempt);
      }
    };
    attempt();
    return (): void => globalThis.cancelAnimationFrame(raf);
  }, [pendingId, items, surfaceRef]);
}

/** The visible-tag vocabulary across the loaded rows (deduped by id) — the tag-filter chip set. */
function tagVocabulary(items: readonly CharacterLibraryItem[]): readonly { readonly id: TagId; readonly name: string }[] {
  const seen = new Map<TagId, string>();
  for (const item of items) {
    for (const tag of item.tags) {
      if (!tag.isHiddenOnCard) {
        seen.set(tag.id, tag.name);
      }
    }
  }
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

interface CharacterLibraryBodyProps {
  readonly ariaLabel: string;
  readonly query: string;
  readonly categorized: boolean;
  readonly isPending: boolean;
  readonly isEmpty: boolean;
  readonly error: unknown | null;
  readonly filtered: readonly CharacterCardItem[];
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly listProps: ReturnType<typeof useCharacterLibraryCollection>["listProps"];
  readonly onClearSearch: () => void;
  readonly onRetry: () => void;
  readonly renderRow: (item: CharacterCardItem) => ReactNode;
}

/** Loading → error → empty → no-matches → the flat virtual list OR the categorized grouped list. */
function CharacterLibraryBody({
  ariaLabel,
  query,
  categorized,
  isPending,
  isEmpty,
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
  if (isEmpty) {
    return (
      <EmptyState
        action={<CharacterCreateButton />}
        description="Weave your first one to begin."
        icon={<Icon icon={Users} size="lg" />}
        title="No characters yet"
      />
    );
  }
  if (filtered.length === 0) {
    if (query.trim() !== "") {
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
    return (
      <EmptyState
        {...(hasNextPage
          ? {
              action: (
                <Button disabled={isFetchingNextPage} intent="secondary" onClick={listProps.onEndApproach}>
                  Load more
                </Button>
              ),
            }
          : {})}
        description={hasNextPage ? "None among the loaded characters — load more to keep looking." : "No characters match the current filters."}
        icon={<Icon icon={Users} size="lg" />}
        title="No matches in view"
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
