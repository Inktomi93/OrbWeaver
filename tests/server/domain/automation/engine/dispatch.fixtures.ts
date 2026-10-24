// A root with a saved portrait connection and an avatar-bearing character, and the owner's generated portraits.

import { ASSET_LIST_LIMIT_MAX } from "@orb/contracts/assets";
import { createCharacterSchema } from "@orb/contracts/character";
import type { GenerationProvenance } from "@orb/contracts/imagery";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";

export const PORTRAIT_MODEL = "automation-portrait-fixture";

export interface PortraitFixture {
  readonly root: ServerTestHarness;
  readonly character: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
  readonly physical: ReturnType<typeof createCorpusProviderExecution>;
}

export const portraitTest = test.extend<{ portrait: PortraitFixture }>({
  portrait: async ({}, use) => {
    const physical = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, PORTRAIT_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "An illustrated keeper stands beside the orbital loom.",
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [makeAssetBytes(mintTypeId(ID_PREFIX.asset))],
    });
    await using root = await createServerHarness({ providerFetch: physical.execute });
    const principal = await root.principalFor(root.ownerId);
    await seedCorpusConnections(root, principal);
    const connection = await root.services.connection.create({
      principal,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: PORTRAIT_MODEL,
      allowBackground: true,
      declared: {
        kind: "generation",
        generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
        features: { images: "images-api", detectServer: false },
      },
    });
    await root.services.connection.setBinding({ principal, task: "generateImage", connectionId: connection.id });
    const avatar = await root.app.assets.store({
      principal,
      kind: "card",
      mime: "image/png",
      bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    });
    const character = await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: "living-library", name: "Mira", description: "Keeper of the orbital loom.", avatarAssetId: avatar.assetId }),
    });
    await root.settleBackground();
    await use({ root, character, physical });
  },
});

// The owner's generated images that carry a durable generation provenance, as the gallery detail reads them.
export async function portraits(root: ServerTestHarness): Promise<GenerationProvenance[]> {
  const caller = await root.principalFor(root.ownerId);
  const generated = await root.services.assets.listOwned({ principal: caller, kind: "generated", limit: ASSET_LIST_LIMIT_MAX });
  const provenance = await Promise.all(generated.map(({ assetId }) => root.services.imagery.readProvenance({ caller, assetId })));
  return provenance.filter((row) => row !== null);
}
