// domain/chat/memory/recall/query — build the recall query memory threads into `search.digests` (chat.md
// §11 semantics #4/#5/#6). The chat-scope (#5) + the knobs (#6) ride `MemoryQueryOptions` (the
// `@orb/contracts/search` seam — owner-wide scan does NOT model chat-scope, so it is first-class there); the
// egocentric `scopedCharacterId` (#4) + the name-prefixed query TEXT (#4) ride the chat-side `MemoryRecallQuery`
// wrapper (FLAG[search-contract] in `contract/context.ts` — those two are missing from `MemoryQueryOptions`).
// PURE — the egocentric query text is memory's pre-call assembly (the resolved-name two-phase, §3 rule 4); the
// cosine scan is search's. `candidates` is left ABSENT here (the full scoped pool); the tiered-bridge restriction
// is the future retrieval-combined path (`bridge.ts`).

import type { CharacterId } from "@orb/kit/ids";
import type { MemoryRecallQuery } from "../../contract/context";
import { renderTranscript } from "../build/substrate/transcript";
import type { MemoryScope, MsgRow, ResolvedMemoryConfig } from "../types";

/** Build the recall query for mixB/mixC: the egocentric (name-prefixed) text over the recent `queryWindow`
 *  messages + the `MemoryQueryOptions` (chat-scope + the resolved knobs). `recent` is oldest→newest; the last
 *  `queryWindow` form the retrieval query (the protected-tail-aware recent window — §3 rule 4 resolved form). */
export function buildRecallQuery(
  cfg: ResolvedMemoryConfig,
  scope: MemoryScope,
  recent: readonly MsgRow[],
  names: ReadonlyMap<CharacterId, string>,
): MemoryRecallQuery {
  const window = recent.slice(Math.max(0, recent.length - cfg.queryWindow));
  return {
    text: renderTranscript(window, names),
    scopedCharacterId: scope.scopedCharacterId,
    options: {
      scope: { chat: scope.chatId },
      mode: cfg.mode,
      verbatimWindow: cfg.verbatimWindow,
      keywordMatch: cfg.keywordMatch,
      recencyBias: cfg.recencyBias,
      minScore: cfg.minScore,
    },
  };
}
