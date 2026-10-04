// The Corpus omnibox dispatches typed search results into readable artifact destinations.
// Disclosure comes from the response metadata; repeated prose retains every source occurrence.

import { SEARCH_SPACE_REINDEXING } from "@orb/contracts/search";
import { Button } from "@orb/ui/button";
import { Icon, Search } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEmbedderRebuild } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { REBUILD_JOBS_LABEL, SEARCH_PAUSED_COPY, trpcErrorReason } from "#lib";
import { openChatMoment, openConfigTo } from "#state";
import { groupByEvidence, snippetForDisplay } from "../lib/corpus-result-text.ts";
import { CORPUS_IMAGE_LENS, CORPUS_SEARCH_TOP_N, isNearestOnly, resolveSearchTarget } from "../lib/corpus-search-targets.ts";
import { percent } from "../lib/corpus-vocabulary.ts";
import { CharacterHitRow, DigestHitRow, DiscoverHitRow, ImageHitRow } from "./corpus-hit-rows.tsx";
import { CorpusResultsList } from "./corpus-results-list.tsx";
import { CorpusSearchDisclosure } from "./corpus-search-disclosure.tsx";

type UnifiedResult = inferOutput<Trpc["search"]["search"]>;
type UnifiedOver = Extract<ReturnType<typeof resolveSearchTarget>, { kind: "unified" }>["over"];

const SKELETON_ROW_COUNT = 5;

export interface CorpusSearchResultsProps {
  readonly query: string;
  readonly targetId: string;
  readonly retainFinderScroll?: boolean;
  /** Switch this surface to the lexical text target, which still answers while vector search is paused. Absent: the
   *  surface has no target picker, so a paused search offers no switch. */
  readonly onTextInstead?: (() => void) | undefined;
}

/** Dispatch to the engine the active target names — the unified `search.search`, or the lexical `fields`. */
export function CorpusSearchResults({ query, targetId, retainFinderScroll = false, onTextInstead }: CorpusSearchResultsProps): ReactElement {
  const target = resolveSearchTarget(targetId);
  if (target.kind === "fields") {
    return <FieldsResults query={query} label={target.label} retainFinderScroll={retainFinderScroll} />;
  }
  return <UnifiedResults query={query} over={target.over} label={target.label} retainFinderScroll={retainFinderScroll} onTextInstead={onTextInstead} />;
}

/** Run the unified search for the active target + render the discriminated result. */
function UnifiedResults({
  query,
  over,
  label,
  retainFinderScroll,
  onTextInstead,
}: {
  readonly query: string;
  readonly over: UnifiedOver;
  readonly label: string;
  readonly retainFinderScroll: boolean;
  readonly onTextInstead: (() => void) | undefined;
}): ReactElement {
  const trpc = useTRPC();
  const trimmed = query.trim();
  const result = useQuery(
    trpc.search.search.queryOptions(
      {
        query: trimmed,
        topN: CORPUS_SEARCH_TOP_N,
        over,
        scope: { kind: "owner" },
        ...(over === "images" ? { lens: CORPUS_IMAGE_LENS } : {}),
      },
      { enabled: trimmed !== "" },
    ),
  );

  if (result.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (result.error !== null) {
    return trpcErrorReason(result.error) === SEARCH_SPACE_REINDEXING ? (
      <SearchPaused over={over} onTextInstead={onTextInstead} />
    ) : (
      <QueryErrorState label="the search" onRetry={result.refetch} />
    );
  }

  const shown = result.data;
  const resultCount = shown.hits.length + (shown.over === "discover" ? shown.standaloneSegments.length : 0);
  if (resultCount === 0) {
    return (
      <>
        <CorpusSearchDisclosure result={shown} />
        <NoMatches label={label} query={trimmed} lexical={false} />
      </>
    );
  }

  // COSINE ALWAYS ANSWERS (side-eye corpus re-pass #3, P2-B). `zzqqxwvfoobarbaz` returned twenty rows and
  // the live region announced them as results: the surface structurally could not reach a "nothing here is
  // close" state, because a nearest-neighbour engine has no empty arm. It says so now instead — and it says
  // it WITHOUT hiding a row, which the measurement beside `CORPUS_NEAREST_ONLY_BELOW` is the receipt for.
  const relevances = relevancesOf(shown);
  const nearestOnly = isNearestOnly(over, relevances);

  return (
    <>
      <ResultsStatus count={resultCount} label={label} nearestOnly={nearestOnly} />
      <CorpusSearchDisclosure result={shown} />
      {nearestOnly ? <NearestOnlyBanner best={Math.max(...relevances)} /> : null}
      <CorpusResultsList label={label} retainFinderScroll={retainFinderScroll}>
        <ResultBranch data={shown} />
      </CorpusResultsList>
    </>
  );
}

/** Vector search refuses while the owner's index moves to a new embedder: say so, say whether the rebuild is running
 *  or failed, and offer the two ways on: the rebuild's jobs, and the text search, which does not wait on the index. */
function SearchPaused({ over, onTextInstead }: { readonly over: UnifiedOver; readonly onTextInstead: (() => void) | undefined }): ReactElement {
  const trpc = useTRPC();
  const rebuild = useEmbedderRebuild(trpc, true, over === "images" ? "imageEmbed" : "embed");
  return (
    <Stack data-slot="search-paused" data-rebuild={rebuild ?? "unknown"} gap="field">
      <Text role="status" voice="gloss">
        {SEARCH_PAUSED_COPY[rebuild ?? "unknown"]}
      </Text>
      <Row className="flex-wrap" gap="field">
        <Button intent="secondary" onClick={(): void => openConfigTo("workloads", "jobs")} size="sm" type="button">
          {REBUILD_JOBS_LABEL}
        </Button>
        {onTextInstead === undefined ? null : (
          <Button intent="ghost" onClick={onTextInstead} size="sm" type="button">
            {SEARCH_PAUSED_COPY.textInstead}
          </Button>
        )}
      </Row>
    </Stack>
  );
}

/** The RESULT list's own live region (side-eye re-pass B3). The only status this surface announced was the
 *  shared `Autocomplete`'s, which counts SUGGESTIONS — so a screen reader heard "2 results" over twenty
 *  rendered hits, and "0 results" while resting over a 200-row catalog. This one counts what the list
 *  actually renders, and names the target so two targets' counts can't be confused for one number. */
function ResultsStatus({ count, label, nearestOnly }: { readonly count: number; readonly label: string; readonly nearestOnly: boolean }): ReactElement {
  const noun = count === 1 ? "result" : "results";
  return (
    <Text as="span" className="sr-only" role="status">
      {/* A LISTENER GETS THE SAME CAVEAT THE READER GETS (P2-B). The banner below is visual; announcing
          "20 results" beside it would tell a screen-reader user the opposite of what the screen says. */}
      {nearestOnly ? `${count} nearest ${noun} in ${label} — nothing matched strongly` : `${count} ${noun} in ${label}`}
    </Text>
  );
}

/** THE HONEST BANNER OVER A NEAREST-ONLY LIST (P2-B). Degraded, never absolute: the measurement in
 *  `CORPUS_NEAREST_ONLY_BELOW` shows a low-scoring set can still be the right answer (a coherent off-topic
 *  query scores BELOW gibberish on the digest index), so this states the ceiling and leaves the reading to
 *  the reader — the `evidenceScent` voice, which is this surface's spelling for "what exists vs what is
 *  under it". The percent is the surface's one similarity spelling. */
function NearestOnlyBanner({ best }: { readonly best: number }): ReactElement {
  return (
    <Text data-slot="search-nearest-only" voice="gloss">
      Nothing matched strongly — these are the nearest, at {percent(best)} or less.
    </Text>
  );
}

/** Every rendered hit's relevance. Per branch on purpose: `hits` is a union of arrays, which cannot be
 *  mapped as one, and the two targets this surface never requests carry no relevance at all. */
function relevancesOf(data: UnifiedResult): number[] {
  if (data.over === "characters") {
    return data.hits.map((hit) => hit.relevance);
  }
  if (data.over === "discover") {
    return [...data.hits.map((hit) => hit.relevance), ...data.standaloneSegments.map((segment) => segment.relevance)];
  }
  if (data.over === "digests") {
    return data.hits.map((hit) => hit.relevance);
  }
  if (data.over === "images") {
    return data.hits.map((hit) => hit.relevance);
  }
  return [];
}

/** The lexical BM25 surface (`search.fields`) — each hit arrives named by the server's owner-scoped read. */
function FieldsResults({
  query,
  label,
  retainFinderScroll,
}: {
  readonly query: string;
  readonly label: string;
  readonly retainFinderScroll: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const trimmed = query.trim();
  const hits = useQuery(trpc.search.fields.queryOptions({ query: trimmed, topN: CORPUS_SEARCH_TOP_N }, { enabled: trimmed !== "" }));

  if (hits.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (hits.error !== null) {
    return <QueryErrorState label="the text search" onRetry={hits.refetch} />;
  }
  if (hits.data.hits.length === 0) {
    return (
      <>
        <Text voice="gloss">
          Text searched {hits.data.coverage.indexedCharacters} indexed cards. Request limit: {hits.data.coverage.requestLimit}.
        </Text>
        <NoMatches label={label} query={trimmed} lexical={true} />
      </>
    );
  }

  return (
    <>
      {/* The lexical branch is never "nearest only": BM25 is an unbounded per-query score, not a
          similarity, so there is no band to compare it against (the same reason its rows print no percent). */}
      <Text voice="gloss">
        Text matches card wording with prefix and fuzzy matching. Showing {hits.data.hits.length} of {hits.data.coverage.matchingCharacters} matching cards from{" "}
        {hits.data.coverage.indexedCharacters} indexed cards; request limit {hits.data.coverage.requestLimit}.
      </Text>
      <ResultsStatus count={hits.data.hits.length} label={label} nearestOnly={false} />
      <CorpusResultsList label={label} retainFinderScroll={retainFinderScroll}>
        {hits.data.hits.map((hit, index) => (
          <Stack key={hit.characterId} role="listitem">
            <CharacterHitRow characterId={hit.characterId} name={hit.name} avatarHash={hit.avatarHash} genre={null} tone={null} pitch={null} rank={index + 1} />
          </Stack>
        ))}
      </CorpusResultsList>
    </>
  );
}

/** The empty state TEACHES THE ENGINE (side-eye re-pass C8). "Nothing matched" alone leaves a reader with
 *  no next move and no way to know why a phrase that is definitely in their library found nothing — the two
 *  engines behind this one box answer different questions, and only the lexical one cares about exact
 *  words. The second line names the engine and the next thing to try. */
function NoMatches({ label, query, lexical }: { readonly label: string; readonly query: string; readonly lexical: boolean }): ReactElement {
  return (
    <Stack align="center" className="p-block" gap="field">
      <Icon icon={Search} size="lg" />
      <Text>{lexical ? `Nothing in your ${label.toLowerCase()} matched “${query}”.` : "No result in this preview."}</Text>
      <Text voice="gloss">
        {lexical
          ? "Text searches card wording with prefix and fuzzy matching. Check the spelling, or try Memories or Scenes — those search by meaning."
          : "This target searches by meaning, not exact words. Try a fuller phrase, or another target: Text searches card wording."}
      </Text>
    </Stack>
  );
}

/** One row per branch, discriminated on `over`. The corpus omnibox only asks for four targets; the wider
 *  union's remaining targets (entities/segments/corpus) are never requested here, so they fall to a note. */
function ResultBranch({ data }: { readonly data: UnifiedResult }): ReactElement {
  if (data.over === "characters") {
    return (
      <>
        {data.hits.map((hit, index) => (
          <Stack key={hit.characterId} role="listitem">
            <CharacterHitRow
              characterId={hit.characterId}
              name={hit.name}
              avatarHash={hit.avatarHash}
              genre={hit.genre}
              tone={hit.tone}
              pitch={hit.elevatorPitch}
              rank={index + 1}
            />
          </Stack>
        ))}
      </>
    );
  }
  if (data.over === "discover") {
    return (
      <>
        {data.hits.map((hit, index) => (
          <DiscoverHitRow hit={hit} key={hit.characterId} rank={index + 1} />
        ))}
        {data.standaloneSegments.length > 0 ? <Text voice="gloss">Transcript passages without character credit</Text> : null}
        {data.standaloneSegments.map((segment, index) => (
          <Stack key={segment.source.rowId} role="listitem">
            <ListRow
              clickable={true}
              onClick={(): void => openChatMoment(segment.chatId, { kind: "source", source: segment.source })}
              title={segment.chatTitle ?? "Untitled chat"}
              subtitle={snippetForDisplay(segment.snippet)}
              subtitleWrap={true}
              meta={String(index + 1)}
            />
          </Stack>
        ))}
      </>
    );
  }
  if (data.over === "digests") {
    return (
      <>
        {[
          ...groupByEvidence(
            data.hits.map((hit, index) => ({ hit, rank: index + 1 })),
            ({ hit }) => hit.text,
          ),
        ].map(([text, occurrences]) => (
          <Stack key={text} gap="row" role="listitem">
            {occurrences.length > 1 ? <Text voice="gloss">{snippetForDisplay(text)}</Text> : null}
            {occurrences.map(({ hit, rank }) => (
              <DigestHitRow
                key={`${hit.blockKey.chatId}-${hit.blockKey.scopedCharacterId}-${hit.blockKey.tier}-${hit.blockKey.blockIdx}`}
                hit={hit}
                rank={rank}
                grouped={occurrences.length > 1}
              />
            ))}
          </Stack>
        ))}
      </>
    );
  }
  if (data.over === "images") {
    return (
      <>
        {data.hits.map((hit, index) => (
          <Stack key={hit.assetId} role="listitem">
            <ImageHitRow hit={hit} rank={index + 1} />
          </Stack>
        ))}
      </>
    );
  }
  return <Text>This search target is not shown in the corpus navigator.</Text>;
}
