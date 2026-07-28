// The deep canon-window read op (crunchy-cluster §1.3 — the `resyncFromStory` host escape hatch's story feed).
// STANDALONE + principal-free (the `resolveRpgRoster`/`postNarratorMessage` injected-op precedent — the rpg
// resync verb gated its HOST caller before invoking; this op only reads canon). Homed in chat because the canon
// read + the name-stamp joins are chat's — rpg stays table-blind (§2 one-directional flow: rpg receives STORY
// TEXT AS DATA, reads no chat table).
//
// The projection is the SAME shared builder the ENGINE threads at `fireRpgTurnCompleted` (`substrate/
// rpg-transcript.ts`), so the in-turn state round and the resync deep-read can never drift — the resync reads
// the story exactly as the per-turn round does, just deeper. Room-plane per D106 ("the prompt is the room's",
// turn assembly is deliberately unclamped — no viewer floor applies to a model-facing read). Hidden-class spans
// stay INTACT (the resync is model-plane — the model always reads its own lies, D110 §3.6; the member never
// sees this read, and a deception-active game's tracker stays surface-only by the §1.6 extraction-prompt clause,
// NOT by redacting this feed).

import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import type { ChatContext } from "../context";
import type { ResolveCanonWindow } from "../contract/context";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import { loadCanonHistory } from "../persistence/queries";
import { projectRpgTranscript, sliceCanonWindow } from "../substrate/rpg-transcript";

export function createResolveCanonWindow(ctx: ChatContext): ResolveCanonWindow {
  return async (chatId, opts) => {
    // The selected-lineage canon (oldest→newest), each slot joined to its selected variant — the SAME substrate
    // the engine's state round reasons from.
    const canon = await loadCanonHistory(ctx.db, chatId);
    if (canon.length === 0) {
      return [];
    }
    // The name producer covers every character/persona id the loaded canon stamps (the engine's per-turn build,
    // off the messages this time — a resync has no live turn prep). Names-only, member-gated (a co-participant's
    // name is not a further secret; §1 macro-names).
    const producer = await loadChatMacroNameProducer(ctx.db, { messages: canon });
    const names = {
      characterNamesById: buildCharacterNameMap(producer.characterNames),
      personaNamesById: buildPersonaNameMap(producer.personaNames),
    };
    // Slice to the deep budget (newest-first fill, restored to chronological order — whole messages).
    return sliceCanonWindow(projectRpgTranscript(canon, names), opts.maxTokens);
  };
}
