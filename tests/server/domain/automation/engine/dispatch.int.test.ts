// @subject packages/server/src/domain/automation/engine/dispatch.ts
// @subject packages/server/src/domain/automation/service.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { createBookSchema } from "@orb/contracts/world-info";
import { assets, chats, imageryGenerations, messages } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusConnections } from "@orb/testkit/node/corpus-seed.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { enabledRule } from "../runtime.fixtures.ts";

const PORTRAIT_MODEL = "automation-portrait-fixture";

interface PortraitFixture {
  readonly root: ServerTestHarness;
  readonly character: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
  readonly physical: ReturnType<typeof createCorpusProviderExecution>;
}

const portraitTest = test.extend<{ portrait: PortraitFixture }>({
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

portraitTest("a global rule fires on its character import with no room open and persists the author's quiet portrait", async ({ portrait }) => {
  const { root, character, physical } = portrait;
  const principal = await root.principalFor(root.ownerId);
  const rule = await enabledRule(root, {
    chatId: null,
    name: "Living library",
    trigger: { bus: "domain", type: "character.updated" },
    predicateCel: "has(event.character) && event.character.contentChanged",
    actions: [{ type: "generate_image", mode: "character_multimodal", n: 1, useAvatarReference: false, reuse: "prefer", quiet: true }],
  });
  await root.services.automation.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: true });
  const generations = await root.db.select().from(imageryGenerations).innerJoin(assets, eq(imageryGenerations.assetId, assets.id));
  expect(generations).toHaveLength(1);
  expect(generations[0]).toMatchObject({
    ["imagery_generations"]: { chatId: null, subjectCharacterId: character.id, mode: "character_multimodal", model: PORTRAIT_MODEL },
    assets: { ownerId: root.ownerId, kind: "generated" },
  });
  expect(physical.requests.filter((request) => request.startsWith("POST "))).toEqual(["POST /v1/chat/completions", "POST /v1/images/generations"]);
  expect(await root.db.select().from(chats)).toEqual([]);
  expect(await root.db.select().from(messages)).toEqual([]);
  expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => [fire.outcome, fire.chatId])).toEqual([["fired", null]]);
});

portraitTest("contentChanged admits a real content write but not a flag-only character event", async ({ portrait }) => {
  const { root, character, physical } = portrait;
  const principal = await root.principalFor(root.ownerId);
  const rule = await enabledRule(root, {
    chatId: null,
    name: "Content-only living library",
    trigger: { bus: "domain", type: "character.updated" },
    predicateCel: "has(event.character) && event.character.contentChanged",
    actions: [{ type: "generate_image", mode: "character_multimodal", n: 1, useAvatarReference: false, reuse: "prefer", quiet: true }],
  });
  await root.services.automation.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: false });
  expect(physical.requests.filter((request) => request.startsWith("POST "))).toEqual([]);
  expect(await root.db.select().from(imageryGenerations)).toEqual([]);
  expect(await root.services.automation.listFires({ principal, ruleId: rule.id })).toEqual([]);
  await root.services.automation.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: true });
  expect(physical.requests.filter((request) => request.startsWith("POST "))).toEqual(["POST /v1/chat/completions", "POST /v1/images/generations"]);
  expect(await root.db.select().from(imageryGenerations)).toHaveLength(1);
  expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
});

async function prepareChain(
  root: ServerTestHarness,
  confirmFirst: boolean,
): Promise<{
  readonly chatId: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"]["id"];
  readonly book: Awaited<ReturnType<ServerTestHarness["services"]["worldInfo"]["createBook"]>>;
  readonly rule: Awaited<ReturnType<typeof enabledRule>>;
}> {
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Chain witness" }) });
  await root.services.worldInfo.attachToChat({ principal, chatId: chat.id, bookId: book.id });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "Mixed postures",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [
      { type: "set_variable", scope: "global", key: "before", op: "inc" },
      { type: "insert_world_info_entry", bookId: book.id, entryKey: "asks", keys: ["loom"], contentTemplate: "The keeper records the loom.", confirmFirst },
      { type: "set_variable", scope: "global", key: "after", op: "inc" },
    ],
  });
  return { chatId: chat.id, book, rule };
}

test("CONTROL: without confirmation every real arm runs and the rule fires", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const { chatId, book, rule } = await prepareChain(root, false);
  await root.services.automation.handleEvent({ type: "chatOpened", chatId });
  expect(await root.services.automation.getGlobalVariable({ principal, key: "before" })).toBe("1");
  expect((await root.services.worldInfo.listEntries({ principal, bookId: book.id })).map((entry) => entry.content)).toEqual(["The keeper records the loom."]);
  expect(await root.services.automation.getGlobalVariable({ principal, key: "after" })).toBe("1");
  expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
});

test("the arms behind a real confirm-first question wait for the human instead of racing ahead", async ({ signal }) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const { chatId, book, rule } = await prepareChain(root, true);
  const cancellation = new AbortController();
  const stream = root.app.liveBuses.automation.subscribeAutomation(chatId, AbortSignal.any([signal, cancellation.signal]))[Symbol.asyncIterator]();
  try {
    const raised = stream.next();
    await root.services.automation.handleEvent({ type: "chatOpened", chatId });
    const event = await raised;
    expect(event).toMatchObject({ done: false, value: { type: "suggestionRaised", kind: "confirm", source: { kind: "rule", ruleId: rule.id } } });
    expect(await root.services.automation.getGlobalVariable({ principal, key: "before" })).toBe("1");
    expect(await root.services.worldInfo.listEntries({ principal, bookId: book.id })).toEqual([]);
    expect(await root.services.automation.getGlobalVariable({ principal, key: "after" })).toBeNull();
    expect(await root.services.automation.listFires({ principal, ruleId: rule.id })).toEqual([]);
    if (event.done || event.value.type !== "suggestionRaised") {
      throw new Error("the real confirm-first arm did not raise its pending question");
    }
    expect(await root.services.automation.confirmSuggestion({ principal, suggestionId: event.value.suggestionId })).toEqual({
      ran: "stashed-arm",
      outcome: "fired",
    });
    expect((await root.services.worldInfo.listEntries({ principal, bookId: book.id })).map((entry) => entry.content)).toEqual(["The keeper records the loom."]);
    expect(await root.services.automation.getGlobalVariable({ principal, key: "after" })).toBe("1");
    expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
  } finally {
    cancellation.abort();
    await stream.return?.();
  }
});
