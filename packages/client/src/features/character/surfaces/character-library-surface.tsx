// THE character library surface (UI-Arch §2.1 CONSUMER tier · FINAL-Character §4) — the Characters LIST.
// EXTENDS the working keyset-browse (§12 "don't rebuild"): `createCollectionSurface` over `character.list`
// (keyset-paged, sliding-window `maxPages`), now with the §4.1 header (title + persistent search + `+`
// create/import picker), the §4.5 nine-sort select (server `sort` param — a sort change re-keys the query,
// `keepPreviousData` greys the old rows), the §4.5 filter chips (favorites/archived/tag-AND — CLIENT-side
// over the loaded pages, same as search; `character.list` has no server filter param), the §4.2 favorites
// strip, the §4.3 flat⇄categorized view, and §4.6 bulk mode (the collection's own transient id-set +
// `@orb/ui/selection-bar`). The §4.4 row is `<CharacterCardTile>`.
//
// RESUME-OR-NEW (§4.4/§9c): the dual-purpose Chat CTA resumes the most-recent chat with a character or
// starts a new one. The decision is a RENDER derivation (§5.1 — never an effect on a selection pointer):
// `resumeTargets` builds characterId → most-recent chatId from the bus-driven `listChats` read; the click
// fires exactly ONE store action (`selectChat` or `startNewChat`, then `setActiveSection`).

import type { CharacterListSort } from "@orb/contracts/character";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Search/Users fine.
import { Icon, Search, Users } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { Trpc } from "#data";
import { createCollectionSurface, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import {
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
import { CharacterFavoritesStrip } from "../components/character-favorites-strip";
import { CharacterFilterChips } from "../components/character-filter-chips";
import { CharacterLibraryToolbar } from "../components/character-library-toolbar";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import { filterByChips, groupByTag, resumeTargets } from "../lib/character-list-view";
import { filterCharacters } from "../lib/filter-characters";

const ESTIMATED_ROW_PX = 80;
const SKELETON_ROW_COUNT = 6;
const PAGE_LIMIT = 30;
const MAX_PAGES = 5;

type CharacterListPage = inferOutput<Trpc["character"]["list"]>;
type CharacterLibraryItem = CharacterListPage["items"][number];

/** The one browse machine (§13.1). `params` now carries the §4.5 `sort` — a change re-keys the infinite
 *  query (fresh from `initialCursor: null`; `keepPreviousData` keeps the old rows visible meanwhile). */
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

  // §4.4/§9c reverse read — bus-driven `listChats` (staleTime default; `chatsChanged` refreshes it), folded
  // to characterId → most-recent chatId in render. Degrades to "start new" until it loads (empty map).
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
  const toggleBulk = (id: string): void => collection.selection.toggle(id);
  // The resume-or-new decision + the ONE sanctioned cross-section jump (§9c) — a writer-only store touch.
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
      onSelect={openEditor}
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
  onRetry,
  renderRow,
}: CharacterLibraryBodyProps): ReactElement {
  if (isPending) {
    return <LoadingRows />;
  }
  if (error !== null) {
    return <ErrorState onRetry={onRetry} />;
  }
  if (isEmpty) {
    return (
      <EmptyState
        description="Weave your first one to begin."
        icon={<Icon icon={Users} size="lg" />}
        title="No characters yet"
      />
    );
  }
  if (filtered.length === 0) {
    // A search with zero hits gets the search copy. A CHIP-induced empty is different: chips filter
    // client-side over the loaded sliding window, so a match may live on a not-yet-fetched page — never
    // show search copy (nor a dead end) for it. When more pages exist, offer Load more (the SAME guarded
    // fetch the virtual list wires to `onEndApproach`), else say the loaded set holds no match.
    if (query.trim() !== "") {
      return (
        <EmptyState
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

/** The suspense-free loading skeleton (a few placeholder rows, never a spinner flash). */
function LoadingRows(): ReactElement {
  return (
    <Stack aria-busy={true} gap="row" padding="block">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => i).map((i) => (
        <Skeleton className="h-control-lg w-full" key={i} />
      ))}
    </Stack>
  );
}

/** The read-error surface — a Retry re-runs the query (`collection.refetch`), so a transient read failure
 *  is never a dead end (UI-Arch §4.3 rule 1). */
function ErrorState({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <Stack align="center" gap="row" justify="center" padding="section">
      <Text tone="muted">Couldn't load the character library.</Text>
      <Button intent="secondary" onClick={onRetry} size="sm">
        Retry
      </Button>
    </Stack>
  );
}
