import type { WorkloadRunScope } from "@orb/contracts/workloads";
// The databank and memory sweeps' completion ops: which owners a sweep covered, and the per-owner receipt each
// records. Kept apart from the keystone so the completion suites run these exact ops instead of copies.

import type { DocumentVectorSweepReceipt } from "@orb/contracts/embeddings";
import type { UserId } from "@orb/kit/ids";
import type { VectorSweepDeps, VectorSweepOps } from "../contract/vector-sweep-ops.ts";

/**
 * THE COVERED SET of a vector sweep comes from its ENUMERATION SCOPE: `null` is the bulk arm, whose covered set is
 * exactly `listCorpusOwners()`; a `UserId` is a per-owner catch-up, whose covered set is that one owner. Deriving it
 * here rather than fencing the call is what lets a singular pass record its own `embed_space_state` completion
 * without ever reaching a neighbour's live space. Completion and the old-space reclaim are PER OWNER (vector tasks
 * are owner-scoped, §7.5).
 */
export function createVectorSweepOps(deps: VectorSweepDeps): VectorSweepOps {
  const { embeddings } = deps;
  const sweptOwners = async (enumerationScope: WorkloadRunScope): Promise<readonly UserId[]> =>
    enumerationScope.ownerId === null ? await deps.listCorpusOwners(enumerationScope.everyOwnerRun) : [enumerationScope.ownerId];
  return {
    beginDocumentVectorSweep: async (enumerationScope): Promise<readonly DocumentVectorSweepReceipt[]> => {
      const receipts: DocumentVectorSweepReceipt[] = [];
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
