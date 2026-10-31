import type { IsMemoryEnabledOp } from "@orb/contracts/chat";
import type { MemoryEmbedSpace } from "@orb/contracts/embeddings";
import type { GetEffectiveConfigOp } from "@orb/contracts/settings";
import type { StartWorkloadOp } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import type { SQL } from "drizzle-orm";
import type { DetachedSupervision, Logger, TraceRing } from "#foundation/observability";
import type { EmbeddingsService } from "./service.ts";

export interface VacuousMemoryReceipt extends MemoryEmbedSpace {
  readonly onlyIf: SQL | null;
}

export interface EmbeddingReindexDeps {
  readonly logger: Logger;
  /** The root's trace ring each supervised sweep seals into. */
  readonly traces: TraceRing;
  readonly supervise?: DetachedSupervision["superviseDetached"] | undefined;
  readonly now: Clock;
  readonly getEffectiveConfig: GetEffectiveConfigOp;
  readonly startWorkload: StartWorkloadOp;
  readonly vacuousMemoryReceipt: (ownerId: UserId) => Promise<VacuousMemoryReceipt | null>;
  readonly purgeMemoryVectors: EmbeddingsService["purgeMemoryVectors"];
  readonly staleGenerationOwners: EmbeddingsService["staleGenerationOwners"];
}

export interface EmbeddingReindexTriggers {
  readonly detachEmbedReindex: (scope: UserId | null) => void;
  readonly detachRepointReindex: (ownerId: UserId) => void;
  readonly detachStaleSpaceReindex: () => void;
  readonly refreshAutoindex: () => void;
}

export interface VacuousMemoryReceiptDeps {
  readonly isMemoryEnabled: IsMemoryEnabledOp;
  readonly emptyMemoryScope: (ownerId: UserId) => Promise<SQL | null>;
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration">;
}
