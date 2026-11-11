// A digest write for a generation that stopped being the owner's target while its text was being embedded is refused:
// the store reports no write and leaves no row, where a write for the live target lands.
// @subject packages/server/src/domain/embeddings/persistence/queries.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { EMBEDDING_FLOOR } from "@orb/contracts/inference";
import { chatDigests, embedGenerationTargets } from "@orb/db";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusProviderExecution, createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const ENDPOINT = "https://inference.test/v1";

test("a digest written for a generation retired while it embedded is refused, and the live target's write lands", async () => {
  const physical = createCorpusProviderExecution({
    baseUrl: ENDPOINT,
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  let whileEmbedding: (() => Promise<void>) | null = null;
  const execute: typeof physical.execute = async (...args) => {
    await whileEmbedding?.();
    return await physical.execute(...args);
  };
  await using root = await createServerHarness({
    providerFetch: execute,
    networkExecution: {
      resolver: (hostname) =>
        hostname === new URL(ENDPOINT).hostname ? Promise.resolve([PUBLIC_PEER_ADDRESS]) : Promise.reject(new Error("unscripted digest provider hostname")),
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
  await root.services.connection.setBinding({ principal: host, task: "embed", connectionId: connection.id });
  const witness = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "digest-late-write", name: "Late witness", description: "The witness writes after the space moved on." }),
  });
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [witness.id] });
  await root.settleBackground();
  const generation = await root.app.embeddings.resolveGeneration(host.userId, "embed");
  const digest = (blockIdx: number): Parameters<typeof root.app.embeddings.store>[0] => {
    const text = `[archive — hall]\nBlock ${blockIdx}`;
    return {
      lens: "digest",
      ownerId: host.userId,
      chatId: chat.id,
      scopedCharacterId: witness.id,
      isGroup: false,
      tier: 0,
      blockIdx,
      text,
      topicAnchor: "[archive — hall]",
      keywords: ["archive"],
      speakerCharacterIds: [witness.id],
      contentHash: sha256Hex(text),
      model: generation.space,
    };
  };
  const rows = async (): Promise<readonly number[]> =>
    (await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, chat.id))).map(({ blockIdx }) => blockIdx);

  // Control: the live target takes the write.
  expect((await root.app.embeddings.store(digest(0))).outcome).toBe("written");
  expect(await rows()).toEqual([0]);

  // The target moves on while the second digest is being embedded.
  whileEmbedding = async (): Promise<void> => {
    whileEmbedding = null;
    await root.db.delete(embedGenerationTargets).where(eq(embedGenerationTargets.generationId, generation.id));
  };
  expect((await root.app.embeddings.store(digest(1))).outcome).toBe("noop");
  expect(await rows()).toEqual([0]);
});
