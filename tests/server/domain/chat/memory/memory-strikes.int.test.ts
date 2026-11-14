// The host's strike on a remembered item, through the composed root: a strike leaves the item out of the next turn's
// prompt and restoring it brings it back; only the host strikes; a strike outlives the scene being summarized again;
// a longer summary retelling a struck scene leaves with it; a solo room's strike holds once a second character is
// seated; a member's view stops at their history floor; and an empty view says why it is empty.
// Digests come from the production memory build; only the provider edges are scripted (`recall-world.ts`).
// @subject packages/server/src/domain/chat/verbs/memory-strikes.ts
// @subject packages/server/src/domain/chat/memory/recall/recall.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { MemoryItemView, MemoryView } from "@orb/contracts/chat";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { wireOf } from "../scenario-physical.ts";
import type { Arc } from "./recall-world.ts";
import { BLOCK_SIZE, blockOf, embeddingFor, FAN_OUT, generatedText, probe, recallTurn, TURN_INTENT, verdicts, world } from "./recall-world.ts";

/** Two scenes in one query, the storm scene weighted first; both clear the floor, so both are admitted unstruck. */
const BOTH = `Tell me about the scene. ${probe("bath")} ${probe("storm")}`;
const RECALL_KNOBS = { minScore: 0.05, queryWindow: 1, keywordMatch: false } as const;

function itemAt(view: MemoryView, tier: number, blockIdx: number): MemoryItemView {
  const item = view.items.find((candidate) => candidate.key.tier === tier && candidate.key.blockIdx === blockIdx);
  if (item === undefined) {
    throw new Error(`the memory view lists no item at tier ${tier}, block ${blockIdx}`);
  }
  return item;
}

function sceneOf(view: MemoryView, arc: Arc): MemoryItemView {
  return itemAt(view, 0, blockOf(arc));
}

/** Rebuild the room's memory after a canon change: the live pass after a turn, then the corpus sweep. */
async function redigest(w: Awaited<ReturnType<typeof world.build>>): Promise<void> {
  const keeper = present(w.h.characters[0]);
  const turn = await w.h.root.services.chat.forceCharacterTurn({ principal: w.h.owner, chatId: w.h.chatId, characterId: keeper.id, intent: TURN_INTENT });
  expect(turn.aborted).toBe(false);
  await w.h.root.settleBackground();
  await w.sweep({ kind: "memory-backfill", params: {} });
}

/** Rewrite the first transcript line of `arc`'s scene, keeping the marker the scripted summarizer keys on. */
async function editScene(h: ChatRoot, arc: Arc): Promise<void> {
  const line = (await readRoomCanon(h.root, h.owner, h.chatId)).find((message) => message.content.includes(`line-${arc}.`));
  if (line === undefined) {
    throw new Error(`the room holds no ${arc} line`);
  }
  await h.root.services.chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: line.id, content: `line-${arc}. The ${arc} was told again.` });
}

test("a struck scene leaves the next prompt while the scene beside it stays, and restoring it brings it back", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const before = await recallTurn(w.h, BOTH);
  expect(before.prompt).toContain("arc-storm.");
  expect(before.prompt).toContain("arc-bath.");
  expect(verdicts(before.trace, "struck")).toEqual([]);

  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(view.status).toEqual({ kind: "ready" });
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(view, "storm").key });

  const struck = await recallTurn(w.h, BOTH);
  expect(struck.prompt).not.toContain("arc-storm.");
  expect(struck.prompt).toContain("arc-bath.");
  expect(verdicts(struck.trace, "struck").map((candidate) => candidate.blockIdx)).toEqual([blockOf("storm")]);
  const listed = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(sceneOf(listed, "storm").strike).toEqual({ strikeId, changedSinceStrike: false });
  expect(sceneOf(listed, "bath").strike).toBeNull();
  // Striking the same item again is the standing strike, not a second one.
  await expect(w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(view, "storm").key })).resolves.toEqual({ strikeId });

  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  const restored = await recallTurn(w.h, BOTH);
  expect(restored.prompt).toContain("arc-storm.");
  expect(verdicts(restored.trace, "struck")).toEqual([]);
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").strike).toBeNull();
});

test("a member is refused a strike and a restore as not the host, and the host's strike lands in the same room", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const member = await invitePerson(w.h);
  const memberView = await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId });
  const item = sceneOf(memberView, "duel").key;

  await expect(w.h.root.services.chat.strikeMemory({ principal: member, chatId: w.h.chatId, item })).rejects.toMatchObject({ code: CHAT_OP_CODES.notHost });
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "duel").strike).toBeNull();

  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item });
  await expect(w.h.root.services.chat.restoreMemory({ principal: member, chatId: w.h.chatId, strikeId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  // The member reads the host's strike: the room's memory is the same for everyone in it.
  expect(sceneOf(await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId }), "duel").strike).toEqual({
    strikeId,
    changedSinceStrike: false,
  });
});

test("a strike outlives its scene being summarized again, and a key read before that summary is refused as stale", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const read = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(read, "storm").key });

  await editScene(w.h, "storm");
  await editScene(w.h, "bath");
  await redigest(w);
  const after = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // The positive control: both scenes were summarized again, so their content hashes moved.
  expect(sceneOf(after, "storm").key.contentHash).not.toBe(sceneOf(read, "storm").key.contentHash);
  expect(sceneOf(after, "bath").key.contentHash).not.toBe(sceneOf(read, "bath").key.contentHash);
  expect(sceneOf(after, "storm").strike).toEqual({ strikeId, changedSinceStrike: true });

  const run = await recallTurn(w.h, BOTH);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).toContain("arc-bath.");

  await expect(w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(read, "bath").key })).rejects.toMatchObject({
    code: CHAT_OP_CODES.memoryItemStale,
  });
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "bath").strike).toBeNull();
  await expect(w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(after, "bath").key })).resolves.toMatchObject({
    strikeId: expect.any(String),
  });
});

test("striking a scene leaves out the consolidation retelling it, and restoring brings both back", async () => {
  await using w = await world.build({ mode: "tiered", maxTier: 1 });
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // With a fan-out of two, the first tier-1 summary retells the first two scenes.
  const merged = itemAt(view, 1, 0);
  expect(merged.retellsStruck).toBe(false);
  const clear = await recallTurn(w.h, BOTH);
  expect(verdicts(clear.trace, "covers-struck")).toEqual([]);

  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(view, "bath").key });
  const listed = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(itemAt(listed, 1, 0)).toMatchObject({ strike: null, retellsStruck: true });
  // The control: the tier-1 summary over the next two scenes does not retell the struck one.
  expect(itemAt(listed, 1, 1).retellsStruck).toBe(false);
  const struck = await recallTurn(w.h, BOTH);
  expect(verdicts(struck.trace, "struck").map((candidate) => [candidate.tier, candidate.blockIdx])).toEqual([[0, blockOf("bath")]]);
  expect(verdicts(struck.trace, "covers-struck").map((candidate) => [candidate.tier, candidate.blockIdx])).toEqual([[1, 0]]);

  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  const restored = await recallTurn(w.h, BOTH);
  expect(verdicts(restored.trace, "struck")).toEqual([]);
  expect(verdicts(restored.trace, "covers-struck")).toEqual([]);
  expect(itemAt(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), 1, 0).retellsStruck).toBe(false);
});

test("a member with a join floor is not shown a summary straddling the floor, and the host is", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  // One more reply makes the canon a whole number of blocks, so the member's floor message ends the last block.
  await redigest(w);
  const joinedAt = (await readRoomCanon(w.h.root, w.h.owner, w.h.chatId)).length;
  expect(joinedAt % BLOCK_SIZE).toBe(0);
  const member = await invitePerson(w.h);
  await w.h.caller.invites.setMemberHistoryVisibility({ chatId: w.h.chatId, userId: member.userId, visibility: "from-join" });
  // One exchange after the join fills the next block wholly above the floor.
  await recallTurn(w.h, BOTH);
  await w.h.root.settleBackground();
  const hostCanon = await readRoomCanon(w.h.root, w.h.owner, w.h.chatId);
  const memberCanon = await readRoomCanon(w.h.root, member, w.h.chatId);
  // The floor is the last message before the join, inclusive: the member reads from there on.
  expect(memberCanon.map((message) => message.id)).toEqual(hostCanon.slice(joinedAt - 1).map((message) => message.id));

  const straddler = joinedAt / BLOCK_SIZE - 1;
  const above = joinedAt / BLOCK_SIZE;
  const hostView = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  itemAt(hostView, 0, straddler);
  itemAt(hostView, 0, above);
  const memberView = await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId });
  expect(memberView.items.map((item) => item.key.blockIdx)).toEqual([above]);
});

test("a strike made in a solo room still holds for its character's own memory once a second character is seated", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const keeper = present(w.h.characters[0]);
  await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").key });

  const scout = await w.h.root.services.character.create({
    principal: w.h.owner,
    input: createCharacterSchema.parse({ handle: "scout", name: "Scout", description: "The scout who rides ahead." }),
  });
  await w.h.caller.chat.addCharacterToChat({ chatId: w.h.chatId, characterId: scout.id });
  // Each speaker now recalls its own bucket beside the room's shared one: the first character's digests are its own.
  await w.h.caller.chat.setGroupConfig({ chatId: w.h.chatId, config: { output: "per-speaker", policy: "list", cardScope: "scoped" } });
  // A built turn mints the room's group character, so the shared bucket is no longer the first character.
  const minted = await w.h.root.services.chat.forceCharacterTurn({ principal: w.h.owner, chatId: w.h.chatId, characterId: scout.id, intent: TURN_INTENT });
  expect(minted.aborted).toBe(false);
  await w.h.root.settleBackground();
  expect(
    (await w.h.caller.chat.memoryView({ chatId: w.h.chatId })).items.some((item) => item.bucket === "shared" && item.key.scopedCharacterId !== keeper.id),
  ).toBe(true);

  await w.h.root.services.chat.commitMessage({ principal: w.h.owner, chatId: w.h.chatId, content: BOTH });
  const before = w.h.root.app.recallRecorder.recent({ chatId: w.h.chatId }).at(-1)?.seq ?? 0;
  const { outcome, bodies } = await wireOf(w.h, () =>
    w.h.root.services.chat.forceCharacterTurn({ principal: w.h.owner, chatId: w.h.chatId, characterId: keeper.id, intent: TURN_INTENT }),
  );
  expect(outcome.aborted).toBe(false);
  const prompt = present(
    bodies
      .map((body) => JSON.stringify(body))
      .filter((body) => generatedText(body) === "The keeper answers.")
      .at(-1),
  );
  const trace = present(
    w.h.root.app.recallRecorder
      .recent({ chatId: w.h.chatId })
      .filter((record) => record.seq > before)
      .at(-1),
  ).trace;
  expect(verdicts(trace, "struck")).toEqual(
    expect.arrayContaining([expect.objectContaining({ scopedCharacterId: keeper.id, tier: 0, blockIdx: blockOf("storm") })]),
  );
  expect(prompt).not.toContain("arc-storm.");
  expect(prompt).toContain("arc-bath.");
});

/** A room whose memory never built: `lines` transcript lines, the host's switch on, the app in a retrieval mode. */
async function unbuiltRoom(lines: number): Promise<ChatRoot> {
  return await createChatRoot({
    providerFetch: async (input, init) =>
      await createCorpusProviderExecution({
        modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
        embedding: embeddingFor,
        structuredReplies: CORPUS_STRUCTURED_REPLIES,
        images: [],
        chatText: generatedText,
      }).execute(new Request(input, init)),
    memoryEnabled: true,
    memoryDefaults: { mode: "mixB", blockSize: BLOCK_SIZE, verbatimWindow: 0, fanOut: FAN_OUT, maxTier: 0 },
    characters: [createCharacterSchema.parse({ handle: "keeper", name: "Keeper", description: "The keeper of the caravan ledger." })],
    transcript: Array.from({ length: lines }, (_, index) => ({ role: "assistant" as const, content: `Line ${index}.` })),
  });
}

test("an empty view says why: memory off for the app, off by the host, or on with nothing remembered yet", async () => {
  await using long = await unbuiltRoom(BLOCK_SIZE * 2);
  const read = (): Promise<MemoryView> => long.caller.chat.memoryView({ chatId: long.chatId });
  expect(await read()).toEqual({ status: { kind: "pending" }, items: [], unmatchedStrikes: [], recentWindowStartsAt: null });
  await long.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  expect((await read()).status).toEqual({ kind: "off", reason: "host-off" });
  // The app's switch outranks the host's: with both off, the view names the app.
  await long.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "off" } } });
  expect((await read()).status).toEqual({ kind: "off", reason: "app-off" });
  await long.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  expect((await read()).status).toEqual({ kind: "off", reason: "app-off" });

  await using short = await unbuiltRoom(BLOCK_SIZE - 1);
  expect(await short.caller.chat.memoryView({ chatId: short.chatId })).toEqual({
    status: { kind: "too-short" },
    items: [],
    unmatchedStrikes: [],
    recentWindowStartsAt: null,
  });
});
