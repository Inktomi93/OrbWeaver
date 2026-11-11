// @subject packages/server/src/domain/discovery/persistence/embed-store-reads.ts
// A shared or default avatar (one asset that is the current avatar of three real cards) represents no one character
// and drops out of the image analytics. A synthetic group row is not a library card, so it never counts toward that
// threshold: two real cards sharing art with a synthetic row on the same asset are still a real duplicate pair.
import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  createCorpusProviderExecution,
  createServerHarness,
  seedEmbeddingConnection,
} from "@orb/testkit/node/composed";
import sharp from "sharp";

const AVATAR_SIDE = 32;

type Root = Awaited<ReturnType<typeof createServerHarness>>;

/** A box where `realCards` library cards and `syntheticCards` group rows all wear one indexed avatar asset. */
async function withSharedAvatar<T>(realCards: number, syntheticCards: number, read: (root: Root, realIds: readonly CharacterId[]) => Promise<T>): Promise<T> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await seedEmbeddingConnection(root, principal, { model: CORPUS_EMBED_MODEL, input: ["text", "image"] });
  await caller.connection.setBinding({ task: "imageEmbed", connectionId: connection.id });
  const bytes = await sharp({ create: { width: AVATAR_SIDE, height: AVATAR_SIDE, channels: 3, background: "#406080" } })
    .gif()
    .toBuffer();
  const stored = await root.app.assets.store({ principal, bytes, kind: "avatar", mime: "image/gif", enforceMagic: true });
  await root.settleBackground();
  const realIds: CharacterId[] = [];
  for (let index = 0; index < realCards; index += 1) {
    const card = await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: `shared-art-${String(index)}`, name: `Shared art ${String(index)}`, description: "A keeper." }),
    });
    await root.services.character.update({ principal, characterId: card.id, input: { avatarAssetId: stored.assetId } });
    realIds.push(card.id);
  }
  for (let index = 0; index < syntheticCards; index += 1) {
    const anchor = await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: `group-anchor-${String(index)}`, name: `Group anchor ${String(index)}`, description: "A keeper." }),
    });
    const { chat } = await root.services.chat.startChat({ principal, characterIds: [anchor.id], opening: "none" });
    const group = await root.services.character.mintSyntheticGroupCharacter({ ownerId: principal.userId, chatId: chat.id });
    await root.services.character.update({ principal, characterId: group.characterId, input: { avatarAssetId: stored.assetId } });
  }
  await root.settleBackground();
  await root.app.embeddings.indexAsset(stored.assetId, { force: false });
  return await read(root, realIds);
}

test("a synthetic group row on the same avatar does not push two real cards over the shared-avatar threshold", async () => {
  const { pairs, realIds } = await withSharedAvatar(2, 1, async (root, ids) => ({
    pairs: await (await root.internalCallerFor(root.ownerId)).discovery.imageDuplicates(),
    realIds: ids,
  }));
  expect(pairs.map((pair) => [pair.characterIdA, pair.characterIdB].toSorted())).toEqual([[...realIds].toSorted()]);
});

test("three real cards on one avatar are a shared avatar and drop out of the duplicates", async () => {
  const { whileShared, afterOneLeaves } = await withSharedAvatar(3, 0, async (root, ids) => {
    const caller = await root.internalCallerFor(root.ownerId);
    const principal = await root.principalFor(root.ownerId);
    const shared = await caller.discovery.imageDuplicates();
    for (const characterId of ids.slice(0, 1)) {
      await root.services.character.update({ principal, characterId, input: { avatarAssetId: null } });
    }
    return { whileShared: shared, afterOneLeaves: await caller.discovery.imageDuplicates() };
  });
  expect(whileShared).toEqual([]);
  expect(afterOneLeaves).toHaveLength(1);
});
