// The execution seam, not a vector writer, owns per-invocation accounting. A completed provider call
// remains an execution fact even when a later vector write cannot land.

import type { EmbeddingBatchObservation } from "@orb/contracts/embeddings";
import type { Wire } from "@orb/contracts/inference";
import { EMBEDDING_FLOOR } from "@orb/contracts/inference";
import type { ProviderBackend } from "../../../packages/inference/src/contract/backend.ts";
import { createProviderExecutor } from "../../../packages/inference/src/roles/executor.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeDeps, fakeResolved } from "../_support.ts";

test("the common executor starts and settles embedding accounting under the resolved connection", async () => {
  const connection = fakeResolved({
    task: "embed",
    providerId: "google",
    model: "gemini-embedding-2",
    capability: { kind: "embedding", embedding: EMBEDDING_FLOOR },
  });
  const registry = new Map<Wire, ProviderBackend>([
    [
      connection.wire,
      {
        wire: connection.wire,
        embed: () => Promise.resolve({ vectors: [new Float32Array([1])], model: connection.model, usage: { promptTokens: 34, totalTokens: null } }),
      },
    ],
  ]);
  let starts = 0;
  const completed: boolean[] = [];
  const args = {
    registry,
    span: fakeDeps().span,
    beginEmbeddingAccounting: () => {
      starts += 1;
      return {
        recordBatch: () => Promise.resolve(),
        finish: (success: boolean) => {
          completed.push(success);
          return Promise.resolve();
        },
      };
    },
  };
  const executor = createProviderExecutor(args);
  const result = await executor.embed({ connection, input: "banana" });
  expect(result.usage.promptTokens).toBe(34);
  expect(starts).toBe(1);
  expect(completed).toEqual([true]);
});

test("durable observation failure never reruns embedding work and preserves settlement failure", async () => {
  const connection = fakeResolved({
    task: "embed",
    providerId: "google",
    model: "gemini-embedding-2",
    capability: { kind: "embedding", embedding: EMBEDDING_FLOOR },
  });
  const appendError = new Error("durable append refused");
  const settlementError = new Error("settlement refused");
  const outcomes: boolean[] = [];
  let requests = 0;
  const batch: EmbeddingBatchObservation = {
    inputCount: 1,
    inputModalities: ["text"],
    servedModel: null,
    usage: { promptTokens: 34, totalTokens: null },
    tokenDetails: null,
    cost: { costUsd: null, costDetails: null, costProvenance: "unrecorded" },
  };
  const registry = new Map<Wire, ProviderBackend>([
    [
      connection.wire,
      {
        wire: connection.wire,
        embed: async (req) => {
          requests += 1;
          await req.embeddingAccounting?.recordBatch(batch);
          return { vectors: [new Float32Array([1])], model: connection.model, usage: batch.usage };
        },
      },
    ],
  ]);
  const executor = createProviderExecutor({
    registry,
    span: fakeDeps().span,
    beginEmbeddingAccounting: () => ({
      recordBatch: () => Promise.reject(appendError),
      finish: (success) => {
        outcomes.push(success);
        return Promise.reject(settlementError);
      },
    }),
  });
  await expect(executor.embed({ connection, input: "banana" })).rejects.toMatchObject({
    cause: appendError,
    errors: [appendError, settlementError],
  });
  expect(requests).toBe(1);
  expect(outcomes).toEqual([false]);
});
