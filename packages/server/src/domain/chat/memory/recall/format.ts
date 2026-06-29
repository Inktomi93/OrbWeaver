// domain/chat/memory/recall/format — assemble recalled blocks → the `{{memory}}` string GATHER consumes
// (chat.md Part II §2 GATHER; §3b). PURE. The block ORDER is the caller's (chronological for mixA/tiered,
// ranked for mixB/mixC); format preserves it and drops a key with no loaded row.
//
// FLAG[no-digest-body]: `chat_digests` persists only the topic anchor + keywords (the retrieval facets); the
// significance-filtered FACTS body lives only in the embedding (the schema is born-compliant — no body column,
// and memory cannot add one). So `{{memory}}` surfaces the anchor + keywords per block — token-bounded +
// distilled, using only persisted data. A richer recall (a digest-body column, or tier-0 verbatim resolved
// from canon via the segment seq-span) is a schema/contract decision for the embeddings/search owner.

import type { BlockKey } from "@orb/contracts/search";
import { renderDigestFacets } from "../build/substrate/parse";
import type { DigestRow } from "../types";

/** The stable string identity of a {@link BlockKey} (the `byKey` map key). */
export function blockKeyStr(k: BlockKey): string {
  return `${k.chatId}|${k.tier}|${k.blockIdx}|${k.scopedCharacterId}`;
}

/** Format the ordered recalled keys → the `{{memory}}` string: each block's persisted facets (anchor +
 *  keywords), blank-line separated, in the given order. A key with no row in `byKey` is dropped (a search hit
 *  that fell outside the loaded scope). Empty input → `""` (no `{{memory}}` content). */
export function formatMemory(
  orderedKeys: readonly BlockKey[],
  byKey: ReadonlyMap<string, DigestRow>,
): string {
  const parts: string[] = [];
  for (const key of orderedKeys) {
    const row = byKey.get(blockKeyStr(key));
    if (row === undefined) {
      continue;
    }
    const facets = renderDigestFacets(row);
    if (facets.length > 0) {
      parts.push(facets);
    }
  }
  return parts.join("\n\n");
}
