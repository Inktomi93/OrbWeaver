// domain/search/substrate/dedupe — post-rank collapse helpers. Pure functions over an already-ranked
// (best-first) list; keeping the first seen keeps the better-ranked representative. scopedCharacterId is
// always in the BlockKey since two scoped-group characters can produce digests for the same
// (chatId, tier, blockIdx) from different egocentric POVs.

import type { BlockKey } from "@orb/contracts/search";

export function blockKeyStr(k: BlockKey): string {
  return `${k.chatId}|${k.tier}|${k.blockIdx}|${k.scopedCharacterId}`;
}

/** Input MUST be best-first. */
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

/** Collapse fork/import copies. Input MUST be best-first. */
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
