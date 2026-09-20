// domain/search/contract/service — typed API surface: SearchContext (the DI bundle, which is also the
// entry-root input) and SearchService (the verb interface).
//
// search is the one vector-retrieval engine. Its only cross-tier seam is `roleClients` (embed/rerank/
// embedModel), a required dep the entry root wires at boot. search reads the vector tables directly via
// @orb/db (allowed by design — it's the bulk reader) and never calls embeddings verbs.
//
// The unified `search(UnifiedSearchParams)` verb is a DISPATCH over the sibling verbs (PD-38, verbs/search.ts):
// it adds one genuinely new capability — the by-character cross-chat digest scan via the
// chat_digest_speakers OR-branch — and otherwise delegates.

import type { RoleClients } from "@orb/contracts/role-clients";
import type { ReadOnlyDb } from "@orb/db";
import type { ChatId, DocumentId, UserId } from "@orb/kit/ids";
import type {
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
} from "./params.ts";
import type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  DiscoverCharacter,
  DocumentChunkHit,
  FieldSearchHit,
  ImageSearchHit,
  SearchHit,
  SearchSuggestion,
  SegmentSearchHit,
  SimilarArtHit,
  UnifiedSearchResult,
} from "./results.ts";

/** The databank scope-junction resolver, INJECTED into search at compose (DB5, databank-design/05 §3.2).
 *  The union SQL has ONE home in `domain/databank` (`persistence/scope.ts`) — search never re-implements
 *  it, so when host-only widens to membership-gated ONE file changes and search is untouched. */
export type ResolveActiveDocumentIdsOp = (scope: { readonly chatId: ChatId } | { readonly ownerId: UserId }) => Promise<readonly DocumentId[]>;

/** Optional per-call observations for digest retrieval. The search remains useful when the mixC reranker is
 * unavailable, but its owner must surface that honest degrade on the chat warning bus. */
export interface DigestSearchEvents {
  readonly onRerankUnavailable: () => void;
}

/** DI bundle the search verbs close over. Read-only (ReadOnlyDb — a write call is a tsc error). */
export interface SearchContext {
  readonly db: ReadOnlyDb;
  /** The per-OWNER role-client bundle (inference program §7.5-2): every retrieval embeds the query in the
   *  OWNER's space (their `embed`/`imageEmbed` binding) and reranks on their `rerank` row. */
  readonly roleClientsFor: (ownerId: UserId) => Promise<RoleClients>;
  /** Consumed only by the lexical fields/suggest engine's per-owner BM25 index cache (TTL freshness). */
  readonly now: () => number;
  /** The databank scope resolver (DB5) — injected by `domain/databank` at compose; consumed ONLY by the
   *  `documents` lens. The union SQL lives in databank, so search stays free of databank's authority model. */
  readonly resolveActiveDocumentIds: ResolveActiveDocumentIdsOp;
}

export interface SearchService {
  readonly knn: (params: KnnParams) => Promise<SearchHit[]>;
  readonly findCharacters: (params: FindCharactersParams) => Promise<CharacterCardHit[]>;
  /** Returns ranked hits each carrying its BlockKey — the compose root maps these into ChatContext. */
  readonly digests: (params: DigestsParams, events?: DigestSearchEvents | undefined) => Promise<DigestSearchHit[]>;
  readonly segments: (params: SegmentsParams) => Promise<SegmentSearchHit[]>;
  readonly corpus: (params: CorpusParams) => Promise<CorpusHit[]>;
  /** Ranks on raw cosine distance — hub_score is deliberately not applied on this cross-modal path. */
  readonly images: (params: ImagesParams) => Promise<ImageSearchHit[]>;
  /** score is a BM25 score (higher = better). */
  readonly fields: (params: FieldSearchParams) => Promise<FieldSearchHit[]>;
  readonly suggest: (params: SuggestParams) => Promise<SearchSuggestion[]>;
  readonly discover: (params: DiscoverParams) => Promise<DiscoverCharacter[]>;
  /** The databank RAG lens (DB5): scope-gated cosine retrieval over `document_chunks`, reading-order
   *  restored. Scope resolves through the injected `resolveActiveDocumentIds` — an empty bank short-circuits
   *  with ZERO embed calls. */
  readonly documents: (params: DocumentSearchParams) => Promise<DocumentChunkHit[]>;
  readonly similarCharacters: (params: SimilarCharactersParams) => Promise<CharacterCardHit[]>;
  readonly similarArt: (params: SimilarArtParams) => Promise<SimilarArtHit[]>;
  /** The unified omnibox dispatch — one query + target + scope → the matching verb's hits, tagged by
   *  `over`. A dispatcher over the siblings; the only new capability is the by-character cross-chat
   *  digest scan (the chat_digest_speakers OR-branch). */
  readonly search: (params: UnifiedSearchParams) => Promise<UnifiedSearchResult>;
}
