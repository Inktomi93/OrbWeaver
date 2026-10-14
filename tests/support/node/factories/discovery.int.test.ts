// @subject tests/support/node/factories/discovery.ts
// @subject tests/support/node/factories/embedding-generation.ts
// @subject tests/support/node/corpus-provider.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { characterEmbeddings, embeddingCalls } from "@orb/db";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusConnections } from "@orb/testkit/node/corpus-seed.ts";
import { seedCharacterDistillations, seedDuplicateCharacterPairs } from "@orb/testkit/node/factories/discovery.ts";
import { seedEmbeddedCorpus, seedEmbeddingGeneration } from "@orb/testkit/node/factories/embedding-generation.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { and, eq, inArray } from "drizzle-orm";

type MutablePhysicalScript = Omit<Parameters<typeof createCorpusProviderExecution>[0], "embedding"> & { embedding: number[] };

function physicalScript(): MutablePhysicalScript {
  return {
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: [...CORPUS_EMBEDDING_VECTOR],
    chatText: "The traveller repairs the loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  };
}

test("real admitted embedding and distillation produce owned summaries, vectors, accounting and duplicate rows", async () => {
  const script = physicalScript();
  const wire = createCorpusProviderExecution(script);
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  const { embed } = await seedCorpusConnections(root, principal);
  const first = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "corpus-traveller", name: "Traveller", description: "A traveller repairs the orbital loom." }),
  });
  const second = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "corpus-weaver", name: "Weaver", description: "A weaver sings beside the orbital loom." }),
  });
  await root.settleBackground();
  const generation = await seedEmbeddingGeneration(root.db, root.app.embeddings.resolveGeneration, [root.ownerId, "embed"]);
  const corpus = await seedEmbeddedCorpus(root.db, root.app.embeddings.embedCorpus, {
    ownerId: root.ownerId,
    force: true,
    signal: new AbortController().signal,
  });
  const ids = [first.id, second.id];
  const vectors = corpus.vectors.filter((row) => ids.includes(row.characterId));
  expect(vectors.map((row) => row.characterId).toSorted()).toEqual(ids.toSorted());
  expect(vectors.map((row) => row.generationId)).toEqual([generation.generation.id, generation.generation.id]);
  expect(vectors.map((row) => Array.from(row.embedding))).toEqual([
    [1, 0, 0],
    [1, 0, 0],
  ]);
  expect(new Set(vectors.map((row) => row.contentHash)).size).toBe(2);
  expect(corpus.calls.filter((row) => row.connectionId === embed.id && row.outcome === "completed").length).toBeGreaterThan(0);
  for (const id of ids) {
    const distilled = await seedCharacterDistillations(root.db, root.services.discovery.distillCharacters, {
      ownerId: root.ownerId,
      funderUserId: root.ownerId,
      characterId: id,
    });
    expect(distilled.result).toMatchObject({ distilled: 1, failed: 0, skipped: 0 });
    expect(distilled.summaries).toMatchObject([{ characterId: id, model: CORPUS_TEXT_MODEL, genre: "science-fiction", tags: ["loom", "traveller", "orbit"] }]);
  }
  const pairs = await seedDuplicateCharacterPairs(root.db, root.services.discovery.computeDuplicatePairs, { ownerId: root.ownerId });
  expect(pairs.pairs).toContainEqual(expect.objectContaining({ characterIdA: ids.toSorted()[0], characterIdB: ids.toSorted()[1], similarity: 1 }));
  const foreign = await root.actor();
  expect(await root.services.discovery.duplicateCharacters(foreign.id)).toEqual([]);
  const beforeForeign = [...wire.requests];
  await expect(
    seedCharacterDistillations(root.db, root.services.discovery.distillCharacters, {
      ownerId: foreign.id,
      funderUserId: foreign.id,
      characterId: first.id,
    }),
  ).rejects.toThrow();
  expect(wire.requests).toEqual(beforeForeign);
});

test("a wrong-width physical embedding response cannot replace vectors and retains actual failed accounting", async () => {
  const script = physicalScript();
  const wire = createCorpusProviderExecution(script);
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  const { embed } = await seedCorpusConnections(root, principal);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "width-subject", name: "Traveller", description: "A traveller repairs the orbital loom." }),
  });
  await root.settleBackground();
  const valid = await seedEmbeddedCorpus(root.db, root.app.embeddings.embedCorpus, {
    ownerId: root.ownerId,
    force: true,
    signal: new AbortController().signal,
  });
  expect(valid.vectors.some((row) => row.characterId === character.id)).toBe(true);
  const vectorIds = valid.vectors.map((row) => row.id);
  script.embedding = [1, 0];
  await expect(
    seedEmbeddedCorpus(root.db, root.app.embeddings.embedCorpus, { ownerId: root.ownerId, force: true, signal: new AbortController().signal }),
  ).rejects.toThrow(/width/iu);
  expect(
    await root.db
      .select()
      .from(characterEmbeddings)
      .where(inArray(characterEmbeddings.id, vectorIds))
      .orderBy(characterEmbeddings.characterId, characterEmbeddings.generationId),
  ).toEqual(valid.vectors);
  const failed = await root.db
    .select()
    .from(embeddingCalls)
    .where(and(eq(embeddingCalls.ownerId, root.ownerId), eq(embeddingCalls.connectionId, embed.id), eq(embeddingCalls.outcome, "failed")));
  expect(failed.length).toBeGreaterThan(0);
  expect(failed.every((row) => row.task === "embed" && row.inputCount > 0)).toBe(true);
});
