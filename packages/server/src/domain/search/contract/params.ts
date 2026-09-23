// domain/search/contract/params — every verb's *Params: the card-space surface (knn/findCharacters) plus
// the chat-memory surface (digests/segments/corpus). Card verbs are owner-scoped via characters.ownerId
// (D20 — the vector substrate carries no ownerId; scope derives from the producer).

import type { ImageLens } from "@orb/contracts/embeddings";
import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";

export interface KnnParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

export interface FindCharactersParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

// DigestsParams/SegmentsParams are ALIASES of the contracts shape — the derive, not a re-spell. Both verbs take
// exactly the memory-recall query wire `@orb/contracts/search` owns; the named aliases exist only so a
// SearchService signature says WHICH verb its argument belongs to. A structural-identity lens (`ast respell`)
// reports them by construction — it cannot see that an alias already IS the one home — so the answer is this
// comment, never a rename or a hand-written body.
export type DigestsParams = MemoryQueryOptions;

/** Requires scopedCharacterId (the verbatim lens has no character column) — else SearchError(SCOPE_REQUIRED). */
export type SegmentsParams = MemoryQueryOptions;

export interface CorpusParams {
  readonly ownerId: UserId;
  readonly queryText: string;
  readonly mode: MemoryQueryOptions["mode"];
  readonly minScore: number;
}

/** The databank RAG lens. `scope` is the injected-resolver argument shape: a
 *  chat turn resolves host-global ∪ chat-attached documents (host-only v1); an ad-hoc personal search is
 *  over the owner's whole bank. `k`/`minScore`/`rerank` default to ST's shipped values when the caller
 *  omits them (the verb stays total; the real caller — chat's gather, the panel — passes settings values). */
export interface DocumentSearchParams {
  readonly scope: { readonly chatId: ChatId } | { readonly ownerId: UserId };
  /** The OWNER of the document space (the chat host on a chat scope, the caller on a personal one) — their
   *  `embed`/`rerank` bindings define the space and fund the query (inference program §7.5). */
  readonly ownerId: UserId;
  readonly queryText: string;
  readonly k?: number | undefined;
  readonly minScore?: number | undefined;
  readonly rerank?: boolean | undefined;
}

/** Ranking is raw cosine distance — hub_score is deliberately not CSLS-applied on this cross-modal path. */
export interface ImagesParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly lens: ImageLens;
  readonly rerank?: boolean | undefined;
}

export interface DiscoverParams {
  readonly ownerId: UserId;
  readonly queryText: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

/** Seed-vector top-k over the card space, seeded from the stored embedding (not a re-embed). */
export interface SimilarCharactersParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly topN: number;
}

export interface SimilarArtParams {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly topN: number;
  readonly lens?: ImageLens | undefined;
}

export interface FieldSearchParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
}

export interface SuggestParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly limit: number;
}

// ── the unified search() dispatch ─────────────────────────────────────

/** WHERE a unified search runs. `owner` = the whole corpus (all the user's cards/chats); `chat` = one
 *  authorized chat (the egocentric `scopedCharacterId` is the verbatim-lens POV, required by the
 *  `segments` target); `character` = this character ACROSS ALL the owner's chats — the membership-widened
 *  scope (D16) that credits co-star blocks via the `chat_digest_speakers` OR-branch, not just the digests
 *  the character egocentrically produced. Single importable union — never re-declared inline. */
export type SearchScope =
  | { readonly kind: "owner" }
  | {
      readonly kind: "chat";
      readonly chatId: ChatId;
      readonly scopedCharacterId?: CharacterId | undefined;
    }
  | { readonly kind: "character"; readonly characterId: CharacterId };

/** The retrieval-surface axis the unified `search()` dispatches over — one member per underlying verb.
 *  A new member fails `tsc` at the `UnifiedSearchResult` union + the exhaustive dispatch (no inline
 *  re-declaration; `SEARCH_TARGETS` is the one home). */
export const SEARCH_TARGETS = ["entities", "characters", "discover", "segments", "digests", "corpus", "images", "documents"] as const;
export type SearchTarget = (typeof SEARCH_TARGETS)[number];

/** The omnibox call: one query text, one target surface, one scope. `lens` is required only when
 *  `over === "images"` (validated at the transport seam + re-checked in the dispatch). */
export interface UnifiedSearchParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly over: SearchTarget;
  readonly scope: SearchScope;
  readonly rerank?: boolean | undefined;
  readonly lens?: ImageLens | undefined;
}
