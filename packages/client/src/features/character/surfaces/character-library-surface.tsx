// THE character library surface (UI-Arch §2.1 CONSUMER tier) — a browse/grid of the caller's owned
// characters: a search box (`useDeferredValue`) over a virtualized list of `<CharacterCard>` rows, with
// the loading/error/empty states every read needs. Selecting a row only highlights it today (a stub — the
// character detail/editor surface is a later task; per the build brief this file does NOT fabricate one).
//
// MISSING-API NOTE (flagged for the coordinator, per the build brief's "genuinely absent → report, don't
// invent" instruction): `UI-Primitives-and-Reuse.md` §13.1 prescribes `createCollectionSurface` (the
// `useInfiniteQuery` + `maxPages` + tail-fetch machine) for every browse view. It is NOT used here because
// `trpc.character.list` cannot satisfy it — `character.list` (transport/trpc/routers/character.ts) takes
// NO input and its domain verb (`domain/character/verbs/list.ts` → `ListCharactersParams = {principal}`,
// `domain/character/persistence/queries.ts` `listOwnedCharactersWithAvatar`) has no cursor/limit at ALL;
// it returns the owner's FULL character array in one shot. `createCollectionSurface`'s `query` config
// literally calls `t.character.list.infiniteQueryOptions(...)` — a method the tRPC proxy only exposes for
// a procedure whose input carries a cursor, so this doesn't even type-check against the current shape.
// Wiring real pagination needs a domain change (a cursor/limit param + a bounded, ordered query + a
// `{items, nextCursor}` result — the `domain/notifications/verbs/list.ts` shape is the established
// sibling precedent), which lives in `packages/server/src/domain/character/**` — outside this task's
// disjoint file set (only the ROUTER was in-scope for a THIN pass-through, and there is nothing on the
// domain side yet to pass through). Slicing the array in the router itself would put business logic in
// the transport tier (`Tier-4-Transport.md`: "Thin: validate → ctx.services.character.<verb> → map
// errors" — pagination is not a validate/map step), so that's not a legal workaround either.
//
// Interim (this file): the full unpaged list via `useSuspenseQuery` + `<QueryBoundary>` — the SAME
// pattern `features/chat/surfaces/message-list-surface.tsx` already uses (its own header flags the same
// `useGatedQuery` type-compat gap) and the one `tests/client/data/_ct-stories.tsx`
// (`trpc.tag.listTags.queryOptions()`) exercises for another zero-input list read. Search still runs
// through `useDeferredValue` client-side (§4a) — there is no server-side search param either, so this is
// filtering the one page already in hand, not a second missing verb.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the rail-slots.ts / spinner.tsx precedent).
import { Icon, Search, Users } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useDeferredValue, useState } from "react";
import { QueryBoundary, useTRPC } from "#data";
import type { CharacterCardItem } from "../components/character-card";
import { CharacterCard } from "../components/character-card";
import { filterCharacters } from "../lib/filter-characters";

/** Initial per-row height guess (px) — rows re-measure themselves after mount (the seal's job). */
const ESTIMATED_ROW_PX = 80;
const SKELETON_ROW_COUNT = 6;

export interface CharacterLibrarySurfaceProps {
  readonly ariaLabel?: string;
}

/** The character library: search + the virtualized card list. */
export function CharacterLibrarySurface({
  ariaLabel = "Character library",
}: CharacterLibrarySurfaceProps): ReactElement {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query, "");

  return (
    <Stack className="h-full min-h-0" gap="block">
      <Input
        aria-label="Search characters"
        onValueChange={setQuery}
        placeholder="Search characters…"
        value={query}
      />
      <Stack className="min-h-0 flex-1">
        <QueryBoundary
          fallback={<LoadingRows />}
          renderError={(_error, retry): ReactElement => <ErrorState onRetry={retry} />}
        >
          <CharacterList ariaLabel={ariaLabel} query={deferredQuery} />
        </QueryBoundary>
      </Stack>
    </Stack>
  );
}

interface CharacterListProps {
  readonly query: string;
  readonly ariaLabel: string;
}

/** Suspends on the full owned-character read, then filters + renders it virtualized. */
function CharacterList({ query, ariaLabel }: CharacterListProps): ReactElement {
  const trpc = useTRPC();
  const { data: characters } = useSuspenseQuery(trpc.character.list.queryOptions());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered: readonly CharacterCardItem[] = filterCharacters(characters, query);

  if (characters.length === 0) {
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

  const toggleSelect = (id: string): void => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    // VirtualList itself has no aria surface (a bare scroll div) — the labelled region wraps it.
    <Stack aria-label={ariaLabel} className="h-full min-h-0" role="list">
      <VirtualList
        className="h-full"
        estimateSize={(): number => ESTIMATED_ROW_PX}
        gapToken="row"
        getItemKey={(item): string => item.id}
        items={filtered}
        renderItem={(item): ReactNode => (
          <CharacterCard
            character={item}
            onToggleSelect={toggleSelect}
            selected={item.id === selectedId}
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

/** The read-error surface — the QueryBoundary retry actually refetches (the reset handshake). */
function ErrorState({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <Stack align="center" gap="row" justify="center" padding="section">
      <Text tone="muted">Couldn't load the character library.</Text>
      <Button intent="ghost" onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  );
}
