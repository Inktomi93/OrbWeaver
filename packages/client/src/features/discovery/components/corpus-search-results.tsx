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
import { CORPUS_IMAGE_LENS, CORPUS_SEARCH_TOP_N, resolveSearchTarget } from "../lib/corpus-search-targets.ts";
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

  return (
    <>
      <ResultsStatus count={shown.hits.length} label={label} />
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
function ResultsStatus({ count, label }: { readonly count: number; readonly label: string }): ReactElement {
  return (
    <Text as="span" className="sr-only" role="status">
      {`${count} ${count === 1 ? "result" : "results"} in ${label}`}
    </Text>
  );
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
      <ResultsStatus count={hits.data.length} label={label} />
      <Stack
        aria-label={`Search results — ${label}`}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid={testId("corpusSearchResults")}
        gap="row"
        role="list"
      >
        {hits.data.map((hit) => {
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
        {data.hits.map((hit) => (
          <Stack key={hit.characterId} role="listitem">
            <CharacterHitRow
              characterId={hit.characterId}
              name={hit.name}
              avatarHash={hit.avatarHash}
              genre={hit.genre}
              tone={hit.tone}
              pitch={hit.elevatorPitch}
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
        {data.hits.map((hit) => (
          <DiscoverHitRow key={hit.characterId} hit={hit} />
        ))}
      </>
    );
  }
  if (data.over === "digests") {
    return (
      <>
        {data.hits.map((hit) => (
          <Stack key={`${hit.blockKey.chatId}-${hit.blockKey.tier}-${hit.blockKey.blockIdx}`} role="listitem">
            <DigestHitRow
              chatId={hit.blockKey.chatId}
              chatTitle={hit.chatTitle}
              scopedCharacterName={hit.scopedCharacterName}
              text={hit.text}
              relevance={hit.relevance}
            />
          </Stack>
        ))}
      </>
    );
  }
  if (data.over === "images") {
    return (
      <>
        {data.hits.map((hit) => (
          <Stack key={hit.assetId} role="listitem">
            <ImageHitRow caption={hit.caption} characterId={hit.characterId} characterName={hit.characterName} hash={hit.hash} relevance={hit.relevance} />
          </Stack>
        ))}
      </>
    );
  }
  return <Text>This search target is not shown in the corpus navigator.</Text>;
}
