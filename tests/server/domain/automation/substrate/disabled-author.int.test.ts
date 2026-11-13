// A disabled host's chat rule spends nothing on a room event: the dispatch refuses it like a host who left, and
// the rule fires again once the account is re-enabled.
// @subject packages/server/src/domain/automation/substrate/authority.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { modelIdSchema } from "@orb/contracts/inference";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedCorpusActors,
} from "@orb/testkit/node/composed";

const IMAGE_MODEL = modelIdSchema.parse("disabled-author-image-v1");

test("a disabled host's chat rule draws nothing on its own connection, and draws again once re-enabled", async () => {
  const images: Uint8Array[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A lantern-lit ledger room.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images,
  });
  const imageRequests: Request[] = [];
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname.endsWith("/images/generations")) {
        imageRequests.push(request);
      }
      return await physical.execute(request);
    },
  });
  // The box owner is the admin and cannot be disabled, so the second account hosts the room and writes the rule.
  const { owner: admin, secondUserId } = await seedCorpusActors(root);
  const host = await root.principalFor(secondUserId);
  const imageConnection = await root.services.connection.create({
    principal: host,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await root.services.connection.setBinding({ principal: host, task: "generateImage", connectionId: imageConnection.id });
  const keeper = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "ledger-keeper", name: "Ledger keeper", description: "Keeps the lamps lit." }),
  });
  const room = (await root.services.chat.startChat({ principal: host, characterIds: [keeper.id], opening: "none" })).chat.id;
  const rule = await root.services.automation.createRule({
    principal: host,
    chatId: room,
    name: "Draw the room on open",
    trigger: { bus: "chat", type: "chatOpened" },
    predicateCel: null,
    actions: [{ type: "generate_image", mode: "free", prompt: "the ledger room", n: 1, useAvatarReference: false, reuse: "never", quiet: true }],
    timeZone: UTC_TIME_ZONE,
  });
  await root.services.automation.setRuleEnabled({ principal: host, ruleId: rule.id, enabled: true });
  await root.settleBackground();
  const outcomes = async (): Promise<string[]> =>
    (await root.services.automation.listFires({ principal: host, ruleId: rule.id })).map((fire) => fire.outcome).toSorted();
  const open = (): Promise<void> => root.services.automation.handleEvent({ type: "chatOpened", chatId: room });
  const setHostEnabled = (enabled: boolean): Promise<unknown> => root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled });

  images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  await open();
  expect(imageRequests).toHaveLength(1);
  expect(await outcomes()).toEqual(["fired"]);

  await setHostEnabled(false);
  await open();
  expect(imageRequests).toHaveLength(1);
  expect(await outcomes()).toEqual(["authority_refused", "fired"]);

  await setHostEnabled(true);
  images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  await open();
  expect(imageRequests).toHaveLength(2);
  expect(await outcomes()).toEqual(["authority_refused", "fired", "fired"]);
});
