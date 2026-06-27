// `@orb/contracts/search` — the memory↔search query wire (search.md Open decision RESOLVED 2026-06-25).
// DAG root: kit-only (`ChatId`/`CharacterId` from `@orb/kit/ids`) + zod. No domain, no `@orb/db`, no
// sibling contracts node.
//
// SCOPE FLAG (deliberate, per the per-node spec): the search PARAMS (`UnifiedSearchParams`/`SearchScope`/
// `FieldSearchParams`/…) and the RESULT union + hit types (`UnifiedSearchResult`/`SearchHit`/… ) are
// search-DOMAIN-INTERNAL — they live in `domain/search/contract/{params,results}.ts` and reach the client
// via tRPC inference (search.md §public surface; contracts-dag §`contracts/search`). They are NOT a
// cross-package wire shape and do NOT belong here. The ONE genuinely cross-boundary search shape is the
// `MemoryQueryOptions` sub-shape: `memory.recall` (another domain) constructs it and threads it across the
// domain seam into `search.digests`/`search.corpus`. That — plus its `BlockKey` element — is this node.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { z } from "zod";

// The chat-scoped retrieval-mode axis (neo `memoryDefaults.mode`): off | mixA (all tier-0, chronological)
// | mixB (+vector retrieve) | mixC (+rerank) | tiered (consolidation bridge). The canonical home for the
// axis — the `contracts/settings` memory defaults enum DERIVES from this tuple (no inline re-spelling,
// `no-inline-union-redecl`).
export const MEMORY_RETRIEVAL_MODES = ["off", "mixA", "mixB", "mixC", "tiered"] as const;
export type MemoryRetrievalMode = (typeof MEMORY_RETRIEVAL_MODES)[number];
/** The wire schema for the retrieval-mode axis — `z.enum` over the canonical tuple. */
export const memoryRetrievalModeSchema = z.enum(MEMORY_RETRIEVAL_MODES);

/**
 * The block-level identity of one digest/segment block. `search.corpus` dedupes ranked blocks by this
 * key, and `memory`'s tiered bridge passes the surviving keys as `MemoryQueryOptions.candidates` so
 * `search` scores only those.
 *
 * `scopedCharacterId` (§11.5 Item 4) carries the egocentric POV: two scoped-group characters can produce
 * digests for the SAME `(chatId, tier, blockIdx)` from different POVs, so the character id is part of the
 * key — without it one POV silently overwrites the other. The `''` empty-string sentinel (NOT null) is
 * the SHARED-bucket value (solo / merged / narrator); it must survive as a valid key value.
 */
export interface BlockKey {
  chatId: ChatId;
  tier: number;
  blockIdx: number;
  scopedCharacterId: CharacterId | "";
}

/**
 * The cross-domain options `memory.recall` threads into `search.digests`/`search.corpus`. `memory` builds
 * the egocentric query TEXT itself (pre-call); `search` owns the scan. The two semantics search's
 * owner-wide scan does not otherwise model are FIRST-CLASS here: `scope.chat` (chat-scope alongside
 * owner/character — NOT collapsed to owner) and `candidates` (the tiered bridge-candidate restriction).
 * The remaining knobs (`mode`/`verbatimWindow`/`keywordMatch`/`recencyBias`/`minScore`) are flat fields,
 * already resolved by `memory` before the call.
 */
export interface MemoryQueryOptions {
  /** First-class chat-scope — the scan is restricted to this one chat (D18/D20: membership-derived, no
   *  `chats.ownerId` row leak). */
  scope: { chat: ChatId };
  /** The tiered bridge restriction: `memory` computes coverage and passes the surviving block-keys;
   *  `search` scores ONLY these. Absent ⇒ scan the full scoped pool. */
  candidates?: BlockKey[] | undefined;
  mode: MemoryRetrievalMode;
  /** Recent messages used as the protected verbatim retrieval window (mixB/mixC). */
  verbatimWindow: number;
  /** Fold keyword-overlap hits into the kept set even below the cosine floor. */
  keywordMatch: boolean;
  /** Mild score boost toward more-recent digests (0 = off). */
  recencyBias: number;
  /** Raw-cosine inclusion floor. */
  minScore: number;
}
