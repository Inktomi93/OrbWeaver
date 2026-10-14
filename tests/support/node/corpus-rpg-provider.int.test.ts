// @subject tests/support/node/corpus-rpg-provider.ts
// @subject tests/support/node/corpus-rpg-wire.ts
import "@orb/testkit/node/composed-real.ts";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import { assertReferentialIntegrity, rpgJournal, rpgSnapshots } from "@orb/db";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { seedCorpusRpgProvider } from "./corpus-rpg-provider.ts";
import {
  CORPUS_RPG_CARD_NAME,
  CORPUS_RPG_INVENTORY_TOOL,
  CORPUS_RPG_ITEM_NAME,
  CORPUS_RPG_JOURNAL_TOOL,
  CORPUS_RPG_REBUILT_BEAT,
  CORPUS_RPG_SCENE_TOOL,
  createCorpusRpgWire,
} from "./corpus-rpg-wire.ts";
import { captureRpgSnapshot } from "./factories/rpg.ts";

test("native model population, structured and required-tool resync, and changed folded calls retain their real planes and lineage", async () => {
  const wire = createCorpusRpgWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: wire.completion,
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const { connections } = await seedCorpusActors(root);
  const result = await seedCorpusRpgProvider(root, connections.text.id);
  expect(result.populate).toEqual({ ok: true, populated: true });
  const actor = result.populated.actors.find((row) => row.name === CORPUS_RPG_CARD_NAME);
  const item = actor?.volatile?.inventory[0];
  expect(actor).toMatchObject({ actorRef: { kind: "character", characterId: result.character.id }, sheet: { className: "Artificer", level: 2 } });
  expect(actor?.volatile?.inventory).toHaveLength(1);
  expect(item).toMatchObject({ name: CORPUS_RPG_ITEM_NAME, quantity: 1, location: "belt" });
  expect(actor?.volatile?.wallet).toEqual([{ name: "credits", amount: 7 }]);
  expect(result.populated.ambient).toBeNull();
  expect(result.populated.quests).toMatchObject([{ name: "Repair the orbital loom", objectives: [{ text: "Find the thread", completed: false }] }]);
  expect(result.populatedRows.snapshots).toMatchObject([{ gameId: result.game.id, messageId: null, variantId: null, asOfMessageId: null, committed: 1 }]);
  expect(result.populatedRows.journal).toEqual([]);
  expect(result.absorbed).toEqual({ ok: true, populated: false });
  expect(result.absorbedRows.snapshots).toEqual(result.populatedRows.snapshots);
  expect(result.absorbedRows.sheets).toMatchObject([{ characterId: result.character.id, sheet: { className: "Host-tuned artificer", level: 4 } }]);
  expect(result.firstResync).toEqual({ ok: true, rebuilt: true });
  expect(result.secondResync).toEqual({ ok: true, rebuilt: true });
  expect(result.firstRebuilt.ambient).toMatchObject({ location: "Hand-pinned loom", weather: { type: "clear", label: "" } });
  expect(result.firstRebuilt.recentBeats).toEqual([CORPUS_RPG_REBUILT_BEAT]);
  expect(result.secondRebuilt.recentBeats).toEqual(result.firstRebuilt.recentBeats);
  expect(result.toolResync).toEqual({ ok: true, rebuilt: true });
  expect(result.toolRebuilt.ambient?.location).toBe("Tool rebuilt loom");
  expect(result.toolRebuilt.actors.find((row) => row.name === CORPUS_RPG_CARD_NAME)?.volatile?.inventory).toMatchObject([
    { id: item?.id, location: "necklace" },
  ]);
  expect(result.quietResync).toEqual({ ok: true, rebuilt: false });
  expect(result.quietRows).toEqual(result.beforeQuietRows);
  expect(result.quietRows.journal).toEqual([]);
  expect(result.turn.aborted).toBe(false);
  expect(result.folded.ambient).toMatchObject({ location: "Inner loom", weather: { type: "rain", label: "Hand-pinned rain" } });
  expect(result.folded.recentBeats).toEqual([CORPUS_RPG_REBUILT_BEAT, "The traveller crossed the gantry.", "The shuttle was fitted."]);
  expect(result.folded.actors.find((row) => row.name === CORPUS_RPG_CARD_NAME)?.volatile?.inventory).toMatchObject([
    { id: item?.id, location: "wrist", quantity: 2 },
  ]);
  const assistant = result.turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("native folded corpus turn produced no selected assistant");
  }
  const original = result.foldedRows.snapshots.find((row) => row.variantId === assistant.selectedVariantId);
  if (original === undefined) {
    throw new Error("native folded turn lost its original variant snapshot");
  }
  expect(result.snapshot.id).not.toBe(original.id);
  expect(result.snapshot).toMatchObject({ gameId: result.game.id, messageId: null, variantId: null, asOfMessageId: assistant.id, committed: 1 });
  expect(rpgSnapshotStateSchema.parse(result.snapshot)).toEqual(rpgSnapshotStateSchema.parse(original));
  expect(result.snapshot.fieldLocks).toEqual(original.fieldLocks);
  const retained = await captureRpgSnapshot(root.db, original.id);
  expect(retained).toEqual(original);
  expect(retained).toMatchObject({ id: original.id, messageId: assistant.id, variantId: assistant.selectedVariantId, committed: 0 });
  expect(result.calls).toMatchObject([{ gameId: result.game.id, messageId: assistant.id, variantId: assistant.selectedVariantId, failure: null }]);
  expect(result.calls.flatMap((row) => row.calls.map((call) => call.name))).toEqual([
    CORPUS_RPG_SCENE_TOOL,
    CORPUS_RPG_SCENE_TOOL,
    CORPUS_RPG_INVENTORY_TOOL,
    CORPUS_RPG_JOURNAL_TOOL,
    CORPUS_RPG_JOURNAL_TOOL,
  ]);
  expect(result.calls.flatMap((row) => row.calls).some((call) => call.verdict === "salvaged")).toBe(true);
  expect(result.calls.flatMap((row) => row.calls).some((call) => call.issues.some((issue) => issue.includes("weather")))).toBe(true);
  expect(result.foldedRows.journal).toMatchObject([
    {
      gameId: result.game.id,
      variantId: assistant.selectedVariantId,
      sourceMessageId: assistant.id,
      type: "custom",
      label: "Expedition",
      title: "Loom repaired",
    },
    { gameId: result.game.id, variantId: assistant.selectedVariantId, sourceMessageId: assistant.id, type: "event", label: "", title: "Thread counted" },
  ]);
  expect(result.journal).toMatchObject([
    { type: "event", label: "" },
    { type: "custom", label: "Expedition" },
  ]);
  expect(wire.remaining()).toBe(0);
  expect(wire.requests).toHaveLength(7);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(7);
  const lastRequest = wire.requests.at(-1);
  if (lastRequest === undefined) {
    throw new Error("native RPG physical script captured no model request");
  }
  expect(() => wire.completion(lastRequest)).toThrow("unscripted RPG corpus request");
  expect(() => createCorpusRpgWire().completion(lastRequest)).toThrow("unscripted RPG corpus request");
  await assertReferentialIntegrity(root.db);
});

test("native RPG host doors distinguish no-card, stranger, writer-less and physical provider failure before changing canon", async () => {
  const wire = createCorpusRpgWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: wire.completion,
  });
  let refuse = false;
  let refusedCalls = 0;
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (refuse && request.method === "POST" && new URL(request.url).pathname === "/v1/chat/completions") {
      refusedCalls += 1;
      return new Response('{"error":{"message":"corpus RPG provider refused","type":"invalid_request_error","code":"invalid_request"}}', {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return await physical.execute(request);
  };
  await using root = await createServerHarness({ providerFetch });
  const { owner, secondUserId, connections } = await seedCorpusActors(root);
  const result = await seedCorpusRpgProvider(root, connections.text.id);
  const chatId = result.game.chatId;
  const caller = await root.internalCallerFor(root.ownerId);
  const stranger = await root.internalCallerFor(secondUserId);
  const beforeRequests = physical.requests.length;
  const before = {
    snapshots: await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, result.game.id)),
    journal: await root.db.select().from(rpgJournal).where(eq(rpgJournal.gameId, result.game.id)),
  };
  await expect(caller.rpg.populateFromCharacter({ chatId, actorRef: { kind: "user", userId: root.ownerId } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(stranger.rpg.populateFromCharacter({ chatId, actorRef: { kind: "character", characterId: result.character.id } })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(stranger.rpg.resyncFromStory({ chatId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(physical.requests.length).toBe(beforeRequests);
  const populatedInput = { chatId, actorRef: { kind: "character", characterId: result.character.id } } as const;
  refuse = true;
  expect(await caller.rpg.populateFromCharacter(populatedInput)).toMatchObject({ ok: false, reason: expect.stringContaining("corpus RPG provider refused") });
  expect(await caller.rpg.resyncFromStory({ chatId })).toMatchObject({ ok: false, reason: expect.stringContaining("corpus RPG provider refused") });
  expect(refusedCalls).toBe(2);
  const connection = await root.services.connection.get({ principal: owner, connectionId: connections.text.id });
  await root.services.connection.update({
    principal: owner,
    connectionId: connections.text.id,
    patch: {
      declared: declaredCapabilitySchema.parse({
        ...connection.declared,
        generation: { ...connection.declared?.generation, tools: null, output: { structured: false } },
      }),
    },
  });
  expect(await caller.rpg.populateFromCharacter(populatedInput)).toMatchObject({ ok: false });
  expect(await caller.rpg.resyncFromStory({ chatId })).toMatchObject({ ok: false });
  expect(refusedCalls).toBe(2);
  expect(await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, result.game.id))).toEqual(before.snapshots);
  expect(await root.db.select().from(rpgJournal).where(eq(rpgJournal.gameId, result.game.id))).toEqual(before.journal);
});
