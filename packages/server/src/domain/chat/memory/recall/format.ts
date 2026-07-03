// domain/chat/memory/recall/format — assemble recalled blocks → the `{{memory}}` string GATHER consumes.
// PURE. The block ORDER is the caller's (chronological for mixA/tiered,
// ranked for mixB/mixC); format preserves it and drops a key with no loaded row.
//
// `{{memory}}` is the stored digest `text` (§2b — the distilled topic-anchor + significance-filtered facts +
// keywords folded into one persisted body, written by `embeddings.store`). The foundation gave `chat_digests`
// a NOT-NULL `text` column, so the recall surfaces the full distilled body per block (not just the
// anchor+keywords facets), blank-line separated, token-bounded.

import type { BlockKey } from "@orb/contracts/search";
import type { DigestRow } from "../types";

/** The stable string identity of a {@link BlockKey} (the `byKey` map key). */
export function blockKeyStr(k: BlockKey): string {
  return `${k.chatId}|${k.tier}|${k.blockIdx}|${k.scopedCharacterId}`;
}

/** Format the ordered recalled keys → the `{{memory}}` string: each block's stored distilled `text` (§2b),
 *  blank-line separated, in the given order. A key with no row in `byKey` is dropped (a search hit that fell
 *  outside the loaded scope). Empty input / all-blank → `""` (no `{{memory}}` content). */
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
    const body = row.text.trim();
    if (body.length > 0) {
      parts.push(body);
    }
  }
  return parts.join("\n\n");
}
