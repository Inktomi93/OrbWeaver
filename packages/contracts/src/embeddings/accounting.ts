// Execution accounting belongs to the embedding invocation, never to a vector row. A paid response
// survives a later width refusal, generation switch or vector purge; batches do not multiply per input.

import type { ModelId, UserConnectionId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import { modalitySchema } from "../inference/modalities.ts";
import type { ProviderId } from "../inference/provider-schema.ts";
import { costUsageSchema, tokenDetailsSchema } from "../inference/usage.ts";
import type { Wire } from "../inference/wires.ts";
import { embedUsageSchema } from "../providers/index.ts";

export const EMBEDDING_TASKS = ["embed", "imageEmbed"] as const;
export type EmbeddingTask = (typeof EMBEDDING_TASKS)[number];
export const EMBEDDING_INVOCATION_OUTCOMES = ["completed", "failed"] as const;
export type EmbeddingInvocationOutcome = (typeof EMBEDDING_INVOCATION_OUTCOMES)[number];

export const embeddingBatchObservationSchema = z.object({
  inputCount: z.number().int().positive(),
  inputModalities: z.array(modalitySchema),
  servedModel: z.string().min(1).nullable(),
  usage: embedUsageSchema,
  tokenDetails: tokenDetailsSchema.nullable(),
  cost: costUsageSchema,
});
export type EmbeddingBatchObservation = z.infer<typeof embeddingBatchObservationSchema>;

export interface EmbeddingInvocationContext {
  readonly ownerId: UserId;
  readonly connectionId: UserConnectionId;
  readonly providerId: ProviderId;
  readonly model: ModelId;
  readonly wire: Wire;
  readonly task: EmbeddingTask;
}

export interface EmbeddingAccounting {
  readonly recordBatch: (batch: EmbeddingBatchObservation) => Promise<void>;
  readonly finish: (succeeded: boolean) => Promise<void>;
}
export type BeginEmbeddingAccounting = (context: EmbeddingInvocationContext) => EmbeddingAccounting;
