// The databank and memory sweeps' completion ops: which owners a sweep covered, and the per-owner receipt each
// records. Kept apart from the keystone so the completion suites run these exact ops instead of copies.

import type { UserId } from "@orb/kit/ids";
import type { ChatWorkloadDeps, MemoryEmbedSpace } from "#domain/chat";
import type { DatabankWorkloadDeps } from "#domain/databank";
import type { EmbeddingsService, GenerationReceipt } from "#domain/embeddings";

/**
 * A memory-off owner's memory receipt against their current target, or `null`. They have no memory vectors, so the
 * scope is vacuously in the target space; an ENABLED owner gets none, because its own memory sweep records it.
 */
export function createVacuousMemoryReceipt(deps: {
  readonly isMemoryEnabled: (ownerId: UserId) => Promise<boolean>;
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration">;
}): (ownerId: UserId) => Promise<MemoryEmbedSpace | null> {
  return async (ownerId) => {
    if (await deps.isMemoryEnabled(ownerId)) {
      return null;
    }
    const generation = await deps.embeddings.resolveGeneration(ownerId, "embed");
    return generation === null ? null : { ownerId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch };
  };
}

/**
 * THE COVERED SET of a vector sweep comes from its ENUMERATION SCOPE: `null` is the bulk arm, whose covered set is
 * exactly `listCorpusOwners()`; a `UserId` is a per-owner catch-up, whose covered set is that one owner. Deriving it
 * here rather than fencing the call is what lets a singular pass record its own `embed_space_state` completion
 * without ever reaching a neighbour's live space. Completion and the old-space reclaim are PER OWNER (vector tasks
 * are owner-scoped, §7.5).
 */
export function createVectorSweepOps(deps: {
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration" | "purgeDocumentVectors" | "purgeMemoryVectors">;
  readonly listCorpusOwners: () => Promise<readonly UserId[]>;
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<MemoryEmbedSpace | null>;
}): Pick<DatabankWorkloadDeps, "beginDocumentVectorSweep" | "purgeDocumentVectors"> & Pick<ChatWorkloadDeps, "purgeMemoryVectors"> {
  const { embeddings } = deps;
  const sweptOwners = async (enumerationScope: UserId | null): Promise<readonly UserId[]> =>
    enumerationScope === null ? await deps.listCorpusOwners() : [enumerationScope];
  return {
    beginDocumentVectorSweep: async (enumerationScope): Promise<readonly { ownerId: UserId; generation: GenerationReceipt }[]> => {
      const receipts: { ownerId: UserId; generation: GenerationReceipt }[] = [];
      for (const ownerId of await sweptOwners(enumerationScope)) {
        const generation = await embeddings.resolveGeneration(ownerId, "embed");
        if (generation !== null) {
          receipts.push({ ownerId, generation });
        }
      }
      return receipts;
    },
    purgeDocumentVectors: async (receipts): Promise<void> => {
      for (const receipt of receipts) {
        await embeddings.purgeDocumentVectors(receipt);
      }
    },
    // A swept owner the memory sweep built no space for falls back to the vacuous receipt.
    purgeMemoryVectors: async (spaces, enumerationScope): Promise<void> => {
      const completed = new Map(spaces.map((space) => [space.ownerId, space]));
      for (const ownerId of await sweptOwners(enumerationScope)) {
        const receipt = completed.get(ownerId) ?? (await deps.vacuousMemoryReceipt(ownerId));
        if (receipt === null) {
          continue;
        }
        await embeddings.purgeMemoryVectors({
          ownerId,
          generation: { id: receipt.generationId, task: "embed", via: "embed", epoch: receipt.generationEpoch, space: receipt.model },
        });
      }
    },
  };
}
