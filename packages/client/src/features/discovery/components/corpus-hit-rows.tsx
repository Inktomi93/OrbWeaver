// Search rows retain the complete occurrence selected into Corpus CONTENT.
import { blobIconUrl } from "@orb/contracts/assets";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Icon, Images, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { RECEDED_INK } from "@orb/ui/lib";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { testId } from "#lib";
import { selectCorpusArtifact, selectCorpusCharacter, useSelectedCorpusDestination } from "#state";
import { characterFacetLine } from "../lib/character-facet.ts";
import { chatSubtitle, evidenceScent, groupByEvidence, roomNumberingHint, snippetForDisplay } from "../lib/corpus-result-text.ts";
import { percent } from "../lib/corpus-vocabulary.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type UnifiedResult = inferOutput<Trpc["search"]["search"]>;
type DiscoverHit = Extract<UnifiedResult, { over: "discover" }>["hits"][number];
type DigestHit = Extract<UnifiedResult, { over: "digests" }>["hits"][number];
type ImageHit = Extract<UnifiedResult, { over: "images" }>["hits"][number];
const UNWORN_THUMB_WIDTH = 48;
/** A distilled character card hit — click selects it into the dossier CONTENT. */
export function CharacterHitRow({
  characterId,
  name,
  avatarHash,
  genre,
  tone,
  pitch,
  relevance,
  rank,
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
  /** This row's 1-based position in the server's ranking — printed, because the percent beside it is a
   *  DIFFERENT quantity and does not descend ([P2-2]; see {@link hitRankMeta}). */
  readonly rank: number;
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
      meta={hitRankMeta(rank, relevance)}
    />
  );
}

export function DiscoverHitRow({ hit, rank }: { readonly hit: DiscoverHit; readonly rank: number }): ReactElement {
  const passages = groupByEvidence(hit.segments, (segment) => snippetForDisplay(segment.snippet));
  const rooms = new Set(hit.segments.map((segment) => segment.chatId)).size;
  return (
    <Stack gap="field" role="listitem">
      <ListRow
        clickable={true}
        onClick={(): void => selectCorpusCharacter(hit.characterId)}
        leading={<CharacterAvatar id={hit.characterId} name={hit.name} hash={hit.avatarHash} />}
        title={hit.name}
        subtitle={evidenceScent(hit.matchCount, passages.size, rooms)}
        subtitleWrap={true}
        meta={hitRankMeta(rank, hit.relevance)}
      />
      <Stack className="pl-gutter" gap="row" data-testid={testId("corpusDiscoverEvidence")}>
        {[...passages].map(([snippet, occurrences]) => (
          <Stack key={snippet} gap="tight">
            <Text voice="gloss">“{snippet}”</Text>
            <Row className="flex-wrap" gap="field">
              {occurrences.map((segment, index) => (
                <Button
                  key={segment.source.rowId}
                  className={`max-w-full justify-start ${RECEDED_INK}`}
                  intent="ghost"
                  size="sm"
                  title={roomNumberingHint(chatSubtitle(segment.chatTitle, hit.name))}
                  onClick={(): void => selectCorpusArtifact({ kind: "scene", hit: segment, characterName: hit.name, rank })}
                >
                  <Text as="span" className="min-w-0 truncate text-muted-foreground" voice="label">
                    {chatSubtitle(segment.chatTitle, hit.name)}
                    {occurrences.filter((candidate) => candidate.chatId === segment.chatId).length > 1 ? ` · occurrence ${index + 1}` : ""}
                  </Text>
                  <Text aria-hidden={true} as="span" className="shrink-0 text-muted-foreground" voice="label">
                    →
                  </Text>
                </Button>
              ))}
            </Row>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

export function DigestHitRow({ hit, rank, grouped = false }: { readonly hit: DigestHit; readonly rank: number; readonly grouped?: boolean }): ReactElement {
  const selected = useSelectedCorpusDestination();
  return (
    <ListRow
      selected={selected?.kind === "digest" && selected.hit.source.rowId === hit.source.rowId}
      clickable={true}
      onClick={(): void => selectCorpusArtifact({ kind: "digest", hit, rank })}
      leading={<Icon icon={MessagesSquare} size="sm" />}
      title={chatSubtitle(hit.chatTitle, hit.scopedCharacterName)}
      subtitle={grouped ? (hit.scopedCharacterName ?? "Generated memory summary") : snippetForDisplay(hit.text)}
      subtitleWrap={true}
      meta={hitRankMeta(rank, hit.relevance)}
    />
  );
}

export function ImageHitRow({ hit, rank }: { readonly hit: ImageHit; readonly rank: number }): ReactElement {
  const selected = useSelectedCorpusDestination();
  return (
    <ListRow
      selected={selected?.kind === "image" && selected.hit.assetId === hit.assetId}
      clickable={true}
      onClick={(): void => selectCorpusArtifact({ kind: "image", hit })}
      leading={
        hit.characterId === null ? (
          <Avatar hueSeed={hit.hash} shape="rounded" size="sm" src={blobIconUrl(hit.hash, UNWORN_THUMB_WIDTH)}>
            <Icon icon={Images} size="sm" />
          </Avatar>
        ) : (
          <CharacterAvatar hash={hit.hash} id={hit.characterId} name={hit.characterName ?? ""} />
        )
      }
      title={hit.characterName ?? hit.caption ?? "Uncaptioned image"}
      subtitle={hit.characterId === null ? "Unattached image · open asset detail" : (hit.caption ?? "Uncaptioned image")}
      meta={hitRankMeta(rank, hit.relevance)}
    />
  );
}

function hitRankMeta(rank: number, relevance: number | null): string {
  return relevance === null ? rank.toString() : `${rank.toString()} · ${percent(relevance)}`;
}
