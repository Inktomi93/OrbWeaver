import type { CorpusDigestSource, CorpusSource } from "@orb/contracts/search";

export type DigestSourceRow = Pick<CorpusDigestSource, "text" | "chatTitle" | "scopedCharacterName"> &
  Pick<Extract<CorpusSource, { kind: "digest" }>, "chatId" | "generationId" | "contentHash" | "blockIdx" | "tier" | "scopedCharacterId" | "fingerprint"> & {
    readonly id: Extract<CorpusSource, { kind: "digest" }>["rowId"];
  };

export type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  DigestSourceHit,
  DiscoverCharacter,
  DiscoverResult,
  DiscoverSegment,
  DocumentChunkHit,
  FieldSearchHit,
  FieldSearchResult,
  ImageSearchHit,
  SearchHit,
  SearchSuggestion,
  SegmentSearchHit,
  SimilarArtHit,
  UnifiedSearchResult,
  UnifiedSearchRows,
} from "@orb/contracts/search";
