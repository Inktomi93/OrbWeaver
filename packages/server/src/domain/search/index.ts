// domain/search — FRONT DOOR: the only legal external import; re-exports the public surface. The within-space
// vector retrieval engine (`knn`/`findCharacters`), the chat-memory lenses (`digests`/`segments`/`corpus`),
// the cross-modal `images` + lexical `fields`/`suggest`, the discovery lens (`discover`, docs/work/0122) + its
// seed-vector siblings (`similarCharacters`/`similarArt`), and the unified `search()` dispatch over
// the `SearchScope`/`SearchTarget` axes.

export { SEARCH_EMPTY_QUERY, SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING, SearchError } from "./contract/errors.ts";
export type {
  CorpusParams,
  DigestsParams,
  DiscoverParams,
  DocumentSearchParams,
  FieldSearchParams,
  FindCharactersParams,
  ImagesParams,
  KnnParams,
  SegmentsParams,
  SimilarArtParams,
  SimilarCharactersParams,
  SuggestParams,
  UnifiedSearchParams,
} from "./contract/params.ts";
export type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  DiscoverCharacter,
  DiscoverSegment,
  DocumentChunkHit,
  FieldSearchHit,
  ImageSearchHit,
  SearchHit,
  SearchSuggestion,
  SegmentSearchHit,
  SimilarArtHit,
  UnifiedSearchResult,
} from "./contract/results.ts";
export type { ResolveActiveDocumentIdsOp, SearchAssemblyContext as SearchContext, SearchService } from "./contract/service.ts";

export { createSearchService } from "./service.ts";
export {} from "./substrate/field-index.ts";
export { withRetrievalDegrade } from "./substrate/retrieval-degrade.ts";
export { createCharacterIndexPublication } from "./verbs/character-index-publication.ts";
export { createDigestSources } from "./verbs/digest-sources.ts";
export { createPluginDocumentSearch } from "./verbs/plugin-documents.ts";
