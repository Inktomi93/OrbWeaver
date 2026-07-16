// The corpus BROWSE view (the omnibox's rest state) — a facet filter bar over the owner's distilled
// catalog. genre/tone come from `discovery.characterFacets` and the tag axis from `discovery.catalog`'s
// top tags (each value carries its card count); `sort` orders the result (recent/name) and the free-text
// `q` is a catalog substring filter (distinct from the omnibox's semantic search). All five drive
// `discovery.browseCharacters`; each row selects a character into the dossier CONTENT. facets are
// suspense-read (stable); the filtered rows are a plain query so a filter change re-fetches without
// re-suspending the whole panel.

import { Icon, Library } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useState } from "react";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { selectCorpusCharacter } from "#state";
import { characterFacetLine } from "../lib/character-facet";
import { CharacterAvatar } from "./character-avatar";
import { ParamSelect } from "./corpus-controls";

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
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);

  const trimmedQ = deferredQ.trim();
  const rows = useQuery(
    trpc.discovery.browseCharacters.queryOptions({
      ...(genre === ANY_VALUE ? {} : { genre }),
      ...(tone === ANY_VALUE ? {} : { tone }),
      ...(tag === ANY_VALUE ? {} : { tag }),
      ...(sort === ANY_VALUE ? {} : { sort: sort as "recent" | "name" }),
      ...(trimmedQ === "" ? {} : { q: trimmedQ }),
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
      <Input aria-label="Filter the catalog" onValueChange={setQ} placeholder="Filter by name or tag…" value={q} />
      <BrowseRows error={rows.error} isPending={rows.isPending} onRetry={rows.refetch} rows={rows.data ?? []} />
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
}: {
  readonly rows: readonly BrowseRow[];
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly onRetry: () => void;
}): ReactElement {
  if (isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (error !== null) {
    return <QueryErrorState label="the catalog" onRetry={onRetry} />;
  }
  if (rows.length === 0) {
    return (
      <Stack align="center" className="p-block" gap="field">
        <Icon icon={Library} size="lg" />
        <Text tone="muted">No characters match — distill your library, or loosen the filters.</Text>
      </Stack>
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
