// domain/chat/substrate/cue-replay — whether a turn replays each stored reply's cue, and in which role (D262). One home
// for the engine turn and the host previews, so a preview shows the rows the next turn sends.

import type { GenerationCapability } from "@orb/contracts/inference";
import { acceptsHistorySystemRows, acceptsMidConversationSystem, acceptsTurnScopedSystem, bindsThinkingToPrefix } from "@orb/contracts/inference";
import type { CarryReasoning } from "@orb/contracts/preset";
import type { MessageId } from "@orb/kit/ids";
import type { CueReplay, DeliveredCue } from "../contract/results.ts";

/** The cue replay for a turn, or `undefined` when none applies. Only the `conversation` carry replays earlier
 *  turns' thinking, and on a prefix-bound model that thinking is valid only while every row before it is
 *  unchanged, so the cue each reply followed must come back byte for byte (OR-10, `scripts/probes/openrouter/RESULTS.md`).
 *  `tool-chain` replays inside one turn, whose history still holds its cue. Continue and impersonate nudges stay
 *  outside until a probe measures them (D262).
 *  `loadCues` is read only when a replay applies. */
export async function cueReplayFor(
  capability: GenerationCapability,
  carry: CarryReasoning,
  loadCues: () => Promise<ReadonlyMap<MessageId, DeliveredCue>>,
): Promise<CueReplay | undefined> {
  if (carry !== "conversation" || !bindsThinkingToPrefix(capability)) {
    return;
  }
  return {
    cues: await loadCues(),
    // S2 needs the clear-at row, a system row that ends the history (the live turn) and one inside it (the replay).
    turnScoped: acceptsTurnScopedSystem(capability) && acceptsMidConversationSystem(capability) && acceptsHistorySystemRows(capability),
  };
}
