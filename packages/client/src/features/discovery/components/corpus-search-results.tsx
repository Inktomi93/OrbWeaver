// The corpus omnibox result renderer (the J10 heart) — runs `search.search` for the active target and
// renders the discriminated result per branch. Characters/Scenes hits select a character into CONTENT;
// the Scenes branch is the CHAT-SEARCH PREVIEW: each DiscoverCharacter's evidence segments are grouped
// per chat so the user previews the matching moments before opening the dossier. The query is owner-scoped;
// the image target rides the caption-aware lens. Rendered only while the omnibox has a query (parent-gated).
//
// ── A MEMORY IS A DOOR (corpus forensics 2026-08-18 §2, R1a) ───────────────────────────────────────────
// The Memories row was a "read-only preview": a static div over a `chatId` the wire already carried, whose
// subtitle was that id's last six characters. The retrieval underneath it is the best thing on this surface
// (five for five on checkable queries), and the row threw away every way to act on it. It now OPENS the
// room — `setActiveSection("chats")` + `selectChat`, the same two lines the notification bell uses — and
// names it through the ONE title chain (`deriveChatTitle`: authored title → cast → "Untitled chat"), with
// the digest's own scoped character as the cast rung.
//
// LANDING ON THE MESSAGE is deliberately NOT here. `MessageListHandle` exposes no scroll-to-index outside
// pin-prompt mode, and a digest's `blockIdx` is an index into fixed-width BLOCKS of a chat's whole history,
// which a paged transcript cannot address without the block size and the pages in between. Chat-level is the
// honest v1; the moment-level landing belongs to the moment artifact.
//
// ── THE NUMBER GOES THE RIGHT WAY (§3, R2b) ────────────────────────────────────────────────────────────
// The badge rendered `hit.score` — the server's CSLS-adjusted cosine DISTANCE, clamped at 0 — so every
// genuinely relevant hit read `0.00` and only a nonsense query produced anything non-zero. It now reads
// `hit.relevance` (`1 − distance`, higher = closer) as a percent. The ORDER is still the server's CSLS rank;
// this seam only decides what the reader is shown, which is why there is exactly one of it in this file.
//
// NO `data-testid` ON A `ListRow`. Four of them sat here and reached the DOM in exactly one place: the
// primitive builds its body from named props and forwards no rest props, so `data-testid` on a `<ListRow>`
// is dropped silently. The rows are addressed by role + accessible name instead, which is also what a user
// meets them as.

import { blobUrl } from "@orb/contracts/assets";
import { CHARACTER_LIST_MAX_LIMIT } from "@orb/contracts/character";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Icon, Images, MessagesSquare, Search } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { deriveChatTitle, testId } from "#lib";
import { selectChat, selectCorpusCharacter, setActiveSection } from "#state";
import { characterFacetLine } from "../lib/character-facet.ts";
import { CORPUS_IMAGE_LENS, CORPUS_SEARCH_TOP_N, resolveSearchTarget } from "../lib/corpus-search-targets.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type UnifiedResult = inferOutput<Trpc["search"]["search"]>;
type DiscoverHit = Extract<UnifiedResult, { over: "discover" }>["hits"][number];
type DiscoverSegment = DiscoverHit["segments"][number];
type UnifiedOver = Extract<ReturnType<typeof resolveSearchTarget>, { kind: "unified" }>["over"];

const SKELETON_ROW_COUNT = 5;
const PERCENT = 100;
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
            relevance={null}
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
            relevance={hit.relevance}
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
            chatTitle={hit.chatTitle}
            scopedCharacterName={hit.scopedCharacterName}
            text={hit.text}
            relevance={hit.relevance}
          />
        ))}
      </>
    );
  }
  if (data.over === "images") {
    return (
      <>
        {data.hits.map((hit) => (
          <ImageHitRow
            key={hit.assetId}
            caption={hit.caption}
            characterId={hit.characterId}
            characterName={hit.characterName}
            hash={hit.hash}
            relevance={hit.relevance}
          />
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
  relevance,
}: {
  readonly characterId: DiscoverHit["characterId"];
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly pitch: string | null;
  /** null on the LEXICAL branch: BM25 is an unbounded per-query score, not a similarity, so there is no
   *  honest percent to print for it — the rank order carries what a reader can use (R2a for that one arm). */
  readonly relevance: number | null;
}): ReactElement {
  const facet = characterFacetLine(genre, tone);
  const subtitle = pitch ?? (facet === "" ? "No pitch distilled" : facet);
  return (
    <ListRow
      clickable={true}
      onClick={(): void => selectCorpusCharacter(characterId)}
      leading={<CharacterAvatar id={characterId} name={name} hash={avatarHash} />}
      title={name}
      subtitle={subtitle}
      actions={relevance === null ? undefined : <RelevanceBadge relevance={relevance} />}
    />
  );
}

/** A lived-scene discovery hit — the character plus its per-chat evidence preview. Each evidence GROUP is a
 *  room, so its header is that room's name and its own door (the same drill-through a memory hit carries). */
function DiscoverHitRow({ hit }: { readonly hit: DiscoverHit }): ReactElement {
  const groups = groupByChat(hit.segments);
  return (
    <Stack gap="field">
      <ListRow
        clickable={true}
        onClick={(): void => selectCorpusCharacter(hit.characterId)}
        leading={<CharacterAvatar id={hit.characterId} name={hit.name} hash={hit.avatarHash} />}
        title={hit.name}
        subtitle={`${hit.matchCount} matching moment${hit.matchCount === 1 ? "" : "s"}`}
        actions={<RelevanceBadge relevance={hit.relevance} />}
      />
      <Stack className="pl-gutter" gap="field" data-testid={testId("corpusDiscoverEvidence")}>
        {groups.map(([chatId, segments]) => (
          <Stack key={chatId} gap="field">
            <ListRow clickable={true} onClick={(): void => openChat(chatId)} title={chatSubtitle(segments[0]?.chatTitle ?? null, hit.name)} />
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

/** A memory (digest) hit — the memory, the room it happened in, and the door into that room. */
function DigestHitRow({
  chatId,
  chatTitle,
  scopedCharacterName,
  text,
  relevance,
}: {
  readonly chatId: ChatId;
  readonly chatTitle: string | null;
  readonly scopedCharacterName: string | null;
  readonly text: string;
  readonly relevance: number;
}): ReactElement {
  return (
    <ListRow
      clickable={true}
      onClick={(): void => openChat(chatId)}
      leading={<Icon icon={MessagesSquare} size="sm" />}
      title={text}
      subtitle={chatSubtitle(chatTitle, scopedCharacterName)}
      actions={<RelevanceBadge relevance={relevance} />}
    />
  );
}

/**
 * An image hit — the picture it found, and the character wearing it when one does.
 *
 * WHAT THIS REPLACED (side-eye corpus re-pass U4): twenty rows with a generic glyph, no image, no button and
 * `cursor: auto`, in the exact ListRow geometry as the Memories rows that ARE doors — an image search that
 * showed no images and a dead end dressed as a live one. The old note here claimed `ImageSearchHit` "carries
 * no asset hash and no owning character"; the wire always carried `assetId`, the scan always joined `assets`,
 * and `characters.avatarAssetId` is the owning-character edge. Both now ride the hit (search's
 * `contract/results.ts`), so the row shows the blob and lands on the dossier — the same
 * `selectCorpusCharacter` door every other character row on this surface is.
 *
 * AN ASSET NOBODY WEARS STAYS A PREVIEW, and looks like one: no `clickable`, so no button, no pointer, no
 * hover — and the subtitle says WHY rather than leaving the reader to discover it by clicking. The
 * family-map precedent holds (a thing becomes a door when there is somewhere to land, not before); what
 * changed is that most of these do have somewhere to land, and a thumbnail with a dead click would be the
 * original defect wearing better clothes.
 */
function ImageHitRow({
  hash,
  caption,
  characterId,
  characterName,
  relevance,
}: {
  readonly hash: string;
  readonly caption: string | null;
  readonly characterId: CharacterId | null;
  readonly characterName: string | null;
  readonly relevance: number;
}): ReactElement {
  if (characterId === null) {
    return (
      <ListRow
        leading={
          // No `alt`: the row's TITLE is already this image's caption, and naming the thumbnail with the
          // same words would announce it twice (`CharacterAvatar` leaves it empty for the same reason).
          <Avatar hueSeed={hash} shape="rounded" src={blobUrl(hash)}>
            <Icon icon={Images} size="sm" />
          </Avatar>
        }
        title={caption ?? "Uncaptioned image"}
        subtitle="No card uses this image — nothing to open"
        actions={<RelevanceBadge relevance={relevance} />}
      />
    );
  }
  return (
    <ListRow
      clickable={true}
      onClick={(): void => selectCorpusCharacter(characterId)}
      leading={<CharacterAvatar hash={hash} id={characterId} name={characterName ?? ""} />}
      title={characterName ?? "Untitled card"}
      subtitle={caption ?? "Uncaptioned image"}
      actions={<RelevanceBadge relevance={relevance} />}
    />
  );
}

/** Open the room a hit came from: the corpus's one cross-section destination, spelled exactly as chat's own
 *  callers spell it (`notification-bell.tsx`) — section first, then the room, so CONTENT is already showing
 *  chats when the active chat changes. */
function openChat(chatId: ChatId): void {
  setActiveSection("chats");
  selectChat(chatId);
}

/** The room's name for a subtitle: the ONE title chain, with the hit's own character as the cast rung. */
function chatSubtitle(chatTitle: string | null, castName: string | null): string {
  return deriveChatTitle(chatTitle, castName === null ? [] : [castName]);
}

// Quiet metadata (§6.3 P5): a relevance readout is a readout, not a pill — inline micro/mono/muted text,
// matching the similarity-tab PairRow score and the N3 message-metadata treatment.
//
// A WHOLE PERCENT, not two decimals of a unit nobody has: `relevance` is a cosine similarity, and the digit
// that would distinguish 0.8813 from 0.8809 is noise a reader cannot act on. The percent also reads
// higher-is-better without a legend, which the clamped distance it replaced never could.
function RelevanceBadge({ relevance }: { readonly relevance: number }): ReactElement {
  return (
    <Text voice="gloss" className="shrink-0 font-mono">
      {`${Math.round(relevance * PERCENT)}%`}
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
