import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { MemoryEmbedSpace } from "#domain/chat";
import type { WorkloadService } from "#domain/workloads";
import type { EmbeddingsService } from "./service.ts";

export interface EmbeddingReindexDeps {
  readonly now: () => number;
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  readonly startWorkload: WorkloadService["start"];
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<MemoryEmbedSpace | null>;
  readonly purgeMemoryVectors: EmbeddingsService["purgeMemoryVectors"];
  readonly staleGenerationOwners: EmbeddingsService["staleGenerationOwners"];
}

export interface EmbeddingReindexTriggers {
  readonly enqueueEmbedReindex: (scope: UserId | null) => Promise<void>;
  readonly detachEmbedReindex: (scope: UserId | null) => void;
  readonly detachRepointReindex: (ownerId: UserId) => void;
  readonly detachStaleSpaceReindex: () => void;
  readonly refreshAutoindex: () => void;
}

export interface VacuousMemoryReceiptDeps {
  readonly isMemoryEnabled: (ownerId: UserId) => Promise<boolean>;
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration">;
}
