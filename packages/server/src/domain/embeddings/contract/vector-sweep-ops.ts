import type { DocumentVectorSweepReceipt, MemoryEmbedSpace } from "@orb/contracts/embeddings";
import type { UserId } from "@orb/kit/ids";
import type { EmbeddingsService } from "./service.ts";

export interface VectorSweepDeps {
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration" | "purgeDocumentVectors" | "purgeMemoryVectors">;
  readonly listCorpusOwners: () => Promise<readonly UserId[]>;
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<MemoryEmbedSpace | null>;
}
export interface VectorSweepOps {
  readonly beginDocumentVectorSweep: (enumerationScope: UserId | null) => Promise<readonly DocumentVectorSweepReceipt[]>;
  readonly purgeDocumentVectors: (receipts: readonly DocumentVectorSweepReceipt[]) => Promise<void>;
  readonly purgeMemoryVectors: (spaces: readonly MemoryEmbedSpace[], enumerationScope: UserId | null) => Promise<void>;
}
