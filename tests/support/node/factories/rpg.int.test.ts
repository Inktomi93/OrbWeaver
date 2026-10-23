// @subject tests/support/node/factories/rpg.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import { messages, rpgCheckpoints, rpgSnapshots } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { seedCorpusActors, seedRecallRoom } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { captureRpgSnapshot, captureRpgTurnToolCalls, seedRpgCheckpoint, seedRpgGame, seedRpgJournalEntry, seedRpgSheets } from "./rpg.ts";

test("a genuine folded RPG turn retains its actual quiet tool call on the returned assistant variant without buying a second state round", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller waits beside the orbital loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    toolCall: { name: RPG_NO_CHANGES_TOOL, argumentsJson: "{}" },
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, connections } = await seedCorpusActors(root);
  await root.services.connection.update({
    principal: owner,
    connectionId: connections.text.id,
    patch: {
      declared: declaredCapabilitySchema.parse({
        ...connections.text.declared,
        generation: { ...connections.text.declared?.generation, tools: { parallel: false, silencesProse: false } },
      }),
    },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  const game = await seedRpgGame(root, { principal: owner, chatId, mode: "lite" });
  expect((await root.services.rpg.getGame({ principal: owner, chatId })).effectiveDelivery.path).toBe("folded");
  const outcome = await root.services.chat.send({
    principal: owner,
    chatId,
    content: "Wait beside the loom without changing the scene.",
    intent: { maxContextTokens: 32_000, maxOutputTokens: 64 },
  });
  expect(outcome.aborted).toBe(false);
  const assistant = outcome.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the genuine RPG turn produced no selected assistant variant");
  }
  const variantId = assistant.selectedVariantId;
  await vi.waitFor(async () => {
    const records = await captureRpgTurnToolCalls(root.db, game.id, [variantId]);
    expect(records.map((row) => [row.gameId, row.messageId, row.variantId, row.failure])).toEqual([[game.id, assistant.id, variantId, null]]);
    expect(records.flatMap((row) => row.calls.map((call) => [call.name, call.args]))).toEqual([[RPG_NO_CHANGES_TOOL, "{}"]]);
  });
  const views = await root.services.rpg.listTurnToolCalls({ principal: owner, chatId });
  expect(views.map((view) => [view.messageId, view.variantId])).toEqual([[assistant.id, variantId]]);
  expect(provider.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(1);
  expect(await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, game.id))).toEqual([]);
});

async function gameInputs(root: Awaited<ReturnType<typeof createServerHarness>>): Promise<Pick<Parameters<typeof seedRpgGame>[1], "principal" | "chatId">> {
  const principal = await root.principalFor(root.ownerId);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "rpg-subject", name: "The traveller", description: "A traveller beside the orbital loom." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  return { principal, chatId: chat.id };
}

test("real game birth leaves snapshots absent and checkpoint seeding preserves that refusal", async () => {
  await using root = await createServerHarness();
  const params = await gameInputs(root);
  const game = await seedRpgGame(root, { ...params, mode: "lite" });
  expect(await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, game.id))).toEqual([]);
  await expect(seedRpgCheckpoint(root, { ...params, label: "No authored state" })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await root.db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.gameId, game.id))).toEqual([]);
});

test("hand journal capture retains the actual writer's custom label and every-lineage provenance", async () => {
  await using root = await createServerHarness();
  const params = await gameInputs(root);
  const game = await seedRpgGame(root, { ...params, mode: "lite" });
  const custom = await seedRpgJournalEntry(root, {
    ...params,
    type: "custom",
    label: "Travel",
    title: "Reached the Loom",
    content: "The traveller reached the orbital loom.",
  });
  const note = await seedRpgJournalEntry(root, {
    ...params,
    type: "note",
    label: "This is not a custom entry",
    title: "The counting song",
    content: "The crew sang the counting song.",
  });
  expect(custom).toMatchObject({ gameId: game.id, label: "Travel", variantId: null, sourceMessageId: null });
  expect(note).toMatchObject({ gameId: game.id, label: "", variantId: null, sourceMessageId: null });
  expect(note.id).not.toBe(custom.id);
});

test("checkpoint capture references the real hand snapshot without manufacturing a canon anchor", async () => {
  await using root = await createServerHarness();
  const params = await gameInputs(root);
  const game = await seedRpgGame(root, { ...params, mode: "lite" });
  expect(await root.services.rpg.editSnapshot({ ...params, patch: { location: "Orbital loom" } })).toEqual({ ok: true });
  const checkpoint = await seedRpgCheckpoint(root, { ...params, label: "The loom" });
  const snapshot = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  expect(snapshot).toMatchObject({
    gameId: game.id,
    location: "Orbital loom",
    messageId: null,
    variantId: null,
    asOfMessageId: null,
    committed: 1,
  });
  expect(await root.db.select().from(messages).where(eq(messages.chatId, params.chatId))).toEqual([]);
});

test("sheet capture retains the writer's keywise attributes, explicit clears and actor identity", async () => {
  await using root = await createServerHarness();
  const params = await gameInputs(root);
  const game = await seedRpgGame(root, { ...params, mode: "lite", ruleset: "d20" });
  const [firstAttribute, secondAttribute] = game.config.statProfile.attributes;
  if (firstAttribute === undefined || secondAttribute === undefined) {
    throw new Error("production d20 birth returned fewer than two profile attributes");
  }
  const actorRef = { kind: "user", userId: params.principal.userId } as const;
  const value = game.config.statProfile.range.max;
  const first = await seedRpgSheets(root, {
    ...params,
    actorRef,
    patch: { attributes: { [firstAttribute.key]: value }, level: 3 },
  });
  const merged = await seedRpgSheets(root, {
    ...params,
    actorRef,
    patch: { attributes: { [secondAttribute.key]: value } },
  });
  expect(merged.game.id).toBe(game.id);
  expect(merged.sheets.map((row) => row.id)).toEqual(first.sheets.map((row) => row.id));
  expect(merged.sheets).toMatchObject([
    {
      gameId: game.id,
      characterId: null,
      userId: params.principal.userId,
      sheet: { attributes: { [firstAttribute.key]: value, [secondAttribute.key]: value }, level: 3 },
    },
  ]);
  const cleared = await seedRpgSheets(root, {
    ...params,
    actorRef,
    patch: { attributes: { [firstAttribute.key]: null }, level: null },
  });
  expect(cleared.sheets.map((row) => row.sheet.attributes)).toEqual([{ [secondAttribute.key]: value }]);
  expect(cleared.sheets.map((row) => row.sheet.level)).toEqual([null]);
});
