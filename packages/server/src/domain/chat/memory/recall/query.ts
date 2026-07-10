// domain/chat/memory/recall/query — build the `MemoryQueryOptions` memory threads into `search.digests`
// (domains/memory.md §3b/§6). The chat-scope (#5), the egocentric `scopedCharacterId` (#4), the
// name-prefixed query TEXT (#4), and the knobs (#6) ALL ride `MemoryQueryOptions` (the `@orb/contracts/search`
// seam — the foundation homed `queryText`/`scopedCharacterId` there; the chat-side wrapper is gone). PURE —
// the egocentric query text is memory's pre-call assembly (the resolved-name two-phase, §3 rule 4); the cosine
// scan is search's. `candidates` is left ABSENT here (the bridge restriction is layered by `recall.ts`).

import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowMacroNameContext, RowPersonaName } from "@orb/kit/macro";
import { renderTranscript } from "../build/substrate/transcript";
import type { MemoryScope, MsgRow, ResolvedMemoryConfig } from "../types";

/** Build the recall query for mixB/mixC: the egocentric (name-prefixed) text over the recent `queryWindow`
 *  messages + the chat-scope + the egocentric bucket + the resolved knobs, all on `MemoryQueryOptions`.
 *  `recent` is oldest→newest; the last `queryWindow` form the retrieval query (the protected-tail-aware recent
 *  window — §3 rule 4 resolved form). `scopedCharacterId` is a real `CharacterId` (inv 8). */
export function buildRecallQuery(
  cfg: ResolvedMemoryConfig,
  scope: MemoryScope,
  recent: readonly MsgRow[],
  names: ReadonlyMap<CharacterId, string>,
): MemoryQueryOptions {
  const window = recent.slice(Math.max(0, recent.length - cfg.queryWindow));
  return {
    scope: { chat: scope.chatId },
    queryText: renderTranscript(window, recallMacroNames(names)),
    scopedCharacterId: scope.scopedCharacterId,
    mode: cfg.mode,
    verbatimWindow: cfg.verbatimWindow,
    keywordMatch: cfg.keywordMatch,
    recencyBias: cfg.recencyBias,
    minScore: cfg.minScore,
  };
}

/** Adapt recall's char-name map (the gather producer, `assemble-gather.ts`) into the `resolveRowMacros`
 *  context `renderTranscript` takes. Recall carries CHARACTER names only (its query text labels + resolves
 *  `{{char}}` per row for embed-index parity with the digest body); the persona map is empty here, so a query
 *  row's `{{user}}` floors to "User" — the recall query text is a fuzzy semantic embed, not per-persona keyed. */
function recallMacroNames(names: ReadonlyMap<CharacterId, string>): RowMacroNameContext {
  return {
    characterNamesById: new Map([...names].map(([id, name]) => [id, { name }])),
    personaNamesById: new Map<PersonaId, RowPersonaName>(),
  };
}
