// The Corpus CONTEXT "Visuals" tab — the avatar-lens analytics grouped in one home. `portraitAlignment`
// is the corpus-wide portrait↔card fit (summary stats + the worst-matched art, each row drilling to its
// dossier); `imageFacets` is the caption-facet explorer (pick a facet → its distribution as a bar-list),
// and picking a value drives `charactersByImageFacet` to the avatars carrying it. Read-only analytics.

import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { SelectItems } from "@orb/ui/select";
import { StatFigure } from "@orb/ui/stat-figure";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { selectCorpusCharacter } from "#state";
import { toBarItems } from "../lib/corpus-charts.ts";
import { CharacterAvatar } from "./character-avatar.tsx";
import { ParamSelect } from "./corpus-controls.tsx";

type ImageFacets = inferOutput<Trpc["discovery"]["imageFacets"]>;
type FacetKey = inferInput<Trpc["discovery"]["charactersByImageFacet"]>["facet"];
type PortraitReport = inferOutput<Trpc["discovery"]["portraitAlignment"]>;

const ALIGNMENT_PRECISION = 2;
const WORST_LIMIT = 12;
const SKELETON_ROW_COUNT = 4;
const NO_VALUE = "";

/** The caption facets a user can explore, each paired with the ImageFacets field its distribution lives in. */
interface FacetView {
  readonly key: FacetKey;
  readonly label: string;
  readonly pick: (facets: ImageFacets) => ImageFacets["artStyles"];
}
const FACET_VIEWS = [
  { key: "artStyle", label: "Art style", pick: (f): ImageFacets["artStyles"] => f.artStyles },
  { key: "rating", label: "Rating", pick: (f): ImageFacets["artStyles"] => f.ratings },
  { key: "shotType", label: "Shot type", pick: (f): ImageFacets["artStyles"] => f.shotTypes },
  {
    key: "cameraAngle",
    label: "Camera angle",
    pick: (f): ImageFacets["artStyles"] => f.cameraAngles,
  },
  { key: "gender", label: "Gender", pick: (f): ImageFacets["artStyles"] => f.genders },
  { key: "coverage", label: "Coverage", pick: (f): ImageFacets["artStyles"] => f.coverage },
  { key: "bodyType", label: "Body type", pick: (f): ImageFacets["artStyles"] => f.bodyTypes },
  { key: "outfitType", label: "Outfit", pick: (f): ImageFacets["artStyles"] => f.outfitTypes },
  { key: "tag", label: "Caption tags", pick: (f): ImageFacets["artStyles"] => f.topTags },
] as const satisfies readonly FacetView[];

export function CorpusVisualsTab(): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the visuals" onRetry={retry} />}
    >
      <VisualsBody />
    </QueryBoundary>
  );
}

function VisualsBody(): ReactElement {
  const trpc = useTRPC();
  const { data: facets } = useSuspenseQuery(trpc.discovery.imageFacets.queryOptions());
  const { data: portrait } = useSuspenseQuery(trpc.discovery.portraitAlignment.queryOptions());

  return (
    <Stack className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid={testId("corpusVisualsTab")} gap="section">
      <PortraitFit report={portrait} />
      <FacetExplorer facets={facets} />
    </Stack>
  );
}

function PortraitFit({ report }: { readonly report: PortraitReport }): ReactElement {
  return (
    <Section heading="Portrait fit">
      {report.count === 0 ? (
        <Text voice="gloss">No portrait↔card alignment computed yet.</Text>
      ) : (
        <Stack gap="block">
          <Row gap="block" className="flex-wrap">
            <StatFigure label="Scored" value={report.count.toString()} />
            <StatFigure label="Mean fit" value={report.mean.toFixed(ALIGNMENT_PRECISION)} />
            <StatFigure label="Median fit" value={report.median.toFixed(ALIGNMENT_PRECISION)} />
          </Row>
          <Text voice="kicker">Worst-matched art</Text>
          <Stack gap="row" role="list">
            {report.characters.slice(0, WORST_LIMIT).map((character) => (
              <ListRow
                key={character.characterId}
                clickable={true}
                onClick={(): void => selectCorpusCharacter(character.characterId)}
                leading={<CharacterAvatar id={character.characterId} name={character.name} hash={character.avatarHash} />}
                title={character.name}
                subtitle={[character.artStyle, character.rating].filter((v) => v !== null && v !== "").join(" · ")}
                actions={
                  <Badge intent="neutral" size="sm">
                    {character.alignment.toFixed(ALIGNMENT_PRECISION)}
                  </Badge>
                }
              />
            ))}
          </Stack>
        </Stack>
      )}
    </Section>
  );
}

function FacetExplorer({ facets }: { readonly facets: ImageFacets }): ReactElement {
  const [facetKey, setFacetKey] = useState<FacetKey>(FACET_VIEWS[0].key);
  const [value, setValue] = useState(NO_VALUE);

  const view = FACET_VIEWS.find((v) => v.key === facetKey) ?? FACET_VIEWS[0];
  const rows = view.pick(facets);

  const facetItems: SelectItems<string> = FACET_VIEWS.map((v) => ({
    value: v.key,
    label: v.label,
  }));
  const valueItems: SelectItems<string> = [
    { value: NO_VALUE, label: "Drill a value…" },
    ...rows.map((row) => ({ value: row.value, label: `${row.value} (${row.count})` })),
  ];

  const onFacet = (next: string): void => {
    setFacetKey(next as FacetKey);
    setValue(NO_VALUE);
  };

  return (
    <Section heading="Visual facets">
      {facets.total === 0 ? (
        <Text voice="gloss">No captioned avatars to explore yet.</Text>
      ) : (
        <Stack gap="block" data-testid={testId("corpusFacetDrill")}>
          <Row gap="block" className="flex-wrap">
            <ParamSelect label="Facet" value={facetKey} items={facetItems} onValueChange={onFacet} />
            <ParamSelect label="Value" value={value} items={valueItems} onValueChange={setValue} />
          </Row>
          {rows.length === 0 ? (
            <Text voice="gloss">No {view.label.toLowerCase()} captioned yet.</Text>
          ) : (
            <BarList
              label={view.label}
              items={toBarItems(
                rows,
                (row) => row.value,
                (row) => row.count,
              )}
            />
          )}
          {value === NO_VALUE ? null : <FacetDrill facet={facetKey} value={value} />}
        </Stack>
      )}
    </Section>
  );
}

function FacetDrill({ facet, value }: { readonly facet: FacetKey; readonly value: string }): ReactElement {
  const trpc = useTRPC();
  const members = useQuery(trpc.discovery.charactersByImageFacet.queryOptions({ facet, value }));

  if (members.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (members.error !== null) {
    return <QueryErrorState label="those avatars" onRetry={members.refetch} />;
  }
  if (members.data.length === 0) {
    return <Text voice="gloss">No avatars carry “{value}”.</Text>;
  }
  return (
    <Stack gap="row" role="list">
      {members.data.map((member) => (
        <ListRow
          key={member.characterId}
          clickable={true}
          onClick={(): void => selectCorpusCharacter(member.characterId)}
          leading={<CharacterAvatar id={member.characterId} name={member.name} hash={member.avatarHash} />}
          title={member.name}
          subtitle={member.caption ?? ""}
        />
      ))}
    </Stack>
  );
}
