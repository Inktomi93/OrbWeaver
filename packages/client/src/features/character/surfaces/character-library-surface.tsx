// The character library surface — the Characters list. `createCollectionSurface` over `character.list`
// (keyset-paged) with header/search, sort, client-side filter chips, favorites strip, flat/categorized
// view, and bulk mode. The Chat CTA resumes the most-recent chat with a character or starts a new one.

import type { CharacterListSort } from "@orb/contracts/character";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Search/Users fine.
import { Icon, Search, Users } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { VirtualList } from "@orb/ui/virtual-list";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { Trpc } from "#data";
import {
  createCollectionSurface,
  QueryErrorState,
  SkeletonRows,
  useInvalidation,
  useTRPC,
} from "#data";
import { useFocusOnMount } from "#lib";
import {
  clearCharacterSelection,
  selectCharacter,
  selectChat,
  setActiveSection,
  startNewChat,
  toggleFavoritesOnly,
  toggleShowArchived,
  toggleTagFilter,
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
import { CharacterCreateMenu } from "../components/character-create-menu";
import { CharacterFavoritesStrip } from "../components/character-favorites-strip";
import { CharacterFilterChips } from "../components/character-filter-chips";
import { CharacterLibraryToolbar } from "../components/character-library-toolbar";
import {
  useDuplicateCharacter,
  useRemoveCharacter,
} from "../hooks/use-character-context-mutations";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import { filterByChips, groupByTag, resumeTargets } from "../lib/character-list-view";
import { filterCharacters } from "../lib/filter-characters";

const ESTIMATED_ROW_PX = 80;
const SKELETON_ROW_COUNT = 6;
const PAGE_LIMIT = 30;
const MAX_PAGES = 5;

type CharacterListPage = inferOutput<Trpc["character"]["list"]>;
type CharacterLibraryItem = CharacterListPage["items"][number];

const useCharacterLibraryCollection = createCollectionSurface({
  query: (trpc: Trpc, params: { sort: CharacterListSort }) =>
    trpc.character.list.infiniteQueryOptions(
      { limit: PAGE_LIMIT, sort: params.sort },
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
}

/** The character library: header + favorites + filters + the flat/categorized paged list + bulk mode. */
export function CharacterLibrarySurface({
  ariaLabel = "Character library",
}: CharacterLibrarySurfaceProps): ReactElement {
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
  const collection = useCharacterLibraryCollection({ trpc }, { sort: sortMode });
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

  const openEditor = (id: string): void => selectCharacter(castId<CharacterId>(id));
  const toggleStar = (id: string, next: boolean): void =>
    update.mutate({ characterId: castId<CharacterId>(id), input: { starred: next } });
  const toggleArchive = (id: string, next: boolean): void =>
    update.mutate({ characterId: castId<CharacterId>(id), input: { archived: next } });
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
  const selectedCount = collection.selection.selected.size;

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 outline-none" gap="block">
      <CharacterLibraryToolbar onQueryChange={setQuery} query={query} />
      <CharacterFilterChips
        availableTags={availableTags}
        favoritesOnly={favoritesOnly}
        onToggleArchived={toggleShowArchived}
        onToggleFavorites={toggleFavoritesOnly}
        onToggleTag={toggleTagFilter}
        showArchived={showArchived}
        tagFilter={tagFilter}
      />
      <CharacterFavoritesStrip
        favorites={favorites}
        onSelect={openEditor}
        selectedId={selectedId}
      />
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
        <CharacterBulkBar
          ids={[...collection.selection.selected]}
          onClear={collection.selection.clear}
          selectedCount={selectedCount}
          trpc={trpc}
        />
      ) : null}
    </Stack>
  );
}

/** The visible-tag vocabulary across the loaded rows (deduped by id) — the tag-filter chip set. */
function tagVocabulary(
  items: readonly CharacterLibraryItem[],
): readonly { readonly id: TagId; readonly name: string }[] {
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
        action={<CharacterCreateMenu />}
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
                <Button
                  disabled={isFetchingNextPage}
                  intent="secondary"
                  onClick={listProps.onEndApproach}
                >
                  Load more
                </Button>
              ),
            }
          : {})}
        description={
          hasNextPage
            ? "None among the loaded characters — load more to keep looking."
            : "No characters match the current filters."
        }
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
