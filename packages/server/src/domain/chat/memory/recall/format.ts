// domain/chat/memory/recall/format — assemble recalled blocks → the `{{memory}}` string GATHER consumes.
// PURE. The block ORDER is the caller's (chronological for mixA/tiered,
// ranked for mixB/mixC); format preserves it and drops a key with no loaded row.
//
// `{{memory}}` is the stored digest `text` (§2b — the distilled topic-anchor + significance-filtered facts +
// keywords folded into one persisted body, written by `embeddings.store`). The foundation gave `chat_digests`
// a NOT-NULL `text` column, so the recall surfaces the full distilled body per block (not just the
// anchor+keywords facets), blank-line separated, token-bounded.
//
// It returns the RENDERED KEYS beside the string (#250): the recall trace's "admitted" set must be what
// actually reached the prompt, and deriving that by re-running this function's own drop rules at the call
// site is how a trace starts lying about a block it says it surfaced.

import type { BlockKey } from "@orb/contracts/search";
import type { DigestRow } from "../types.ts";

/** The stable string identity of a {@link BlockKey} (the `byKey` map key). */
export function blockKeyStr(k: BlockKey): string {
  return `${k.chatId}|${k.tier}|${k.blockIdx}|${k.scopedCharacterId}`;
}

/** Format the ordered recalled keys → the `{{memory}}` string: each block's stored distilled `text` (§2b),
 *  blank-line separated, in the given order. A key with no row in `byKey` is dropped (a search hit that fell
 *  outside the loaded scope). Empty input / all-blank → `""` (no `{{memory}}` content). `rendered` is the
 *  ordered subset that actually contributed — the recall trace's admitted set (#250). */
export function formatMemory(orderedKeys: readonly BlockKey[], byKey: ReadonlyMap<string, DigestRow>): { text: string; rendered: readonly BlockKey[] } {
  const parts: string[] = [];
  const rendered: BlockKey[] = [];
  for (const key of orderedKeys) {
    const row = byKey.get(blockKeyStr(key));
    if (row === undefined) {
      continue;
    }
    const body = row.text.trim();
    if (body.length > 0) {
      parts.push(body);
      rendered.push(key);
    }
  }
  return { text: parts.join("\n\n"), rendered };
}
