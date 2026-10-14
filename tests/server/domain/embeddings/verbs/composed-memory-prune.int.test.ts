// Shrink must resolve the real present host and target generation before deleting only its requested bucket.
// @subject packages/server/src/domain/embeddings/verbs/prune-memory-blocks.ts

import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { EMBEDDING_FLOOR } from "@orb/contracts/inference";
import { chatDigests, embedGenerations, embedGenerationTargets } from "@orb/db";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusProviderExecution } from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { and, eq } from "drizzle-orm";

const ENDPOINT = "https://inference.test/v1";

test("the composed pruner resolves the present host's persisted generation and deletes only the shrinking bucket", async () => {
  const physical = createCorpusProviderExecution({
    baseUrl: ENDPOINT,
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  await using root = await createServerHarness({
    providerFetch: physical.execute,
    networkExecution: {
      resolver: (hostname) =>
        hostname === new URL(ENDPOINT).hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted prune provider hostname")),
    },
  });
  const host = await root.principalFor(root.ownerId);
  const connection = await root.services.connection.create({
    principal: host,
    providerId: "lm-studio",
    credentialId: null,
    baseUrl: ENDPOINT,
    model: CORPUS_EMBED_MODEL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: CORPUS_EMBEDDING_VECTOR.length } },
  });
  expect((await root.services.connection.setBinding({ principal: host, task: "embed", connectionId: connection.id })).connectionId).toBe(connection.id);
  const mine = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "memory-prune-mine", name: "Prune witness", description: "The witness owns a shrinking archive." }),
  });
  const sibling = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "memory-prune-sibling", name: "Sibling witness", description: "The sibling keeps its complete archive." }),
  });
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [mine.id, sibling.id] });
  await root.settleBackground();
  const generation = await root.app.embeddings.resolveGeneration(host.userId, "embed");
  if (generation === null) {
    throw new Error("the real host binding did not resolve an embedding generation");
  }
  const receipts: Awaited<ReturnType<typeof root.app.embeddings.store>>[] = [];
  for (const [scopedCharacterId, blockIdx] of [
    [mine.id, 0],
    [mine.id, 1],
    [mine.id, 2],
    [sibling.id, 2],
  ] as const) {
    const text = `[archive — hall]\nArchive block ${blockIdx} for ${scopedCharacterId}`;
    receipts.push(
      await root.app.embeddings.store({
        kind: "chat-block",
        lens: "digest",
        ownerId: host.userId,
        chatId: chat.id,
        scopedCharacterId,
        isGroup: true,
        tier: 0,
        blockIdx,
        text,
        topicAnchor: "[archive — hall]",
        keywords: ["archive"],
        speakerCharacterIds: [scopedCharacterId],
        contentHash: sha256Hex(text),
        model: generation.space,
      }),
    );
  }
  expect(receipts.map((receipt) => receipt.outcome)).toEqual(["written", "written", "written", "written"]);
  expect(receipts.map((receipt) => receipt.generationId)).toEqual(Array.from({ length: receipts.length }, () => generation.id));
  const [target] = await root.db
    .select()
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, host.userId), eq(embedGenerationTargets.task, "embed")));
  expect(target?.generationId).toBe(generation.id);
  expect(await root.db.select().from(embedGenerations).where(eq(embedGenerations.id, generation.id))).toMatchObject([
    { ownerId: host.userId, connectionId: connection.id },
  ]);
  const before = await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, chat.id));
  expect(before.map((row) => `${row.scopedCharacterId}:${row.blockIdx}`).toSorted()).toEqual(
    [`${mine.id}:0`, `${mine.id}:1`, `${mine.id}:2`, `${sibling.id}:2`].toSorted(),
  );

  const result = await root.app.embeddings.pruneMemoryBlocks({ lens: "digest", chatId: chat.id, scopedCharacterId: mine.id, keepPerTier: [1] });

  expect(result.rowsDeleted).toBe(2);
  const retained = before.filter((row) => row.scopedCharacterId === sibling.id || row.blockIdx === 0);
  const after = await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, chat.id));
  expect(after.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(retained.toSorted((a, b) => a.id.localeCompare(b.id)));
});
