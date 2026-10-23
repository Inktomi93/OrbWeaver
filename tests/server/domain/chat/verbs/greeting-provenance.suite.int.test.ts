// @subject packages/server/src/domain/chat/verbs/edit.ts
// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { isSeededGreetingRow } from "@orb/contracts/chat";
import { closeDb, messages, messageVariants, ownerStats } from "@orb/db";
import { CHAT_OP_CODES } from "@orb/server/domain/chat";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const GREETINGS = ["The market opens.", "The keeper lifts the ledger.", "Rain taps the window."] as const;
const AUTHORED = "The host wrote a different opening.";
const GENERATED = "The provider wrote a fresh reply.";
const REPAIRED = "The confirmed repair keeps the reply's meaning.";
const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };

async function room(
  root: ServerTestHarness,
  ownerId: Parameters<ServerTestHarness["principalFor"]>[0] = root.ownerId,
): Promise<{
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly card: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
  readonly chatId: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"]["id"];
  readonly greeting: NonNullable<Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["opening"]>["messages"][number];
}> {
  const principal = await root.principalFor(ownerId);
  const card = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({
      handle: "greeting-provenance",
      name: "Greeting keeper",
      description: "Keeps the opening.",
      greetings: GREETINGS.map((text) => ({ text })),
    }),
  });
  const started = await root.services.chat.startChat({ principal, characterIds: [card.id], opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the production start did not seed its real card greeting");
  }
  return { principal, card, chatId: started.chat.id, greeting };
}

function provider(): ReturnType<typeof createCorpusProviderExecution> {
  let remaining = 1;
  return createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: "",
    completion: () => {
      if (remaining-- !== 1) {
        throw new Error("the greeting provenance physical reply script is exhausted");
      }
      return { text: GENERATED, toolCalls: [], usage: { promptTokens: 100, completionTokens: 35 } };
    },
  });
}

async function accounting(
  root: ServerTestHarness,
): Promise<
  readonly Pick<
    typeof ownerStats.$inferSelect,
    "assistantTurns" | "swipes" | "variantMessages" | "activeIdxSum" | "contentChars" | "tokensIn" | "tokensOut" | "genSamples" | "genTimeMs" | "costUsd"
  >[]
> {
  return await root.db
    .select({
      assistantTurns: ownerStats.assistantTurns,
      swipes: ownerStats.swipes,
      variantMessages: ownerStats.variantMessages,
      activeIdxSum: ownerStats.activeIdxSum,
      contentChars: ownerStats.contentChars,
      tokensIn: ownerStats.tokensIn,
      tokensOut: ownerStats.tokensOut,
      genSamples: ownerStats.genSamples,
      genTimeMs: ownerStats.genTimeMs,
      costUsd: ownerStats.costUsd,
    })
    .from(ownerStats)
    .where(eq(ownerStats.ownerId, root.ownerId));
}

async function expectRebuildParity(root: ServerTestHarness): Promise<void> {
  const live = await accounting(root);
  await root.services.stats.reconcile(root.ownerId);
  expect(await accounting(root)).toEqual(live);
}

test("a hand-edited greeting survives as a swipe while further card steps reuse only the card variant", async () => {
  await using root = await createServerHarness();
  const { principal, chatId, greeting } = await room(root);
  await root.services.chat.editMessage({ principal, chatId, messageId: greeting.id, content: AUTHORED });
  const stepped = await root.services.chat.setSeededGreeting({ principal, chatId, messageId: greeting.id, greetingIndex: 1 });
  expect(stepped.content).toBe(GREETINGS[1]);
  expect(stepped.variantCount).toBe(2);
  expect(
    await root.db
      .select({ content: messageVariants.content })
      .from(messageVariants)
      .where(eq(messageVariants.messageId, greeting.id))
      .orderBy(messageVariants.idx),
  ).toEqual([{ content: AUTHORED }, { content: GREETINGS[1] }]);
  await root.services.chat.setSeededGreeting({ principal, chatId, messageId: greeting.id, greetingIndex: 2 });
  expect(
    await root.db
      .select({ content: messageVariants.content })
      .from(messageVariants)
      .where(eq(messageVariants.messageId, greeting.id))
      .orderBy(messageVariants.idx),
  ).toEqual([{ content: AUTHORED }, { content: GREETINGS[2] }]);
  expect(await accounting(root)).toMatchObject([
    { assistantTurns: 1, swipes: 1, variantMessages: 1, activeIdxSum: 1, genSamples: 0, tokensIn: 0, tokensOut: 0 },
  ]);
  await expectRebuildParity(root);
});

test("a card edit after creation preserves the old greeting instead of destroying its canon", async () => {
  await using root = await createServerHarness();
  const { principal, card, chatId, greeting } = await room(root);
  const replacement = "The card now opens at the bridge.";
  await root.services.character.update({ principal, characterId: card.id, input: { greetings: [{ text: replacement }, { text: GREETINGS[1] }] } });
  await root.services.chat.setSeededGreeting({ principal, chatId, messageId: greeting.id, greetingIndex: 0 });
  expect(
    await root.db
      .select({ content: messageVariants.content })
      .from(messageVariants)
      .where(eq(messageVariants.messageId, greeting.id))
      .orderBy(messageVariants.idx),
  ).toEqual([{ content: GREETINGS[0] }, { content: replacement }]);
});

for (const operation of ["duplicate", "repair", "reselect"] as const) {
  test(`a real generated ${operation} cannot become a card greeting in a room without a user turn`, async () => {
    const physical = provider();
    await using root = await createServerHarness({ providerFetch: physical.execute });
    await seedCorpusActors(root);
    const { principal, chatId, greeting } = await room(root);
    const caller = await root.internalCallerFor(root.ownerId);
    const preset = await caller.preset.create({ name: "Greeting provenance", kind: "custom" });
    await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
    const turn = await root.services.chat.swipe({ principal, chatId, messageId: greeting.id, intent: INTENT });
    expect(turn.aborted).toBe(false);
    const generated = turn.messages.find((view) => view.role === "assistant");
    if (generated === undefined) {
      throw new Error("the native physical generation produced no assistant variant");
    }
    expect(generated.genStartedAt).not.toBeNull();
    let target = generated;
    if (operation === "duplicate") {
      target = await root.services.chat.duplicateMessage({ principal, chatId, messageId: generated.id });
    } else if (operation === "repair") {
      target = await root.services.chat.applyProseRewrite({
        principal,
        chatId,
        messageId: generated.id,
        variantId: generated.selectedVariantId,
        expectedContentHash: sha256Hex(generated.content),
        content: REPAIRED,
      });
    } else {
      target = await root.services.chat.selectVariant({ principal, chatId, messageId: greeting.id, variantId: greeting.selectedVariantId });
    }
    expect((await root.services.chat.listMessages({ principal, chatId })).messages.every((view) => view.role !== "user")).toBe(true);
    await expect(root.services.chat.setSeededGreeting({ principal, chatId, messageId: target.id, greetingIndex: 1 })).rejects.toMatchObject({
      code: CHAT_OP_CODES.notGreetingRow,
    });
    expect(isSeededGreetingRow(target)).toBe(false);
    expect(target).toMatchObject(
      operation === "duplicate"
        ? {
            genStartedAt: generated.genStartedAt,
            genFinishedAt: generated.genFinishedAt,
            tokensIn: generated.tokensIn,
            tokensOut: generated.tokensOut,
            model: generated.model,
          }
        : { genStartedAt: null, genFinishedAt: null, tokensIn: null, tokensOut: null, model: null },
    );
    expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(1);
    const unrelated = await room(root, (await root.actor()).id);
    const unrelatedStep = await root.services.chat.setSeededGreeting({
      principal: unrelated.principal,
      chatId: unrelated.chatId,
      messageId: unrelated.greeting.id,
      greetingIndex: 1,
    });
    expect(unrelatedStep).toMatchObject({ content: GREETINGS[1], variantCount: 1, hasGeneratedVariant: false });
    expect(isSeededGreetingRow(unrelatedStep)).toBe(true);
    await expectRebuildParity(root);
  });
}

test("an unstamped imported reply is preserved as a variant without invented generation economics", async () => {
  await using root = await createServerHarness();
  const { principal, card } = await room(root);
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production root omitted the actual chat import descriptor");
  }
  const imported = "Imported prose without a generation clock.";
  expect(
    await descriptor.importFile(root.ownerId, {
      filename: `${card.handle}/unstamped.jsonl`,
      bytes: new TextEncoder().encode(
        [
          `{"character_name":${JSON.stringify(card.name)},"user_name":${JSON.stringify(principal.handle)},"create_date":${JSON.stringify(new Date(root.clock.now()).toISOString())}}`,
          `{"name":${JSON.stringify(card.name)},"is_user":false,"is_system":false,"mes":${JSON.stringify(imported)},"send_date":${JSON.stringify(new Date(root.clock.now()).toISOString())}}`,
        ].join("\n"),
      ),
    }),
  ).toMatchObject({ ok: true, created: true });
  const [source] = await root.db
    .select()
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messageVariants.content, imported));
  if (source === undefined) {
    throw new Error("the native ST import produced no actual reply");
  }
  // The single-file descriptor returns canon; the profile workload owns its terminal stats rebuild.
  await root.services.stats.reconcile(root.ownerId);
  const stepped = await root.services.chat.setSeededGreeting({ principal, chatId: source.messages.chatId, messageId: source.messages.id, greetingIndex: 1 });
  expect(stepped).toMatchObject({ content: GREETINGS[1], variantCount: 2, genStartedAt: null, genFinishedAt: null, tokensIn: null, tokensOut: null });
  expect(
    await root.db
      .select({ content: messageVariants.content, genStartedAt: messageVariants.genStartedAt })
      .from(messageVariants)
      .where(eq(messageVariants.messageId, stepped.id))
      .orderBy(messageVariants.idx),
  ).toEqual([
    { content: imported, genStartedAt: null },
    { content: GREETINGS[1], genStartedAt: null },
  ]);
  await expectRebuildParity(root);
});

for (const race of ["greeting", "user-turn"] as const) {
  test(`a held greeting step refuses a concurrent ${race} before changing canon or accounting`, async () => {
    const held = await freshHeldDb();
    await using resources = new AsyncDisposableStack();
    resources.defer(() => closeDb(held.db));
    const root = resources.use(await createServerHarness({ db: held.db }));
    if (race === "user-turn") {
      await seedCorpusActors(root);
    }
    const { principal, chatId, greeting } = await room(root);
    await root.services.chat.setSeededGreeting({ principal, chatId, messageId: greeting.id, greetingIndex: 0 });
    const gate = held.hold(/^insert into "chats"/u);
    const step = root.services.chat.setSeededGreeting({ principal, chatId, messageId: greeting.id, greetingIndex: 1 });
    const settled = step.catch(() => undefined);
    try {
      await gate.reached;
      gate.disarm();
      if (race === "greeting") {
        await root.services.chat.editMessage({ principal, chatId, messageId: greeting.id, content: AUTHORED });
      } else {
        await root.services.chat.commitMessage({ principal, chatId, content: "The first user turn closes the greeting window." });
      }
      const before = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, greeting.id));
      const beforeAccounting = await root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, root.ownerId));
      gate.release();
      await expect(step).rejects.toMatchObject({ code: CHAT_OP_CODES.aborted });
      expect(await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, greeting.id))).toEqual(before);
      expect(await root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, root.ownerId))).toEqual(beforeAccounting);
    } finally {
      gate.release();
      await settled;
    }
  });
}
