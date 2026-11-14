// domain/chat/memory/recall/query — build the `MemoryQueryOptions` memory threads into `search.digests`
// (D55). The window, the scope and the knobs are `@orb/kit/recall` rules; this
// file renders the window text, which needs the chat's name map and its transcript error, then hands it over.
// `candidates` is left ABSENT here (the bridge restriction is layered by `recall.ts`).

import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowMacroNameContext, RowPersonaName } from "@orb/kit/macro";
import { buildRecallQuery as recallQueryOf, recallQueryWindow } from "@orb/kit/recall";
import { renderTranscript } from "../generate/substrate/transcript.ts";
import type { MemoryScope, MsgRow, ResolvedMemoryConfig } from "../types.ts";

/** Build the recall query for mixB/mixC: the egocentric (name-prefixed) text over the recent `queryWindow`
 *  messages + the chat-scope + the egocentric bucket + the resolved knobs, all on `MemoryQueryOptions`.
 *  `recent` is oldest→newest. `scopedCharacterId` is a real `CharacterId` (inv 8). */
export function buildRecallQuery(
  cfg: ResolvedMemoryConfig,
  scope: MemoryScope,
  recent: readonly MsgRow[],
  names: ReadonlyMap<CharacterId, string>,
): Omit<MemoryQueryOptions, "ownerId"> {
  return recallQueryOf(cfg, scope, renderTranscript(recallQueryWindow(recent, cfg.queryWindow), recallMacroNames(names)));
}

/** Adapt recall's char-name map (the gather producer, `assembly/gather.ts`) into the `resolveRowMacros`
 *  context `renderTranscript` takes. Recall carries CHARACTER names only (its query text labels + resolves
 *  `{{char}}` per row for embed-index parity with the digest body); the persona map is empty here, so a query
 *  row's `{{user}}` floors to "User" — the recall query text is a fuzzy semantic embed, not per-persona keyed. */
function recallMacroNames(names: ReadonlyMap<CharacterId, string>): RowMacroNameContext {
  return {
    characterNamesById: new Map([...names].map(([id, name]) => [id, { name }])),
    personaNamesById: new Map<PersonaId, RowPersonaName>(),
  };
}
