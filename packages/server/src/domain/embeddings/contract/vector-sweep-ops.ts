import type { DocumentVectorSweepReceipt, MemoryEmbedSpace } from "@orb/contracts/embeddings";
import type { EveryOwnerRun, WorkloadRunScope } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { VacuousMemoryReceipt } from "./reindex.ts";
import type { EmbeddingsService } from "./service.ts";

export interface VectorSweepDeps {
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration" | "purgeDocumentVectors" | "purgeMemoryVectors">;
  readonly listCorpusOwners: (run: EveryOwnerRun) => Promise<readonly UserId[]>;
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<VacuousMemoryReceipt | null>;
}
export interface VectorSweepOps {
  readonly beginDocumentVectorSweep: (enumerationScope: WorkloadRunScope) => Promise<readonly DocumentVectorSweepReceipt[]>;
  readonly purgeDocumentVectors: (receipts: readonly DocumentVectorSweepReceipt[]) => Promise<void>;
  readonly purgeMemoryVectors: (spaces: readonly MemoryEmbedSpace[], enumerationScope: WorkloadRunScope) => Promise<void>;
}
