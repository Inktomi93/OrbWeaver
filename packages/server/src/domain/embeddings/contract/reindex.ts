import type { MemoryEmbedSpace } from "@orb/contracts/embeddings";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { StartWorkloadOp } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import type { superviseDetached } from "#foundation/observability";
import type { EmbeddingsService } from "./service.ts";

export interface VacuousMemoryReceipt extends MemoryEmbedSpace {
  readonly onlyIf: SQL | null;
}

export interface EmbeddingReindexDeps {
  readonly supervise?: typeof superviseDetached | undefined;
  readonly now: () => number;
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  readonly startWorkload: StartWorkloadOp;
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<VacuousMemoryReceipt | null>;
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
  readonly emptyMemoryScope: (ownerId: UserId) => Promise<SQL | null>;
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration">;
}
