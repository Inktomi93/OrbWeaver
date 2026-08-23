// The corpus omnibox result renderer (the J10 heart) — runs `search.search` for the active target and
// renders the discriminated result per branch. Characters/Scenes hits select a character into CONTENT;
// the Scenes branch is the CHAT-SEARCH PREVIEW: each DiscoverCharacter's evidence segments are grouped
// per chat so the user previews the matching moments before opening the dossier. The query is owner-scoped;
// the image target rides the caption-aware lens. Rendered only while the omnibox has a query (parent-gated).
//
// WHAT A HIT LOOKS LIKE lives in `corpus-hit-rows.tsx` — the four row components, the relevance readout and
// the chat door, split out when this file went back over the component-size cap. This file owns the QUERIES,
// the branch dispatch, the empty state and the list's live region; it decides WHICH rows render, never how.

import { CHARACTER_LIST_MAX_LIMIT } from "@orb/contracts/character";
import { Icon, Search } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { dedupeByEvidence } from "../lib/corpus-result-text.ts";
import { CORPUS_IMAGE_LENS, CORPUS_SEARCH_TOP_N, isNearestOnly, resolveSearchTarget } from "../lib/corpus-search-targets.ts";
import { percent } from "../lib/corpus-vocabulary.ts";
import { CharacterHitRow, DigestHitRow, DiscoverHitRow, ImageHitRow } from "./corpus-hit-rows.tsx";

type UnifiedResult = inferOutput<Trpc["search"]["search"]>;
type UnifiedOver = Extract<ReturnType<typeof resolveSearchTarget>, { kind: "unified" }>["over"];

const SKELETON_ROW_COUNT = 5;
// The owner's cards up to the server's page CEILING — the lexical `fields` verb returns bare ids, so the
// picker names them against this map. It asked for 200 and silently got 100 until 2026-08-09, so a hit on a
// card past the hundredth rendered as a bare short ref; the ask is now the real bound and an over-bound one
// is refused loudly. An id still outside the page degrades to its short ref, as before.
const NAME_MAP_LIMIT = CHARACTER_LIST_MAX_LIMIT;
const ID_REF_LEN = 6;

export interface CorpusSearchResultsProps {
  readonly query: string;
  readonly targetId: string;
}

/** Dispatch to the engine the active target names — the unified `search.search`, or the lexical `fields`. */
export function CorpusSearchResults({ query, targetId }: CorpusSearchResultsProps): ReactElement {
  const target = resolveSearchTarget(targetId);
  if (target.kind === "fields") {
    return <FieldsResults query={query} label={target.label} />;
  }
  return <UnifiedResults query={query} over={target.over} label={target.label} />;
}

/** Run the unified search for the active target + render the discriminated result. */
function UnifiedResults({ query, over, label }: { readonly query: string; readonly over: UnifiedOver; readonly label: string }): ReactElement {
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
    return <QueryErrorState label="the search" onRetry={result.refetch} />;
  }

  const data = result.data;
  // THE SAME EVIDENCE TWICE IS ONE ANSWER (side-eye re-pass C2). A duplicated room (an import run twice, a
  // branch chat) produces digest blocks whose text is byte-identical, and the ranked list showed both — two
  // rows a reader cannot tell apart, spending two of twenty slots on one memory. The server's order is
  // descending relevance, so first-wins keeps the better-scored copy. Deliberately NOT applied to the other
  // branches: a character or an image is its own identity, and two scenes that quote the same block are two
  // different rooms' evidence, which the grouped preview already tells apart.
  const shown = data.over === "digests" ? { ...data, hits: dedupeByEvidence(data.hits, (hit) => hit.text) } : data;
  if (shown.hits.length === 0) {
    return <NoMatches label={label} query={trimmed} lexical={false} />;
  }

  // COSINE ALWAYS ANSWERS (side-eye corpus re-pass #3, P2-B). `zzqqxwvfoobarbaz` returned twenty rows and
  // the live region announced them as results: the surface structurally could not reach a "nothing here is
  // close" state, because a nearest-neighbour engine has no empty arm. It says so now instead — and it says
  // it WITHOUT hiding a row, which the measurement beside `CORPUS_NEAREST_ONLY_BELOW` is the receipt for.
  const relevances = relevancesOf(shown);
  const nearestOnly = isNearestOnly(over, relevances);

  return (
    <>
      <ResultsStatus count={shown.hits.length} label={label} nearestOnly={nearestOnly} />
      {nearestOnly ? <NearestOnlyBanner best={Math.max(...relevances)} /> : null}
      <Stack
        aria-label={`Search results — ${label}`}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid={testId("corpusSearchResults")}
        gap="row"
        role="list"
      >
        <ResultBranch data={shown} />
      </Stack>
    </>
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
    return data.hits.map((hit) => hit.relevance);
  }
  if (data.over === "digests") {
    return data.hits.map((hit) => hit.relevance);
  }
  if (data.over === "images") {
    return data.hits.map((hit) => hit.relevance);
  }
  return [];
}

/** The lexical BM25 surface (`search.fields`) — bare id+score hits named against a card-list map. */
function FieldsResults({ query, label }: { readonly query: string; readonly label: string }): ReactElement {
  const trpc = useTRPC();
  const trimmed = query.trim();
  const hits = useQuery(trpc.search.fields.queryOptions({ query: trimmed, topN: CORPUS_SEARCH_TOP_N }, { enabled: trimmed !== "" }));
  const catalog = useQuery(trpc.character.list.queryOptions({ limit: NAME_MAP_LIMIT }));

  if (hits.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (hits.error !== null) {
    return <QueryErrorState label="the text search" onRetry={hits.refetch} />;
  }
  if (hits.data.length === 0) {
    return <NoMatches label={label} query={trimmed} lexical={true} />;
  }

  const byId = new Map((catalog.data?.items ?? []).map((card) => [card.id, card]));
  return (
    <>
      {/* The lexical branch is never "nearest only": BM25 is an unbounded per-query score, not a
          similarity, so there is no band to compare it against (the same reason its rows print no percent). */}
      <ResultsStatus count={hits.data.length} label={label} nearestOnly={false} />
      <Stack
        aria-label={`Search results — ${label}`}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid={testId("corpusSearchResults")}
        gap="row"
        role="list"
      >
        {hits.data.map((hit, index) => {
          const card = byId.get(hit.characterId);
          return (
            <Stack key={hit.characterId} role="listitem">
              <CharacterHitRow
                characterId={hit.characterId}
                name={card?.name ?? `Character ${hit.characterId.slice(-ID_REF_LEN)}`}
                avatarHash={card?.avatarHash ?? null}
                genre={null}
                tone={null}
                pitch={null}
                rank={index + 1}
                relevance={null}
              />
            </Stack>
          );
        })}
      </Stack>
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
      <Text>
        Nothing in your {label.toLowerCase()} matched “{query}”.
      </Text>
      <Text voice="gloss">
        {lexical
          ? "Text matches card wording exactly. Check the spelling, or try Memories or Scenes — those search by meaning."
          : "This target searches by meaning, not exact words. Try a fuller phrase, or another target: Text matches card wording exactly."}
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
              relevance={hit.relevance}
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
      </>
    );
  }
  if (data.over === "digests") {
    return (
      <>
        {data.hits.map((hit, index) => (
          <Stack key={`${hit.blockKey.chatId}-${hit.blockKey.tier}-${hit.blockKey.blockIdx}`} role="listitem">
            <DigestHitRow
              chatId={hit.blockKey.chatId}
              chatTitle={hit.chatTitle}
              rank={index + 1}
              relevance={hit.relevance}
              scopedCharacterName={hit.scopedCharacterName}
              text={hit.text}
            />
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
            <ImageHitRow
              caption={hit.caption}
              characterId={hit.characterId}
              characterName={hit.characterName}
              hash={hit.hash}
              rank={index + 1}
              relevance={hit.relevance}
            />
          </Stack>
        ))}
      </>
    );
  }
  return <Text>This search target is not shown in the corpus navigator.</Text>;
}
