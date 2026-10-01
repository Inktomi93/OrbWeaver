// The corpus BROWSE view (the omnibox's rest state) — a facet filter bar over the owner's distilled
// catalog. genre/tone come from `discovery.characterFacets` and the tag axis from `discovery.catalog`'s
// top tags (each value carries its card count) and `sort` orders the result (recent/name). All four drive
// `discovery.browseCharacters`; each row selects a character into the dossier CONTENT. facets are
// suspense-read (stable); the rows are a keyset-paged `createCollectionSurface` so a filter change
// re-fetches without re-suspending the whole panel.
//
// ONE SEARCH INPUT IN THIS PANE (side-eye P2). This view used to carry its OWN free-text box ("Filter the
// catalog", a substring `q`) four rows under the omnibox — two inputs, both narrowing the same list, whose
// difference (substring vs semantic) is invisible to the person typing. The omnibox is the truer home: it
// is the pane's PRIMARY control, it carries suggestions, and it searches the whole corpus rather than one
// distilled catalog. So the second box is gone; free text is the omnibox's, FACETS are this view's. The
// `q` param on `browseCharacters` survives server-side for a future caller — no client sends it today.
//
// EVERY DISTILLED CARD IS REACHABLE, AND THE LIST IS WINDOWED (A8 + C5, side-eye corpus re-pass 2026-08-19).
// Two defects with one shape:
//   • The pane's header printed `CORPUS 313` (`discovery.catalog.totalDistilled`) over a list that stopped
//     at the verb's silent 200-row ceiling with no load-more — 113 owned characters unreachable from the
//     only surface that browses them. `browseCharacters` is keyset-paged now and this view walks it through
//     the shared `createCollectionSurface`, so the tail fetches itself as you approach it.
//   • Those 200 rows all rendered at once: `region:list count 21 (20 updates) maxMs 99`, an 89ms slow
//     commit, inside the 654ms corpus-mount long frame. `<VirtualList>` bounds the DOM to the window
//     regardless of how many pages have accumulated — which is also why paging does not need a page CAP
//     (the character library's ruling: an evicted head page is rows vanishing off the top).
// The list's `role="list"`/`listitem` chain comes from `VirtualList` itself (it emits both, plus
// setsize/posinset), so A6's hand-wrapped `<Stack role="listitem">` around each row is GONE rather than
// nested inside the primitive's own — two lists is the defect A6 fixed, spelled a second way.

import type { BrowseSort } from "@orb/contracts/discovery";
import { Button } from "@orb/ui/button";
import { Icon, Library } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { createCollectionSurface, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { selectCorpusArtifact } from "#state";
import { characterFacetLine } from "../lib/character-facet.ts";
import { openCorpusOverview } from "../lib/corpus-overview-door.ts";
import { CharacterAvatar } from "./character-avatar.tsx";
import { ParamSelect } from "./corpus-controls.tsx";
import { CorpusRunJobEmptyState } from "./corpus-run-job-empty-state.tsx";

const ANY_VALUE = "";
const SKELETON_ROW_COUNT = 5;
/** The row's first-paint height guess (avatar + title + subtitle); every row re-measures after mount. */
const ESTIMATED_ROW_PX = 60;

const SORT_ITEMS: SelectItems<string> = [
  { value: ANY_VALUE, label: "Default" },
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
];

type BrowsePage = inferOutput<Trpc["discovery"]["browseCharacters"]>;
type BrowseRow = BrowsePage["items"][number];

/** The pane's whole lens, as query INPUT — every field is part of the query key, so changing one re-keys
 *  the run rather than filtering a stale window (the character library's ruling). `""` is UNFILTERED. */
interface CorpusBrowseParams {
  readonly genre: string;
  readonly tone: string;
  readonly tag: string;
  readonly sort: string;
}

// NO `maxPages`, for the library surface's reason: the DOM cost is already bounded by `<VirtualList>`, and
// a windowed page cache evicts the HEAD — rows disappearing off the top of a list you are scrolling.
const useCorpusBrowseCollection = createCollectionSurface({
  query: (trpc: Trpc, params: CorpusBrowseParams) =>
    trpc.discovery.browseCharacters.infiniteQueryOptions(
      {
        ...(params.genre === ANY_VALUE ? {} : { genre: params.genre }),
        ...(params.tone === ANY_VALUE ? {} : { tone: params.tone }),
        ...(params.tag === ANY_VALUE ? {} : { tag: params.tag }),
        ...(params.sort === ANY_VALUE ? {} : { sort: params.sort as BrowseSort }),
      },
      { initialCursor: null, getNextPageParam: (lastPage) => lastPage.nextCursor, getPreviousPageParam: () => undefined },
    ),
  itemsOf: (page: BrowsePage) => page.items,
  idOf: (item: BrowseRow) => item.characterId,
  totalOf: (page: BrowsePage) => page.totalCount,
});

/** The distilled-catalog browser: facet + sort + tag selects over the keyset-paged `browseCharacters`. */
export function CorpusBrowseView(): ReactElement {
  const trpc = useTRPC();
  const { data: facets } = useSuspenseQuery(trpc.discovery.characterFacets.queryOptions());
  const { data: catalog } = useSuspenseQuery(trpc.discovery.catalog.queryOptions());
  const [genre, setGenre] = useState(ANY_VALUE);
  const [tone, setTone] = useState(ANY_VALUE);
  const [tag, setTag] = useState(ANY_VALUE);
  const [sort, setSort] = useState(ANY_VALUE);
  const collection = useCorpusBrowseCollection({ trpc }, { genre, tone, tag, sort });

  const genreItems = toSelectItems("All genres", facets.genres);
  const toneItems = toSelectItems("All tones", facets.tones);
  const tagItems = toSelectItems(
    "All tags",
    catalog.topTags.map((t) => ({ value: t.tag, count: t.count })),
  );

  return (
    <Stack className="min-h-0 flex-1" data-testid={testId("corpusBrowseView")} gap="block">
      <Row align="center" gap="field" className="flex-wrap">
        <ParamSelect label="Genre" value={genre} items={genreItems} onValueChange={setGenre} />
        <ParamSelect label="Tone" value={tone} items={toneItems} onValueChange={setTone} />
        <ParamSelect label="Tag" value={tag} items={tagItems} onValueChange={setTag} />
        <ParamSelect label="Sort" value={sort} items={SORT_ITEMS} onValueChange={setSort} />
      </Row>
      <BrowseRows
        collection={collection}
        // An UNDISTILLED library and an over-narrow filter both produce zero rows and used to read the same
        // ("No characters match — distill your library, or loosen the filters"), which asks a first-run user
        // to loosen filters they never set (side-eye 2026-08-08 P1-2). `catalog.totalDistilled` is the
        // already-suspended read that tells the two apart.
        distilled={catalog.totalDistilled > 0}
      />
    </Stack>
  );
}

function BrowseRows({
  collection,
  distilled,
}: {
  readonly collection: ReturnType<typeof useCorpusBrowseCollection>;
  readonly distilled: boolean;
}): ReactElement {
  if (collection.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (collection.error !== null) {
    return <QueryErrorState label="the catalog" onRetry={collection.refetch} />;
  }
  if (collection.items.length === 0) {
    return distilled ? (
      <Stack align="center" className="p-block" gap="field">
        <Icon icon={Library} size="lg" />
        <Text>No characters match — loosen the filters.</Text>
      </Stack>
    ) : (
      // The overview owns the run control; this door reaches it when the finder is the phone screen.
      <Stack gap="field" align="center">
        <CorpusRunJobEmptyState title="No characters distilled yet" description="Run Distill characters to build this catalog." offerDoor={false} />
        <Button intent="secondary" size="sm" onClick={openCorpusOverview}>
          Open understanding pass
        </Button>
      </Stack>
    );
  }
  return (
    // The bounded height is this Stack's — `VirtualList` throws at mount on an unbounded scroll element,
    // which is the primitive refusing to be a list that silently renders everything.
    <Stack className="min-h-0 flex-1">
      <VirtualList
        aria-label="Distilled catalog"
        className="h-full"
        endApproachRows={collection.listProps.endApproachRows}
        estimateSize={(): number => ESTIMATED_ROW_PX}
        fadeEdge={true}
        gapToken="row"
        getItemKey={collection.listProps.getItemKey}
        items={collection.items}
        onEndApproach={collection.listProps.onEndApproach}
        renderItem={(row): ReactElement => <BrowseCharacterRow row={row} />}
      />
    </Stack>
  );
}

function BrowseCharacterRow({ row }: { readonly row: BrowseRow }): ReactElement {
  const facet = characterFacetLine(row.genre, row.tone);
  const subtitle = row.elevatorPitch ?? (facet === "" ? "Not distilled" : facet);
  return (
    <ListRow
      clickable={true}
      onClick={(): void => selectCorpusArtifact({ kind: "distill", characterId: row.characterId })}
      leading={<CharacterAvatar id={row.characterId} name={row.name} hash={row.avatarHash} />}
      title={row.name}
      subtitle={subtitle}
    />
  );
}

function toSelectItems(allLabel: string, values: readonly { readonly value: string; readonly count: number }[]): SelectItems<string> {
  return [{ value: ANY_VALUE, label: allLabel }, ...values.map((v) => ({ value: v.value, label: `${v.value} (${v.count})` }))];
}
