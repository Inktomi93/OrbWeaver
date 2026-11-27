// @subject packages/server/src/domain/stats/persistence/embedding-calls.ts
// @subject packages/server/src/domain/stats/verbs/embedding-calls.ts
// The owner reads the embedding_calls history the real executor writes: each paid call with its task, inputs, tokens,
// cost provenance, outcome and the connection it ran under, newest first, and nobody else's.

import { expect } from "@orb/testkit/node";
import { FUNDING_MODEL, fundingConnection, test } from "../../embeddings/verbs/runtime-funding.fixtures.ts";

test("the owner's embedding history lists each real call newest first with its task, inputs, tokens, outcome and connection, and no other owner's", async ({
  app,
  harness,
  ownerCaller,
}) => {
  const embedding = await fundingConnection({ ownerCaller, harness, task: "embed" });
  await app.runtime.executor.embed({ signal: new AbortController().signal, connection: embedding, input: "banana" });
  const reranker = await fundingConnection({ ownerCaller, harness, task: "rerank" });
  await app.runtime.executor.rerank({
    signal: new AbortController().signal,
    connection: reranker,
    query: "control",
    documents: [
      { id: "first", text: "control" },
      { id: "second", text: "another" },
    ],
  });

  const calls = await harness.services.stats.embeddingCalls(harness.ownerId);
  expect(calls.map((call) => call.task)).toEqual(["rerank", "embed"]);
  const [rerank, embed] = calls;
  expect(embed).toMatchObject({
    model: FUNDING_MODEL,
    provider: embedding.providerId,
    inputCount: 1,
    inputModalities: ["text"],
    totalTokens: 1,
    outcome: "completed",
  });
  expect(rerank).toMatchObject({ inputCount: 2, outcome: "completed" });
  // The connection reads by the label its owner gave it, not by id.
  const labels = new Map((await ownerCaller.connection.list()).map((row) => [row.id, row.label]));
  expect(embed?.connectionLabel).toBe(labels.get(embedding.connectionId));
  expect(rerank?.connectionLabel).toBe(labels.get(reranker.connectionId));

  // Control: the limit narrows to the newest, and another owner reads none of it.
  expect((await harness.services.stats.embeddingCalls(harness.ownerId, { limit: 1 })).map((call) => call.task)).toEqual(["rerank"]);
  expect(await harness.services.stats.embeddingCalls(harness.idSource.userId())).toEqual([]);
});
