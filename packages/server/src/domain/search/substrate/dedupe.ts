// domain/search/substrate/dedupe — the post-rank collapse helpers (search.md movement table:
// "`dedupeRankedBlocks` → substrate/dedupe.ts"; §"Joint cross-chat rerank + block-level dedupe"). PURE
// functions over an ALREADY-RANKED (best-first) list; no I/O, no domain deps. Two collapses + the block-key
// string:
//   1. `blockKeyStr` — the stable string identity of a `BlockKey`. `scopedCharacterId` is ALWAYS in the key
//      (knowledge-cluster §4 / inv 8): two scoped-group characters can produce digests for the SAME
//      `(chatId, tier, blockIdx)` from different egocentric POVs — without the character id one POV silently
//      overwrites the other. It is ALWAYS a real `CharacterId` (NO `''` sentinel, NO NULL — D20/inv 8).
//   2. `dedupeRankedBlocks` — collapse rows sharing a `BlockKey` (a digest + its segment of the same block;
//      the JOINT cross-chat list carries both lenses) to ONE: the better-RANKED representative wins (input
//      is best-first, so keep the first seen).
//   3. `collapseByContentHash` — collapse fork/import copies (identical `contentHash` across chats) AFTER
//      ranking, BEFORE the k-cap (inv 6 — the better-ranked representative wins; the consumer gets distinct
//      blocks). search.md homes this in `@orb/server/kit` eventually; kept search-local until that primitive
//      exists (the placeholder `@orb/server/kit/content-hash` is not built — FLAG[PD-35]).

import type { BlockKey } from "@orb/contracts/search";

/** The stable string identity of a block (the dedupe key). Mirrors the chat-side `blockKeyStr` shape so the
 *  same `(chatId, tier, blockIdx, scopedCharacterId)` maps consistently across the domain seam. */
export function blockKeyStr(k: BlockKey): string {
  return `${k.chatId}|${k.tier}|${k.blockIdx}|${k.scopedCharacterId}`;
}

/** Keep the first (best-ranked) row per `BlockKey`; drop later duplicates. Input MUST be best-first. */
export function dedupeRankedBlocks<T extends { readonly blockKey: BlockKey }>(
  ranked: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of ranked) {
    const key = blockKeyStr(row.blockKey);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/** Keep the first (best-ranked) row per `contentHash`; collapse fork/import copies. Input MUST be best-first. */
export function collapseByContentHash<T extends { readonly contentHash: string }>(
  ranked: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of ranked) {
    if (!seen.has(row.contentHash)) {
      seen.add(row.contentHash);
      out.push(row);
    }
  }
  return out;
}
