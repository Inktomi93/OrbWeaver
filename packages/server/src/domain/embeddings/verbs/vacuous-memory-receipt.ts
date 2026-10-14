// Empty present-host universes need no memory build; enabled nonempty owners still owe their real sweep.

import type { UserId } from "@orb/kit/ids";
import type { VacuousMemoryReceipt, VacuousMemoryReceiptDeps } from "../contract/reindex.ts";

/** Resolve the current target for an off owner or a natively fenced empty present-host scope. */

export function createVacuousMemoryReceipt(deps: VacuousMemoryReceiptDeps): (ownerId: UserId) => Promise<VacuousMemoryReceipt | null> {
  return async (ownerId) => {
    const enabled = await deps.isMemoryEnabled(ownerId);
    const onlyIf = enabled ? await deps.emptyMemoryScope(ownerId) : null;
    if (enabled && onlyIf === null) {
      return null;
    }
    const generation = await deps.embeddings.resolveGeneration(ownerId, "embed");
    return generation === null ? null : { ownerId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch, onlyIf };
  };
}
