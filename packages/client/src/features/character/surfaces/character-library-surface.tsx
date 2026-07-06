// THE character library surface (UI-Arch §2.1 CONSUMER tier) — a browse/grid of the caller's owned
// characters: a search box (`useDeferredValue`) over a virtualized, INFINITELY-paged list of
// `<CharacterCardTile>` rows, wired through the `createCollectionSurface` factory (UI-Primitives §13.1/§13.2 —
// the mandated browse primitive; a hand-wired query+list+filter is the review flag).
//
// PAGING: `character.list` is keyset-paged (`domain/character/verbs/list.ts` — the `domain/notifications`
// `{items, nextCursor}` shape; the cursor itself is the `domain/assets` `(createdAt, id)` compound-keyset
// precedent, collapsed into ONE `cursor` object field because tRPC's `infiniteQueryOptions` threads
// exactly one `cursor` field through as the page param — see the router's own header note). `maxPages`
// bounds the client-side cache to a sliding window (UI-Lib-TanStack-Query.md §4) so a long scroll session
// doesn't grow the in-memory page list unboundedly; `getPreviousPageParam` is a permanent no-op (the
// library only ever scrolls forward) — `maxPages` requires BOTH direction getters even though this surface
// never calls `fetchPreviousPage`.
//
// SEARCH DECISION: stays CLIENT-SIDE over the loaded pages (`useDeferredValue` + `filterCharacters`), same
// as before the swap. `character.list` has no server-side `search` param — adding one is a real domain
// change (a new query condition, not a transport pass-through) and is out of scope for this pass; moving
// search server-side later is a clean follow-up (the search box already isolates the concern).
//
// LOADING/EMPTY/ERROR: `createCollectionSurface` uses a plain (non-suspense) `useInfiniteQuery`, so this
// surface reads `isPending`/`error`/`isEmpty` off the returned collection directly instead of the
// `<QueryBoundary>` suspense handshake the old unpaged read used. NOTE: the factory does not expose a
// `refetch`/retry handle (by design — §13.1's litmus keeps the wiring surface minimal), so the error state
// here is read-only (no Retry button); a future factory revision could add one, but that is
// `create-collection-surface.ts` territory, outside this surface's file.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the rail-slots.ts / spinner.tsx precedent).
import { Icon, Search, Users } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useDeferredValue, useState } from "react";
import type { Trpc } from "#data";
import { createCollectionSurface, useTRPC } from "#data";
import { selectCharacter, setActiveSection, startNewChat, useSelectedCharacterId } from "#state";
import type { CharacterCardItem } from "../components/character-card";
import { CharacterCardTile } from "../components/character-card";
import { filterCharacters } from "../lib/filter-characters";

/** Initial per-row height guess (px) — rows re-measure themselves after mount (the seal's job). */
const ESTIMATED_ROW_PX = 80;
const SKELETON_ROW_COUNT = 6;
/** Server-clamped page size (`domain/character/verbs/list.ts` DEFAULT_LIMIT/MAX_LIMIT — this just picks
 *  the per-fetch page size within that bound). */
const PAGE_LIMIT = 30;
/** The sliding-window cache bound (UI-Lib-TanStack-Query.md §4) — old pages drop as new ones load. */
const MAX_PAGES = 5;
/** Stable no-op for the card's DORMANT bulk-select seam (`onToggleSelect`) — no bulk-mode UI exists yet
 *  (the future bulk-ops lane wires it, the message-selection precedent). Module-level so it never churns. */
const NOOP_TOGGLE = (): void => undefined;

type CharacterListPage = inferOutput<Trpc["character"]["list"]>;
type CharacterLibraryItem = CharacterListPage["items"][number];

/** The one machine for this browse view (§13.1) — infinite query + `maxPages` + `keepPreviousData` +
 *  the virtual-list tail-fetch guard + selection, all baked. `query`/`itemsOf`/`idOf` are annotated
 *  (rather than passing explicit type args to `createCollectionSurface`) so `TPageParam`/`TKey` stay
 *  INFERRED from the real tRPC proxy return type — explicit args on a subset of the factory's generics
 *  would default the rest instead of inferring them, breaking the `TRPCQueryKey` branding. */
const useCharacterLibraryCollection = createCollectionSurface({
  query: (trpc: Trpc, _params: void) =>
    trpc.character.list.infiniteQueryOptions(
      { limit: PAGE_LIMIT },
      {
        // `initialCursor` (NOT `initialPageParam` — that's the factory's OUTPUT, auto-derived from
        // this + the input's own `cursor`, per `@trpc/tanstack-react-query`'s infiniteQueryOptions).
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        // The library never scrolls backward; `maxPages` still requires both direction getters.
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

/** The character library: search + the virtualized, infinitely-paged card list. */
export function CharacterLibrarySurface({
  ariaLabel = "Character library",
}: CharacterLibrarySurfaceProps): ReactElement {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query, "");
  const collection = useCharacterLibraryCollection({ trpc }, undefined);
  // The selected character (J9) — drives the row's `selected` skin AND the route's CONTENT swap to the
  // detail card. Lives in its OWN store (not the collection's local selection, which is the dormant
  // bulk-select seam), so the selection survives a windowed row unmount + is the route's single reader.
  const selectedId = useSelectedCharacterId();

  const filtered: readonly CharacterCardItem[] = filterCharacters(collection.items, deferredQuery);

  // The library → chat seam (UI-Arch §5.1): a writer-only touch of the shared stores — seed a fresh
  // draft with this character, then flip the rail to the Chats section so the route mounts it. NO
  // `#features/chat` import (dep-cruiser client-feature-front-door); the active-chat + shell stores are
  // the shared substrate below both features, so nothing chases an ambient active chat.
  const startChatWith = (id: string): void => {
    startNewChat({ characterIds: [castId<CharacterId>(id)] });
    setActiveSection("chats");
  };
  // Open a row's detail card (J9) — a writer-only store touch; the route reads `selectedCharacterId` and
  // renders the detail surface in the Characters CONTENT (no section flip — we're already here).
  const openDetail = (id: string): void => selectCharacter(castId<CharacterId>(id));

  return (
    <Stack className="h-full min-h-0" gap="block">
      <Input
        aria-label="Search characters"
        onValueChange={setQuery}
        placeholder="Search characters…"
        value={query}
      />
      <Stack className="min-h-0 flex-1">
        <CharacterLibraryBody
          ariaLabel={ariaLabel}
          error={collection.error}
          filtered={filtered}
          isEmpty={collection.isEmpty}
          isPending={collection.isPending}
          listProps={collection.listProps}
          onSelect={openDetail}
          onStartChat={startChatWith}
          query={deferredQuery}
          selectedId={selectedId}
        />
      </Stack>
    </Stack>
  );
}

interface CharacterLibraryBodyProps {
  readonly ariaLabel: string;
  readonly query: string;
  readonly isPending: boolean;
  readonly isEmpty: boolean;
  readonly error: unknown | null;
  readonly filtered: readonly CharacterCardItem[];
  readonly listProps: ReturnType<typeof useCharacterLibraryCollection>["listProps"];
  readonly selectedId: CharacterId | null;
  readonly onSelect: (id: string) => void;
  readonly onStartChat: (id: string) => void;
}

/** Loading → error → empty (no characters at all) → no-matches (a search with zero hits) → the list. */
function CharacterLibraryBody({
  ariaLabel,
  query,
  isPending,
  isEmpty,
  error,
  filtered,
  listProps,
  selectedId,
  onSelect,
  onStartChat,
}: CharacterLibraryBodyProps): ReactElement {
  if (isPending) {
    return <LoadingRows />;
  }
  if (error !== null) {
    return <ErrorState />;
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
    return (
      <EmptyState
        description={`No character matches "${query}".`}
        icon={<Icon icon={Search} size="lg" />}
        title="No matches"
      />
    );
  }

  return (
    // VirtualList itself has no aria surface (a bare scroll div) — the labelled region wraps it.
    <Stack aria-label={ariaLabel} className="h-full min-h-0" role="list">
      <VirtualList
        className="h-full"
        endApproachRows={listProps.endApproachRows}
        estimateSize={(): number => ESTIMATED_ROW_PX}
        gapToken="row"
        getItemKey={(item): string => item.id}
        items={filtered}
        onEndApproach={listProps.onEndApproach}
        renderItem={(item): ReactNode => (
          <CharacterCardTile
            character={item}
            onSelect={onSelect}
            onStartChat={onStartChat}
            onToggleSelect={NOOP_TOGGLE}
            selected={selectedId === item.id}
          />
        )}
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

/** The read-error surface. No Retry button: `createCollectionSurface` exposes no refetch handle. */
function ErrorState(): ReactElement {
  return (
    <Stack align="center" gap="row" justify="center" padding="section">
      <Text tone="muted">Couldn't load the character library.</Text>
    </Stack>
  );
}
