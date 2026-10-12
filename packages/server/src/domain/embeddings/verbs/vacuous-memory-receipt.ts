// Memory-off owners have no vectors to build, so their current target can complete vacuously.

import type { UserId } from "@orb/kit/ids";
import type { MemoryEmbedSpace } from "#domain/chat";
import type { VacuousMemoryReceiptDeps } from "../contract/reindex.ts";

/** Resolve a memory-off owner's current target receipt; enabled owners must complete their real sweep. */
export function createVacuousMemoryReceipt(deps: VacuousMemoryReceiptDeps): (ownerId: UserId) => Promise<MemoryEmbedSpace | null> {
  return async (ownerId) => {
    if (await deps.isMemoryEnabled(ownerId)) {
      return null;
    }
    const generation = await deps.embeddings.resolveGeneration(ownerId, "embed");
    return generation === null ? null : { ownerId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch };
  };
}
