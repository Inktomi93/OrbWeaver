// domain/search — FRONT DOOR: the only legal external import; re-exports the public surface. The within-space
// vector retrieval engine (`knn`/`findCharacters`), the chat-memory lenses (`digests`/`segments`/`corpus`),
// the cross-modal `images` + lexical `fields`/`suggest`, the discovery lens (`discover`, docs/work/0122) + its
// seed-vector siblings (`similarCharacters`/`similarArt`), and the unified `search()` dispatch over
// the `SearchScope`/`SearchTarget` axes.

export type { FieldIndexCache } from "./contract/field-index.ts";
export type { DocumentChunkHit } from "./contract/results.ts";
export type { ResolveActiveDocumentIdsOp, SearchService } from "./contract/service.ts";

export { createSearchService } from "./service.ts";
export { createFieldIndexCache } from "./substrate/field-index.ts";
export { withRetrievalDegrade } from "./substrate/retrieval-degrade.ts";
export { createCharacterIndexPublication } from "./verbs/character-index-publication.ts";
export { createDigestSources } from "./verbs/digest-sources.ts";
export { createPluginDocumentSearch } from "./verbs/plugin-documents.ts";
