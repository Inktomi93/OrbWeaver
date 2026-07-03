// `@orb/contracts/search` — the memory↔search query wire (RESOLVED 2026-06-25; ledgered in
// Core-Laws-and-Precedents).
// DAG root: kit-only (`ChatId`/`CharacterId` from `@orb/kit/ids`) + zod. No domain, no `@orb/db`, no
// sibling contracts node.
//
// SCOPE FLAG (deliberate, per the per-node spec): the search PARAMS (`UnifiedSearchParams`/`SearchScope`/
// `FieldSearchParams`/…) and the RESULT union + hit types (`UnifiedSearchResult`/`SearchHit`/… ) are
// search-DOMAIN-INTERNAL — they live in `domain/search/contract/{params,results}.ts` and reach the client
// via tRPC inference (contracts-dag §`contracts/search`). They are NOT a
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
export const memoryRetrievalModeSchema = z.enum(MEMORY_RETRIEVAL_MODES);

/**
 * The block-level identity of one digest/segment block. `search.corpus` dedupes ranked blocks by this
 * key, and `memory`'s tiered bridge passes the surviving keys as `MemoryQueryOptions.candidates` so
 * `search` scores only those.
 *
 * `scopedCharacterId` (§4 / inv 8) carries the egocentric POV: two scoped-group characters can produce
 * digests for the SAME `(chatId, tier, blockIdx)` from different POVs, so the character id is part of the
 * key — without it one POV silently overwrites the other. It is ALWAYS a real branded `CharacterId` (solo's
 * cast char / the synthetic group-as-character `__group__${chatId}` for merged/narrator / a per-witnessing
 * cast char under scoped) — there is NO `''` empty-string sentinel and NO NULL (inv 8; the db FK + the
 * `chat_digests` scope UNIQUE both key off the real id).
 */
export interface BlockKey {
  chatId: ChatId;
  tier: number;
  blockIdx: number;
  scopedCharacterId: CharacterId;
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
  /** The recent-window retrieval query TEXT (domains/memory.md §6/§3b): `memory` assembles the egocentric
   *  (name-prefixed) query over the recent window pre-call; `search` embeds + scans it (mixB/mixC). Homed here
   *  (was carried chat-side on `MemoryRecallQuery` as a workaround). Absent for the non-embedding modes
   *  (`off`/`mixA`/`tiered` do pure assembly — no query embed). */
  queryText?: string | undefined;
  /** The egocentric scope bucket (domains/memory.md §4 / inv 8): the active speaker's own witnessed
   *  bucket for a within-chat recall. ALWAYS a real `CharacterId` (solo's cast char / the synthetic
   *  group-as-character / a per-witnessing char) — NO `''` sentinel, NO NULL. Homed here (was carried
   *  chat-side as a workaround). Absent for an owner-wide cross-chat scan that has no single egocentric POV. */
  scopedCharacterId?: CharacterId | undefined;
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
