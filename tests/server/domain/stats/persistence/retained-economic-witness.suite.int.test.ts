// @subject packages/db/src/query/immutable-rows.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts
// @subject packages/server/src/domain/chat/persistence/retained-canon.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import type { MessageView } from "@orb/contracts/chat";
import { parseVariantMetadata } from "@orb/contracts/chat";
import { RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import { characterStats, closeDb, dailyStats, messages, messageVariants, modelStats, ownerStats, statsCanonVersions } from "@orb/db";
import { CHAT_OP_CODES, ChatOperationError } from "@orb/server/domain/chat";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { seedRpgGame } from "@orb/testkit/node/factories/rpg.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";

const REQUIRED_TOOL_CHOICE = '"tool_choice":"required"';
const RETRY_RESULTS = {
  delete: { slots: 1, variants: 0, assistantTurns: 0, generations: 0, tokensIn: 0, tokensOut: 0 },
  duplicate: { slots: 3, variants: 1, assistantTurns: 2, generations: 2, tokensIn: 340, tokensOut: 100 },
  select: { slots: 2, variants: 2, assistantTurns: 1, generations: 1, tokensIn: 170, tokensOut: 50 },
} as const;

for (const [operation, unselected] of [
  ["delete", false],
  ["delete", true],
  ["duplicate", false],
  ["select", true],
] as const) {
  test(`a real cheap round invalidates captured ${operation} economics; unselected contribution: ${unselected}`, async () => {
    const held = await freshHeldDb();
    await using ownership = new AsyncDisposableStack();
    ownership.defer(() => closeDb(held.db));
    const roundEntered = Promise.withResolvers<void>();
    const roundReleased = Promise.withResolvers<void>();
    let narrativeReplies = 1;
    let roundReplies = 1;
    const physical = createCorpusProviderExecution({
      modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
      chatText: "The paid narrative remains unchanged.",
      completion: (body) => {
        if (body.includes(REQUIRED_TOOL_CHOICE)) {
          if (roundReplies-- !== 1) {
            throw new Error("the physical economic round reply is exhausted");
          }
          return { text: "", toolCalls: [{ name: RPG_NO_CHANGES_TOOL, argumentsJson: "{}" }], usage: { promptTokens: 70, completionTokens: 15 } };
        }
        if (narrativeReplies-- !== 1) {
          throw new Error("the physical economic narrative reply is exhausted");
        }
        return { text: "The paid narrative remains unchanged.", toolCalls: [], usage: { promptTokens: 100, completionTokens: 35 } };
      },
    });
    const root = ownership.use(
      await createServerHarness({
        db: held.db,
        providerFetch: async (input, init) => {
          const request = new Request(input, init);
          if (
            request.method === "POST" &&
            new URL(request.url).pathname.endsWith("/chat/completions") &&
            (await request.clone().text()).includes(REQUIRED_TOOL_CHOICE)
          ) {
            roundEntered.resolve();
            await roundReleased.promise;
          }
          return await physical.execute(request);
        },
      }),
    );
    const actors = await seedCorpusActors(root);
    const caller = await root.internalCallerFor(root.ownerId);
    const preset = await caller.preset.create({ name: "Retained economic round", kind: "custom" });
    await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
    const connection = await root.services.connection.create({
      principal: actors.owner,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: CORPUS_TEXT_MODEL,
      allowBackground: true,
      declared: {
        kind: "generation",
        generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: false, requiredChoice: true } },
        features: { detectServer: false },
      },
    });
    await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
    const character = await caller.character.create({
      input: createCharacterSchema.parse({ handle: "retained-economic-race", name: "Retained economic keeper", description: "Records the paid ledger." }),
    });
    const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
    const chatId = room.chat.id;
    await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
    await seedRpgGame(root, { principal: actors.owner, chatId, mode: "lite" });
    await caller.rpg.updateConfig({ chatId, extractionMode: "cheap" });
    // biome-ignore lint/suspicious/noConfusingVoidType: The fixture preserves native void-returning contracts; undefined is not a substitute for void.
    let mutation: Promise<void | MessageView> | undefined;
    let gate: ReturnType<typeof held.hold> | undefined;
    try {
      const turn = await root.services.chat.send({
        principal: actors.owner,
        chatId,
        content: "Record a paid cheap round.",
        intent: { maxContextTokens: 32_000, maxOutputTokens: 128 },
      });
      expect(turn.aborted).toBe(false);
      await roundEntered.promise;
      const source = turn.messages.find((row) => row.role === "assistant");
      if (source === undefined) {
        throw new Error("native paid narrative source missing");
      }
      const [before] = await root.db.select().from(messageVariants).where(eq(messageVariants.id, source.selectedVariantId));
      expect(before).toMatchObject({ tokensIn: 100, tokensOut: 35 });
      if (before === undefined) {
        throw new Error("the captured economic source has no native variant");
      }
      if (unselected) {
        await root.services.chat.applyProseRewrite({
          principal: actors.owner,
          chatId,
          messageId: source.id,
          variantId: source.selectedVariantId,
          expectedContentHash: sha256Hex(before.content),
          content: "The selected prose revision.",
        });
      }
      const mutations = {
        delete: (): Promise<void> => root.services.chat.deleteMessages({ principal: actors.owner, chatId, messageIds: [source.id] }),
        duplicate: (): Promise<MessageView> => root.services.chat.duplicateMessage({ principal: actors.owner, chatId, messageId: source.id }),
        select: (): Promise<MessageView> =>
          root.services.chat.selectVariant({ principal: actors.owner, chatId, messageId: source.id, variantId: source.selectedVariantId }),
      };
      const operate = mutations[operation];
      gate = held.hold(/^insert into "chats"/u);
      mutation = operate();
      const settledMutation = mutation.then(
        () => "committed",
        (error: Error) => {
          if (error instanceof ChatOperationError) {
            return error.code;
          }
          throw error;
        },
      );
      await gate.reached;
      gate.disarm();
      roundReleased.resolve();
      await root.settleBackground();
      const [afterRound] = await root.db.select().from(messageVariants).where(eq(messageVariants.id, source.selectedVariantId));
      expect(afterRound).toMatchObject({
        id: source.selectedVariantId,
        messageId: source.id,
        content: before.content,
        reasoning: before.reasoning,
        tokensIn: 170,
        tokensOut: 50,
      });
      expect(await root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, actors.owner.userId))).toMatchObject([
        { tokensIn: 170, tokensOut: 50, assistantTurns: 1 },
      ]);
      expect(parseVariantMetadata(afterRound?.metadata).usageLegs).toMatchObject([
        { tokensIn: 100, tokensOut: 35 },
        { tokensIn: 70, tokensOut: 15 },
      ]);
      const expectedSlots = await root.db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.id);
      const expectedVariants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id)).orderBy(messageVariants.id);
      const expectedAccounting = await root.db.batch([
        root.db.select().from(ownerStats).orderBy(ownerStats.ownerId),
        root.db.select().from(characterStats).orderBy(characterStats.id),
        root.db.select().from(dailyStats).orderBy(dailyStats.id),
        root.db.select().from(modelStats).orderBy(modelStats.id),
        root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId),
      ]);
      gate.release();
      const outcome = await settledMutation;
      const slots = await root.db.select().from(messages).where(eq(messages.id, source.id));
      const variants = await root.db.select().from(messageVariants).where(eq(messageVariants.id, source.selectedVariantId));
      const [totals] = await root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, actors.owner.userId));
      expect({
        outcome,
        slots: slots.length,
        variants: variants.length,
        assistantTurns: totals?.assistantTurns,
        tokensIn: totals?.tokensIn,
        tokensOut: totals?.tokensOut,
      }).toEqual({ outcome: CHAT_OP_CODES.aborted, slots: 1, variants: 1, assistantTurns: 1, tokensIn: 170, tokensOut: 50 });
      expect(await root.db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.id)).toEqual(expectedSlots);
      expect(await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id)).orderBy(messageVariants.id)).toEqual(
        expectedVariants,
      );
      expect(variants).toEqual([afterRound]);
      expect(
        await root.db.batch([
          root.db.select().from(ownerStats).orderBy(ownerStats.ownerId),
          root.db.select().from(characterStats).orderBy(characterStats.id),
          root.db.select().from(dailyStats).orderBy(dailyStats.id),
          root.db.select().from(modelStats).orderBy(modelStats.id),
          root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId),
        ]),
      ).toEqual(expectedAccounting);
      await operate();
      const currentSlots = await root.db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.id);
      const currentVariants = await root.db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id)).orderBy(messageVariants.id);
      const current = await root.services.stats.characterEconomics(actors.owner.userId);
      const expected = RETRY_RESULTS[operation];
      expect({ slots: currentSlots.length, variants: currentVariants.length }).toEqual({ slots: expected.slots, variants: expected.variants });
      expect(await root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, actors.owner.userId))).toMatchObject([
        { assistantTurns: expected.assistantTurns, tokensIn: expected.tokensIn, tokensOut: expected.tokensOut },
      ]);
      expect(current).toMatchObject(
        expected.generations === 0
          ? []
          : [{ characterId: character.id, generations: expected.generations, tokensIn: expected.tokensIn, tokensOut: expected.tokensOut }],
      );
      expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(2);
    } finally {
      roundReleased.resolve();
      gate?.release();
      await mutation?.catch(() => undefined);
      await root.settleBackground();
    }
  });
}
