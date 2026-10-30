// Storage subject: the card embedding rows a character write leaves. Event indexing follows the live
// `corpusAutoindex` setting with no restart: off writes nothing, saving it on indexes the next write, and saving it
// off again leaves a later edit unindexed.
// @subject packages/server/src/domain/embeddings/indexer/subscription.ts
// @subject packages/server/src/entry/compose/search-discovery.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { characterEmbeddings } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

async function embeddingsOf(root: ServerTestHarness, characterId: CharacterId): Promise<readonly (typeof characterEmbeddings.$inferSelect)[]> {
  await root.settleBackground();
  return await root.db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
}

test("event indexing follows the saved corpusAutoindex setting live: off writes nothing, on indexes the next write, off again leaves an edit unindexed", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("indexing a card must not request a model reply");
    },
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const create = async (handle: string, description: string): Promise<CharacterId> =>
    (await caller.character.create({ input: createCharacterSchema.parse({ handle, name: handle, description }) })).id;

  const unindexed = await create("autoindex-off", "Written before indexing was on.");
  expect(await embeddingsOf(root, unindexed)).toEqual([]);

  await root.services.settings.updateAppSettings({ principal, partial: { corpusAutoindex: true } });
  const indexed = await create("autoindex-on", "Written after indexing was on.");
  const written = await embeddingsOf(root, indexed);
  expect(written).toHaveLength(1);

  await root.services.settings.updateAppSettings({ principal, partial: { corpusAutoindex: false } });
  await caller.character.update({ characterId: indexed, input: { description: "Edited after indexing stopped." } });
  expect(await embeddingsOf(root, indexed)).toEqual(written);
});
