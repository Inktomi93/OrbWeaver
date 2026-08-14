// The corpus omnibox result renderer (the J10 heart) — runs `search.search` for the active target and
// renders the discriminated result per branch. Characters/Scenes hits select a character into CONTENT;
// the Scenes branch is the CHAT-SEARCH PREVIEW: each DiscoverCharacter's evidence segments are grouped
// per chat so the user previews the matching moments before opening the dossier. Memories/Images hits are
// read-only previews (a digest snippet + its chat, an avatar caption). The query is owner-scoped; the
// image target rides the caption-aware lens. Rendered only while the omnibox has a query (parent-gated).

import { CHARACTER_LIST_MAX_LIMIT } from "@orb/contracts/character";
import type { ChatId } from "@orb/kit/ids";
import { Icon, Images, MessagesSquare, Search } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";
import { selectCorpusCharacter } from "#state";
import { characterFacetLine } from "../lib/character-facet.ts";
import { CORPUS_IMAGE_LENS, CORPUS_SEARCH_TOP_N, resolveSearchTarget } from "../lib/corpus-search-targets.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type UnifiedResult = inferOutput<Trpc["search"]["search"]>;
type DiscoverHit = Extract<UnifiedResult, { over: "discover" }>["hits"][number];
type DiscoverSegment = DiscoverHit["segments"][number];
type UnifiedOver = Extract<ReturnType<typeof resolveSearchTarget>, { kind: "unified" }>["over"];

const SKELETON_ROW_COUNT = 5;
const SCORE_PRECISION = 2;
const CHAT_REF_LEN = 6;
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
  if (data.hits.length === 0) {
    return <NoMatches label={label} query={trimmed} />;
  }

  return (
    <Stack
      aria-label={`Search results — ${label}`}
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      data-testid={testId("corpusSearchResults")}
      gap="row"
      role="list"
    >
      <ResultBranch data={data} />
    </Stack>
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
    return <NoMatches label={label} query={trimmed} />;
  }

  const byId = new Map((catalog.data?.items ?? []).map((card) => [card.id, card]));
  return (
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
          <CharacterHitRow
            key={hit.characterId}
            characterId={hit.characterId}
            name={card?.name ?? `Character ${hit.characterId.slice(-ID_REF_LEN)}`}
            avatarHash={card?.avatarHash ?? null}
            genre={null}
            tone={null}
            pitch={null}
            score={hit.score}
          />
        );
      })}
    </Stack>
  );
}

function NoMatches({ label, query }: { readonly label: string; readonly query: string }): ReactElement {
  return (
    <Stack align="center" className="p-block" gap="field">
      <Icon icon={Search} size="lg" />
      <Text>
        Nothing in your {label.toLowerCase()} matched “{query}”.
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
          <CharacterHitRow
            key={hit.characterId}
            characterId={hit.characterId}
            name={hit.name}
            avatarHash={hit.avatarHash}
            genre={hit.genre}
            tone={hit.tone}
            pitch={hit.elevatorPitch}
            score={hit.score}
          />
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
          <DigestHitRow
            key={`${hit.blockKey.chatId}-${hit.blockKey.tier}-${hit.blockKey.blockIdx}`}
            chatId={hit.blockKey.chatId}
            text={hit.text}
            score={hit.score}
          />
        ))}
      </>
    );
  }
  if (data.over === "images") {
    return (
      <>
        {data.hits.map((hit) => (
          <ImageHitRow key={hit.assetId} caption={hit.caption} score={hit.score} />
        ))}
      </>
    );
  }
  return <Text>This search target is not shown in the corpus navigator.</Text>;
}

/** A distilled character card hit — click selects it into the dossier CONTENT. */
function CharacterHitRow({
  characterId,
  name,
  avatarHash,
  genre,
  tone,
  pitch,
  score,
}: {
  readonly characterId: DiscoverHit["characterId"];
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly pitch: string | null;
  readonly score: number;
}): ReactElement {
  const facet = characterFacetLine(genre, tone);
  const subtitle = pitch ?? (facet === "" ? "No pitch distilled" : facet);
  return (
    <ListRow
      data-testid={testId("corpusSearchHit")}
      clickable={true}
      onClick={(): void => selectCorpusCharacter(characterId)}
      leading={<CharacterAvatar id={characterId} name={name} hash={avatarHash} />}
      title={name}
      subtitle={subtitle}
      actions={<ScoreBadge score={score} />}
    />
  );
}

/** A lived-scene discovery hit — the character plus its per-chat evidence preview. */
function DiscoverHitRow({ hit }: { readonly hit: DiscoverHit }): ReactElement {
  const groups = groupByChat(hit.segments);
  return (
    <Stack data-testid={testId("corpusSearchHit")} gap="field">
      <ListRow
        clickable={true}
        onClick={(): void => selectCorpusCharacter(hit.characterId)}
        leading={<CharacterAvatar id={hit.characterId} name={hit.name} hash={hit.avatarHash} />}
        title={hit.name}
        subtitle={`${hit.matchCount} matching moment${hit.matchCount === 1 ? "" : "s"}`}
        actions={<ScoreBadge score={hit.score} />}
      />
      <Stack className="pl-gutter" gap="field" data-testid={testId("corpusDiscoverEvidence")}>
        {groups.map(([chatId, segments]) => (
          <Stack key={chatId} gap="field">
            <Text voice="kicker">Chat {chatId.slice(-CHAT_REF_LEN)}</Text>
            {segments.map((segment) => (
              <Text key={`${chatId}-${segment.blockIdx}`} voice="gloss">
                “{segment.snippet}”
              </Text>
            ))}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

/** A memory (digest) hit — a snippet + which chat it came from. Read-only preview. */
function DigestHitRow({ chatId, text, score }: { readonly chatId: ChatId; readonly text: string; readonly score: number }): ReactElement {
  return (
    <ListRow
      data-testid={testId("corpusSearchHit")}
      leading={<Icon icon={MessagesSquare} size="sm" />}
      title={text}
      subtitle={`Chat ${chatId.slice(-CHAT_REF_LEN)}`}
      actions={<ScoreBadge score={score} />}
    />
  );
}

/** An avatar caption hit — read-only preview. */
function ImageHitRow({ caption, score }: { readonly caption: string | null; readonly score: number }): ReactElement {
  return (
    <ListRow
      data-testid={testId("corpusSearchHit")}
      leading={<Icon icon={Images} size="sm" />}
      title={caption ?? "Uncaptioned avatar"}
      actions={<ScoreBadge score={score} />}
    />
  );
}

// Quiet metadata (§6.3 P5): a relevance score is a readout, not a pill — inline micro/mono/muted text,
// matching the similarity-tab PairRow score and the N3 message-metadata treatment.
function ScoreBadge({ score }: { readonly score: number }): ReactElement {
  return (
    <Text voice="gloss" className="shrink-0 font-mono">
      {score.toFixed(SCORE_PRECISION)}
    </Text>
  );
}

/** Group a character's evidence segments by chat so the preview reads per-conversation. */
function groupByChat(segments: readonly DiscoverSegment[]): readonly (readonly [ChatId, readonly DiscoverSegment[]])[] {
  const byChat = new Map<ChatId, DiscoverSegment[]>();
  for (const segment of segments) {
    const bucket = byChat.get(segment.chatId) ?? [];
    bucket.push(segment);
    byChat.set(segment.chatId, bucket);
  }
  return [...byChat.entries()];
}
