// domain/search — FRONT DOOR: the only legal external import; re-exports the public surface. The within-space
// vector retrieval engine (`knn`/`findCharacters`), the chat-memory lenses (`digests`/`segments`/`corpus`),
// the cross-modal `images` + lexical `fields`/`suggest`, the discovery lens (`discover`, docs/work/0122) + its
// seed-vector siblings (`similarCharacters`/`similarArt`), and the unified `search()` dispatch over
// the `SearchScope`/`SearchTarget` axes.

export type { SearchContext } from "./context.ts";
// `SEARCH_NO_SPACE` + `SEARCH_SPACE_REINDEXING` are exported for ONE consumer: the composition root's in-turn
// retrieval-degrade seam (`entry/compose/retrieval-degrade.ts`, #2510), which is the only place allowed to
// decide that a chat turn survives a space refusal. A domain may not import them — that would be the sideways
// import constitution §2 forbids — which is exactly why the decision lives at compose and not in chat.
export { SEARCH_EMPTY_QUERY, SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING, SearchError } from "./contract/errors.ts";
export {
  type CorpusParams,
  type DigestsParams,
  type DiscoverParams,
  type DocumentSearchParams,
  type FieldSearchParams,
  type FindCharactersParams,
  type ImagesParams,
  type KnnParams,
  SEARCH_TARGETS,
  type SearchScope,
  type SearchTarget,
  type SegmentsParams,
  type SimilarArtParams,
  type SimilarCharactersParams,
  type SuggestParams,
  type UnifiedSearchParams,
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
export type { ResolveActiveDocumentIdsOp, SearchService } from "./contract/service.ts";

export { createSearchService } from "./service.ts";
