// Storage is the subject: with indexing on, storing an avatar leaves its captioned lens from a text encoder, and
// both image lenses once a joint text-and-image encoder is bound to the image role.
// @subject packages/server/src/domain/embeddings/indexer/image.ts
// @subject packages/server/src/domain/embeddings/indexer/subscription.ts

import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import { imageEmbeddings } from "@orb/db";
import { readSeedAvatar, SEED_MANIFEST } from "@orb/default-content";
import type { AssetId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  seedEmbeddingConnection,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

test("storing an avatar with indexing on leaves the captioned lens from a text encoder, and both lenses once a joint encoder is bound", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  await root.services.settings.updateAppSettings({ principal, partial: { corpusAutoindex: true } });
  // Two different shipped avatars, real PNGs above the dimension floor, so each store is a new asset.
  const handles = SEED_MANIFEST.flatMap((item) => (item.kind === "character" ? [item.handle] : []));
  const avatars = (await Promise.all(handles.map((handle) => readSeedAvatar(handle)))).filter((avatar) => avatar !== null).slice(0, 2);
  const store = (index: number): Promise<{ readonly assetId: AssetId }> => {
    const avatar = avatars[index];
    if (avatar === undefined) {
      throw new Error("the shipped content carries too few avatars for this case");
    }
    return root.app.assets.store({ principal, ...avatar, kind: "avatar" });
  };
  const lensesOf = async (assetId: AssetId): Promise<readonly string[]> => {
    await root.settleBackground();
    return (await root.db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId))).map((row) => row.lens).toSorted();
  };

  // The corpus encoder is text only: the caption is embedded, the picture itself is not.
  const textOnly = await lensesOf((await store(0)).assetId);
  expect(textOnly).toHaveLength(1);
  expect(IMAGE_LENSES).toContain(textOnly[0]);

  const joint = await seedEmbeddingConnection(root, principal, { model: CORPUS_EMBED_MODEL, input: ["text", "image"] });
  await root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: joint.id });
  await root.settleBackground();

  expect(await lensesOf((await store(1)).assetId)).toEqual([...IMAGE_LENSES].toSorted());
});
