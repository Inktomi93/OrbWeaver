import { blobIconUrl } from "@orb/contracts/assets";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Histogram } from "@orb/ui/histogram";
import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import type { CorpusDestination } from "#lib";
import { timeLib } from "#lib";
import { clearCorpusSelection, resumeChat, selectCorpusArtifact, selectCorpusCharacter } from "#state";
import { CorpusArtifactFrame } from "../components/corpus-artifact-frame.tsx";
import { CompareResult } from "../components/corpus-compare-tab.tsx";
import { CorpusSearchResults } from "../components/corpus-search-results.tsx";
import { corpusFamilyAnalysisLabel } from "../lib/corpus-archetype-presentation.ts";
import { percent } from "../lib/corpus-vocabulary.ts";
import { localThemeTimeline } from "../lib/story-time-folds.ts";
import { CorpusDossierSurface } from "./corpus-dossier-surface.tsx";
import { CorpusMomentSurface } from "./corpus-moment-surface.tsx";

const ASSET_DETAIL_ICON_WIDTH = 192;

// @orb-waive surface-a11y-focus(CorpusArtifactSurface): CorpusArtifactFrame and CorpusDossierSurface own their Back controls; corpus-artifact-surface.ct.tsx asserts the frame arrival target.
export function CorpusArtifactSurface({ destination }: { readonly destination: CorpusDestination }): ReactElement {
  switch (destination.kind) {
    case "character":
    case "distill":
      return <CorpusDossierSurface characterId={destination.characterId} onBack={clearCorpusSelection} />;
    case "scene":
    case "digest":
      return <CorpusMomentSurface destination={destination} />;
    case "theme":
      return <CorpusThemeSurface destination={destination} />;
    case "cluster":
      return <CorpusClusterSurface destination={destination} />;
    case "pair":
      return <CorpusPairSurface destination={destination} />;
    case "image":
      return <CorpusImageSurface destination={destination} />;
    case "keyword":
      return (
        <CorpusArtifactFrame title={destination.keyword}>
          <Text voice="gloss">
            {destination.frequency === null ? "Frequency unavailable" : `${destination.frequency} uses`} · {destination.frequencyScope}.
          </Text>
          <Section heading="Memory preview for this keyword">
            <CorpusSearchResults query={destination.keyword} targetId="digests" />
          </Section>
          <Section heading="Scene preview for this keyword">
            <CorpusSearchResults query={destination.keyword} targetId="discover" />
          </Section>
        </CorpusArtifactFrame>
      );
    case "modelroute":
      return (
        <CorpusArtifactFrame title={`${destination.route.genre} → ${destination.route.model}`}>
          <Text>
            {destination.route.generations} {destination.route.generations === 1 ? "generation" : "generations"} ·{" "}
            {destination.route.provider ?? "Provider not recorded"}
          </Text>
          <Text>
            Returned tokens:{" "}
            {destination.route.tokensOut === null ? "not recorded" : `${destination.route.tokensOut} (${destination.route.tokensOutProvenance})`}
          </Text>
          <Text>Cost: {destination.route.costUsd === null ? "not recorded" : `$${destination.route.costUsd.toFixed(2)} reported`}</Text>
          <Text>Average generation time: {destination.route.avgGenTimeMs === null ? "not recorded" : `${destination.route.avgGenTimeMs} ms`}</Text>
          <Text voice="gloss">
            Timing denominator: {destination.route.genTimeSamples} generations with both timestamps, out of {destination.route.generations} generations in this
            route.
          </Text>
          <Text voice="gloss">Aggregate only: tokens and cost cover available accounting; missing generations are not zero-valued observations.</Text>
        </CorpusArtifactFrame>
      );
    default:
      return assertDestinationNever(destination);
  }
}

function assertDestinationNever(destination: never): never {
  throw new Error(`Unrendered Corpus destination: ${String(destination)}`);
}

function CorpusThemeSurface({ destination }: { readonly destination: Extract<CorpusDestination, { kind: "theme" }> }): ReactElement {
  return (
    <CorpusArtifactFrame title={destination.row.name ?? "Unnamed story theme"}>
      <QueryBoundary
        reserveKey="corpus.themeDetail"
        fallback={<SkeletonRows count={3} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the story theme" onRetry={retry} />}
      >
        <CorpusThemeBody destination={destination} />
      </QueryBoundary>
    </CorpusArtifactFrame>
  );
}

function CorpusThemeBody({ destination }: { readonly destination: Extract<CorpusDestination, { kind: "theme" }> }): ReactElement {
  const trpc = useTRPC();
  const { data: detail } = useSuspenseQuery(trpc.discovery.themeDetail.queryOptions({ clusterIdx: destination.row.clusterIdx, level: destination.row.level }));
  if (detail === null || detail.id !== destination.row.id) {
    return <Text role="status">This story theme was replaced by another analysis pass. Its selected identity is retained.</Text>;
  }
  const timeline = localThemeTimeline(detail.timeline, timeLib.calendarPosition);
  return (
    <Stack gap="block">
      <Text>
        {detail.size} digests · {detail.level}
      </Text>
      {timeline.length === 0 ? null : (
        <Section heading="Story time">
          <Histogram
            buckets={timeline.map(({ month, count }) => ({ label: timeLib.formatMonthYear(month.start), count }))}
            label="Digests per story-time month"
          />
        </Section>
      )}
      <Section heading="Characters">
        {detail.members.map((member) => (
          <ListRow
            key={member.characterId}
            clickable={true}
            title={member.name}
            subtitle={`${member.count} digests`}
            onClick={(): void => selectCorpusCharacter(member.characterId)}
          />
        ))}
      </Section>
      <Section heading="Source digests">
        <Text voice="gloss">
          Showing {detail.sources.length} source digests from this theme, up to {detail.sourceLimit}. Each is a generated summary.
        </Text>
        {detail.sources.length === 0 ? (
          <Text>No source rows remain readable.</Text>
        ) : (
          detail.sources.map((source) => (
            <ListRow
              key={source.source.rowId}
              clickable={true}
              title={source.chatTitle ?? source.scopedCharacterName ?? "Untitled chat"}
              subtitle={source.text}
              subtitleWrap={true}
              onClick={(): void => selectCorpusArtifact({ kind: "digest", hit: source, rank: null })}
            />
          ))
        )}
      </Section>
      <Text voice="gloss">Character counts describe the whole theme; source digests are a bounded preview.</Text>
    </Stack>
  );
}

function CorpusClusterSurface({ destination }: { readonly destination: Extract<CorpusDestination, { kind: "cluster" }> }): ReactElement {
  const trpc = useTRPC();
  const opts = destination.k === null ? {} : { k: destination.k };
  const writing = useQuery(trpc.discovery.archetypes.queryOptions(opts, { enabled: !destination.visual }));
  const visual = useQuery(trpc.discovery.visualArchetypes.queryOptions(opts, { enabled: destination.visual }));
  const read = destination.visual ? visual : writing;
  const analysis = "analysedMembers" in destination.cluster ? corpusFamilyAnalysisLabel(destination.cluster) : null;
  return (
    <CorpusArtifactFrame title={destination.title}>
      <Text voice="gloss">Generated grouping; names may change when analysis reruns.</Text>
      {analysis === null ? null : <Text voice="gloss">{analysis}</Text>}
      <Text>
        {destination.cluster.size} {destination.cluster.size === 1 ? "member" : "members"} · {destination.cluster.model}
      </Text>
      {read.isSuccess &&
      !read.data.some(
        (cluster) =>
          cluster.passId === destination.cluster.passId &&
          cluster.members
            .map((member) => member.characterId)
            .toSorted()
            .join("|") ===
            destination.cluster.members
              .map((member) => member.characterId)
              .toSorted()
              .join("|"),
      ) ? (
        <Text role="status">This grouping changed after recompute. Showing the selected membership snapshot.</Text>
      ) : null}
      {read.isError ? <QueryErrorState label="the current grouping" onRetry={read.refetch} /> : null}
      <Stack gap="row" role="list">
        {destination.cluster.members.map((member) => (
          <Stack key={member.characterId} role="listitem">
            <ListRow clickable={true} title={member.name} onClick={(): void => selectCorpusCharacter(member.characterId)} />
          </Stack>
        ))}
      </Stack>
    </CorpusArtifactFrame>
  );
}

function CorpusPairSurface({ destination }: { readonly destination: Extract<CorpusDestination, { kind: "pair" }> }): ReactElement {
  const pair = destination.pair;
  return (
    <CorpusArtifactFrame title={`${pair.nameA} ↔ ${pair.nameB}`}>
      <Text voice="gloss">Similarity: {pair.score === null ? "not recorded" : percent(pair.score)}</Text>
      {pair.kind === "chats" ? (
        <>
          <Text>{pair.relation}</Text>
          <Button intent="secondary" onClick={(): void => resumeChat(pair.idA)}>
            Open {pair.nameA}
          </Button>
          <Button intent="secondary" onClick={(): void => resumeChat(pair.idB)}>
            Open {pair.nameB}
          </Button>
        </>
      ) : (
        <CharacterPair pair={pair} />
      )}
    </CorpusArtifactFrame>
  );
}

function CharacterPair({ pair }: { readonly pair: Extract<Extract<CorpusDestination, { kind: "pair" }>["pair"], { kind: "characters" }> }): ReactElement {
  const [deep, setDeep] = useState(false);
  return (
    <Stack gap="block">
      <CompareResult idA={pair.idA} idB={pair.idB} deep={deep} onDeep={(): void => setDeep(true)} />
      <Button intent="secondary" onClick={(): void => selectCorpusCharacter(pair.idA)}>
        Open {pair.nameA}
      </Button>
      <Button intent="secondary" onClick={(): void => selectCorpusCharacter(pair.idB)}>
        Open {pair.nameB}
      </Button>
    </Stack>
  );
}

function CorpusImageSurface({ destination }: { readonly destination: Extract<CorpusDestination, { kind: "image" }> }): ReactElement {
  const hit = destination.hit;
  const characterId = hit.characterId;
  return (
    <CorpusArtifactFrame title={hit.caption ?? "Indexed image"}>
      <Avatar src={blobIconUrl(hit.hash, ASSET_DETAIL_ICON_WIDTH)} aria-label={hit.caption ?? "Indexed image"} hueSeed={hit.hash} size="hero" shape="rounded" />
      <Text>{hit.caption ?? "No caption recorded."}</Text>
      <Text voice="gloss">{hit.characterName === null ? "This asset is not worn by a character." : `Worn by ${hit.characterName}.`}</Text>
      {characterId === null ? null : (
        <Button intent="secondary" onClick={(): void => selectCorpusCharacter(characterId)}>
          Open wearing character
        </Button>
      )}
    </CorpusArtifactFrame>
  );
}
