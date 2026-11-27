// Execution accounting belongs to the embedding invocation, never to a vector row. A paid response
// survives a later width refusal, generation switch or vector purge; batches do not multiply per input.

import type { ModelId, UserConnectionId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import { modalitySchema } from "../inference/modalities.ts";
import type { ProviderId } from "../inference/provider-id.ts";
import { costUsageSchema, tokenDetailsSchema } from "../inference/usage.ts";
import type { Wire } from "../inference/wires.ts";
import { embedUsageSchema } from "../providers/index.ts";

export const EMBEDDING_TASKS = ["embed", "imageEmbed"] as const;
export type EmbeddingTask = (typeof EMBEDDING_TASKS)[number];
/** The tasks whose paid calls the `embedding_calls` ledger records. A rerank call is paid like an embedding batch but
 *  writes no vector, so it joins the ledger without joining {@link EMBEDDING_TASKS}, which names the tasks that own
 *  a vector space and generation. */
export const EMBEDDING_CALL_TASKS = [...EMBEDDING_TASKS, "rerank"] as const;
export type EmbeddingCallTask = (typeof EMBEDDING_CALL_TASKS)[number];
export const EMBEDDING_INVOCATION_OUTCOMES = ["completed", "failed"] as const;
export type EmbeddingInvocationOutcome = (typeof EMBEDDING_INVOCATION_OUTCOMES)[number];

export const embeddingBatchObservationSchema = z.strictObject({
  inputCount: z.int().positive(),
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
  readonly task: EmbeddingCallTask;
}

export interface EmbeddingAccounting {
  readonly recordBatch: (batch: EmbeddingBatchObservation) => Promise<void>;
  readonly finish: (succeeded: boolean) => Promise<void>;
}
export type BeginEmbeddingAccounting = (context: EmbeddingInvocationContext) => EmbeddingAccounting;
