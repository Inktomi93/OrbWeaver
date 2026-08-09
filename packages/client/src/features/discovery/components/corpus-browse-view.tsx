// The corpus BROWSE view (the omnibox's rest state) — a facet filter bar over the owner's distilled
// catalog. genre/tone come from `discovery.characterFacets` and the tag axis from `discovery.catalog`'s
// top tags (each value carries its card count) and `sort` orders the result (recent/name). All four drive
// `discovery.browseCharacters`; each row selects a character into the dossier CONTENT. facets are
// suspense-read (stable); the filtered rows are a plain query so a filter change re-fetches without
// re-suspending the whole panel.
//
// ONE SEARCH INPUT IN THIS PANE (side-eye P2). This view used to carry its OWN free-text box ("Filter the
// catalog", a substring `q`) four rows under the omnibox — two inputs, both narrowing the same list, whose
// difference (substring vs semantic) is invisible to the person typing. The omnibox is the truer home: it
// is the pane's PRIMARY control, it carries suggestions, and it searches the whole corpus rather than one
// distilled catalog. So the second box is gone; free text is the omnibox's, FACETS are this view's. The
// `q` param on `browseCharacters` survives server-side for a future caller — no client sends it today.

import { Icon, Library } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { selectCorpusCharacter } from "#state";
import { characterFacetLine } from "../lib/character-facet.ts";
import { CharacterAvatar } from "./character-avatar.tsx";
import { ParamSelect } from "./corpus-controls.tsx";
import { CorpusRunJobEmptyState } from "./corpus-run-job-empty-state.tsx";

const ANY_VALUE = "";
const SKELETON_ROW_COUNT = 5;

const SORT_ITEMS: SelectItems<string> = [
  { value: ANY_VALUE, label: "Default" },
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
];

/** The distilled-catalog browser: facet + sort + tag selects and a substring filter, driving `browseCharacters`. */
export function CorpusBrowseView(): ReactElement {
  const trpc = useTRPC();
  const { data: facets } = useSuspenseQuery(trpc.discovery.characterFacets.queryOptions());
  const { data: catalog } = useSuspenseQuery(trpc.discovery.catalog.queryOptions());
  const [genre, setGenre] = useState(ANY_VALUE);
  const [tone, setTone] = useState(ANY_VALUE);
  const [tag, setTag] = useState(ANY_VALUE);
  const [sort, setSort] = useState(ANY_VALUE);
  const rows = useQuery(
    trpc.discovery.browseCharacters.queryOptions({
      ...(genre === ANY_VALUE ? {} : { genre }),
      ...(tone === ANY_VALUE ? {} : { tone }),
      ...(tag === ANY_VALUE ? {} : { tag }),
      ...(sort === ANY_VALUE ? {} : { sort: sort as "recent" | "name" }),
    }),
  );

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
        error={rows.error}
        isPending={rows.isPending}
        onRetry={rows.refetch}
        rows={rows.data ?? []}
        // An UNDISTILLED library and an over-narrow filter both produce zero rows and used to read the same
        // ("No characters match — distill your library, or loosen the filters"), which asks a first-run user
        // to loosen filters they never set (side-eye 2026-08-08 P1-2). `catalog.totalDistilled` is the
        // already-suspended read that tells the two apart.
        distilled={catalog.totalDistilled > 0}
      />
    </Stack>
  );
}

interface BrowseRow {
  readonly characterId: Parameters<typeof selectCorpusCharacter>[0];
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
  readonly avatarHash: string | null;
}

function BrowseRows({
  rows,
  isPending,
  error,
  onRetry,
  distilled,
}: {
  readonly rows: readonly BrowseRow[];
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly onRetry: () => void;
  readonly distilled: boolean;
}): ReactElement {
  if (isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (error !== null) {
    return <QueryErrorState label="the catalog" onRetry={onRetry} />;
  }
  if (rows.length === 0) {
    return distilled ? (
      <Stack align="center" className="p-block" gap="field">
        <Icon icon={Library} size="lg" />
        <Text>No characters match — loosen the filters.</Text>
      </Stack>
    ) : (
      <CorpusRunJobEmptyState title="No characters distilled yet" description="Run Distill characters to build this catalog." />
    );
  }
  return (
    <Stack aria-label="Distilled catalog" className="min-h-0 flex-1 overflow-y-auto overscroll-contain" gap="row" role="list">
      {rows.map((row) => (
        <BrowseCharacterRow key={row.characterId} row={row} />
      ))}
    </Stack>
  );
}

function BrowseCharacterRow({ row }: { readonly row: BrowseRow }): ReactElement {
  const facet = characterFacetLine(row.genre, row.tone);
  const subtitle = row.elevatorPitch ?? (facet === "" ? "Not distilled" : facet);
  return (
    <ListRow
      data-testid={testId("corpusBrowseRow")}
      clickable={true}
      onClick={(): void => selectCorpusCharacter(row.characterId)}
      leading={<CharacterAvatar id={row.characterId} name={row.name} hash={row.avatarHash} />}
      title={row.name}
      subtitle={subtitle}
    />
  );
}

function toSelectItems(allLabel: string, values: readonly { readonly value: string; readonly count: number }[]): SelectItems<string> {
  return [{ value: ANY_VALUE, label: allLabel }, ...values.map((v) => ({ value: v.value, label: `${v.value} (${v.count})` }))];
}
