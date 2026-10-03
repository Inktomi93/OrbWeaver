import type { CorpusDigestSource, CorpusSource, FieldSearchHit, FieldSearchResult } from "@orb/contracts/search";

export type DigestSourceRow = Pick<CorpusDigestSource, "text" | "chatTitle" | "scopedCharacterName"> &
  Pick<Extract<CorpusSource, { kind: "digest" }>, "chatId" | "generationId" | "contentHash" | "blockIdx" | "tier" | "scopedCharacterId" | "fingerprint"> & {
    readonly id: Extract<CorpusSource, { kind: "digest" }>["rowId"];
  };

/** What the lexical index alone answers: ids and BM25 scores, before the owner-scoped display read names them. */
export interface FieldIndexResult extends Omit<FieldSearchResult, "hits"> {
  readonly hits: readonly Pick<FieldSearchHit, "characterId" | "score">[];
}

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
