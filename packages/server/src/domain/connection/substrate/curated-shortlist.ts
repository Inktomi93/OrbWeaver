// domain/connection/substrate/curated-shortlist — the substrate MEDIATOR for the `catalog/` subsystem's
// curated Claude shortlist, projected into the `getModelsForSource` picker shape
// (domain-substrate-mediates-subsystems: a verb reaches a named subsystem ONLY through substrate). The
// `getModelsForSource` max-pro-sub arm calls this when the agent-sdk snapshot is cold/empty — the curated
// `CHAT_MODELS` trio is the cold-cache fallback (CONNECTIONS-BUILD-SPEC §2.3). PURE.

import { CHAT_MODELS } from "../catalog/chat-models.ts";
import type { SourceModelEntry } from "../contract/results.ts";

/** The curated Claude shortlist as picker entries (`origin: "curated"`) — the max-pro-sub cold-cache
 *  fallback. The single seam the verb uses (no direct `catalog/` reach). */
export function curatedShortlistEntries(): SourceModelEntry[] {
  return CHAT_MODELS.map((m) => ({ id: m.id, label: m.label, origin: "curated" }));
}
