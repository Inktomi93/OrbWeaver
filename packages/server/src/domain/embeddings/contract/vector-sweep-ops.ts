import type { BeginDocumentVectorSweepOp, PurgeDocumentVectorsOp, PurgeMemoryVectorsOp } from "@orb/contracts/embeddings";
import type { ListCorpusOwners } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { VacuousMemoryReceipt } from "./reindex.ts";
import type { EmbeddingsService } from "./service.ts";

export interface VectorSweepDeps {
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration" | "purgeDocumentVectors" | "purgeMemoryVectors">;
  readonly listCorpusOwners: ListCorpusOwners;
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<VacuousMemoryReceipt | null>;
}
export interface VectorSweepOps {
  readonly beginDocumentVectorSweep: BeginDocumentVectorSweepOp;
  readonly purgeDocumentVectors: PurgeDocumentVectorsOp;
  readonly purgeMemoryVectors: PurgeMemoryVectorsOp;
}
