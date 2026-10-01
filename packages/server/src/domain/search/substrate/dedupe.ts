// Post-rank collapse retains the best representative; block keys distinguish egocentric perspectives.

import type { BlockKey } from "@orb/contracts/search";
import type { ChatId } from "@orb/kit/ids";

export function blockKeyStr(k: BlockKey): string {
  return `${k.chatId}|${k.tier}|${k.blockIdx}|${k.scopedCharacterId}`;
}

/** Collapse a chat BLOCK's chunk rows to its best-scoring one. Input MUST be best-first.
 *
 *  `chat_segments` holds N rows per `(chat, block)` since #172 — a block too big for the embed window is
 *  CHUNKED rather than truncated. Every caller of the verbatim scan reasons in BLOCKS (a `BlockKey` carries no
 *  chunk, the display credit resolves a block to its characters, discover counts one match per scene), so a
 *  raw chunk list would double-count one scene and hand back duplicate ids. Collapsing to the best chunk is
 *  the honest projection: the chunk that actually matched is the one that scored. */
export function collapseSegmentChunks<T extends { readonly chatId: ChatId; readonly blockIdx: number }>(ranked: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of ranked) {
    const key = `${row.chatId}|${row.blockIdx}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/** Collapse fork/import copies. Input MUST be best-first. */
export function collapseByContentHash<T extends { readonly contentHash: string }>(ranked: readonly T[]): T[] {
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
