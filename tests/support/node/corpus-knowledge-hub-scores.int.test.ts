// The `csls` workload scores indexed images as well as cards: image_embeddings.hub_score is computed by a run.
// @subject packages/server/src/domain/discovery/workload-contributions.ts
import { imageEmbeddings } from "@orb/db";
import { nonEmpty } from "../iso/non-empty.ts";
import { seedCorpusConnections } from "./corpus-actors.ts";
import { seedCorpusKnowledgeImages } from "./corpus-knowledge-images.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("a csls run scores indexed images", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const owner = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, owner);
  await seedCorpusKnowledgeImages(root);
  const before = await root.db.select({ score: imageEmbeddings.hubScore }).from(imageEmbeddings);
  expect(before.length).toBeGreaterThan(0);
  expect(nonEmpty(before).every((row) => row.score === null)).toBe(true);

  const caller = await root.internalCallerFor(root.ownerId);
  await settleCorpusWorkloads(root, caller, [await caller.workloads.start({ input: { kind: "csls", params: {} }, mode: "singular" })]);
  expect(nonEmpty(await root.db.select({ score: imageEmbeddings.hubScore }).from(imageEmbeddings)).every((row) => row.score !== null)).toBe(true);
});
