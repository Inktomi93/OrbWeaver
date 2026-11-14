// A fork carries the room's memory strikes, through the composed root: a scene the host struck stays out of the fork's
// prompts once the fork's own memory builds, while an unstruck scene stays in; a fork point inside a struck span carries
// no strike for it; a forker with a history floor gets no strike wholly below it, and a fork block two strikes land on
// keeps the one the fork copied whole; and when the fork's blocks cut a struck scene in two, both halves stay struck
// once the fork's memory builds.
// Digests come from the production memory build; only the provider edges are scripted (`recall-world.ts`).
// @subject packages/server/src/domain/chat/verbs/fork.ts
// @subject packages/server/src/domain/chat/memory/strikes.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon, seedCorpusConnections } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import type { Arc } from "./recall-world.ts";
import {
  BLOCK_SIZE,
  BOTH,
  blockOf,
  fillerLine,
  itemAt,
  probe,
  RECALL_KNOBS,
  recallTurn,
  sceneLine,
  sceneOf,
  TURN_INTENT,
  verdicts,
  world,
} from "./recall-world.ts";

async function strikeScene(h: ChatRoot, arc: Arc): Promise<void> {
  await h.caller.chat.strikeMemory({ chatId: h.chatId, item: sceneOf(await h.caller.chat.memoryView({ chatId: h.chatId }), arc).key });
}

/** The room the owner's fork lives in, on the same root and the same owner. */
async function forkRoom(h: ChatRoot, throughSeq?: number): Promise<ChatRoot> {
  const fork = await h.root.services.chat.forkChat({ principal: h.owner, chatId: h.chatId, ...(throughSeq === undefined ? {} : { throughSeq }) });
  return { ...h, chatId: fork.chat.id };
}

test("a scene struck in the room stays out of its fork's prompts while an unstruck scene stays", { tags: ["slow"] }, async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  await strikeScene(w.h, "storm");

  const fork = await forkRoom(w.h);
  // The fork copies canon, not summaries: its memory builds from that canon, then recall reads it.
  const keeper = present(fork.characters[0]);
  const built = await fork.root.services.chat.forceCharacterTurn({ principal: fork.owner, chatId: fork.chatId, characterId: keeper.id, intent: TURN_INTENT });
  expect(built.aborted).toBe(false);
  await fork.root.settleBackground();
  await w.sweep({ kind: "memory-backfill", params: {} });

  const view = await fork.caller.chat.memoryView({ chatId: fork.chatId });
  // The scene's own summary in the fork reads as struck, and as unchanged since the strike: the same canon.
  expect(sceneOf(view, "storm").strike).toEqual({ strikeId: expect.any(String), changedSinceStrike: false });
  expect(sceneOf(view, "bath").strike).toBeNull();
  expect(view.unmatchedStrikes).toEqual([]);

  const run = await recallTurn(fork, BOTH);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).toContain("arc-bath.");
});

test("a fork point inside a struck span carries no strike for it, and a strike wholly before the point stays", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await strikeScene(w.h, "bath");
  await strikeScene(w.h, "storm");
  const bathAnchor = sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "bath").topicAnchor;

  // The storm scene is two messages; the fork point is after the first of them.
  const stormFirstSeq = blockOf("storm") * BLOCK_SIZE + 1;
  const fork = await forkRoom(w.h, stormFirstSeq);
  // The fork has no summaries yet, so each strike it carries waits for its scene, listed.
  const view = await fork.caller.chat.memoryView({ chatId: fork.chatId });
  expect(view.items).toEqual([]);
  expect(view.unmatchedStrikes.map((strike) => strike.topicAnchor)).toEqual([bathAnchor]);
});

type Member = ChatRoot["owner"];

/** Commit `lines` to the owner's room, then let a member in with a history floor at the last of them. The canon must
 *  end on a block edge there, so the floor message opens a block of the fork while it closes one of the room. */
async function joinAfter(w: { readonly h: ChatRoot }, lines: readonly string[]): Promise<{ readonly member: Member; readonly floor: number }> {
  await commitAll(w.h, lines);
  const floor = (await readRoomCanon(w.h.root, w.h.owner, w.h.chatId)).length;
  expect(floor % BLOCK_SIZE).toBe(0);
  const member = await invitePerson(w.h);
  await w.h.root.services.chat.setMemberHistoryVisibility({ principal: w.h.owner, chatId: w.h.chatId, userId: member.userId, visibility: "from-join" });
  await w.h.root.services.settings.updateUserSettingsSection({ principal: member, input: { section: "memory", patch: { enabled: true } } });
  return { member, floor };
}

async function commitAll(h: ChatRoot, lines: readonly string[]): Promise<void> {
  for (const content of lines) {
    await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content });
  }
}

const PAUSE = "The caravan paused at the ford.";
const FILLER_AFTER = 10;

test("a floored forker's fork carries no strike wholly below their floor, and a block two strikes land on keeps the one it copied whole", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  // The straddler is the warm-up reply and the shrine line the floor lands on; the market scene follows the floor.
  const { member, floor } = await joinAfter(w, [sceneLine("shrine")]);
  await commitAll(w.h, [sceneLine("market"), sceneLine("market")]);
  await w.sweep({ kind: "memory-backfill", params: {} });

  const hostView = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const below = itemAt(hostView, 0, blockOf("storm"));
  const straddler = itemAt(hostView, 0, floor / BLOCK_SIZE - 1);
  const above = itemAt(hostView, 0, floor / BLOCK_SIZE);
  // The premise: three distinct anchors, so the list names which strike the fork kept.
  expect(new Set([below.topicAnchor, straddler.topicAnchor, above.topicAnchor]).size).toBe(3);
  // Oldest first: the straddler is struck before the scene above the floor, so table order alone would keep it.
  for (const item of [below, straddler, above]) {
    await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: item.key });
  }
  await w.h.root.services.chat.selfLeave({ principal: w.h.owner, chatId: w.h.chatId });

  // The fork's one complete block holds the floor message and the market scene's first line: both later strikes
  // overlap it, and the market strike, copied whole, wins it with its anchor. The storm strike overlaps nothing.
  const fork = await w.h.root.services.chat.forkChat({ principal: member, chatId: w.h.chatId });
  const view = await w.h.root.services.chat.memoryView({ principal: member, chatId: fork.chat.id });
  expect(view.unmatchedStrikes.map((strike) => strike.topicAnchor)).toEqual([above.topicAnchor]);
});

test("a strike straddling a floored forker's floor holds in the fork without the anchor that retells turns below it", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const { member, floor } = await joinAfter(w, [sceneLine("shrine")]);
  // One line after the floor completes the fork's first block, which the straddling scene overlaps on the floor message.
  await commitAll(w.h, [PAUSE]);
  await w.sweep({ kind: "memory-backfill", params: {} });
  const straddler = itemAt(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), 0, floor / BLOCK_SIZE - 1);
  // The control: the room's own summary of the straddling scene has an anchor the fork could have copied.
  expect(straddler.topicAnchor).not.toBeNull();
  await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: straddler.key });
  await w.h.root.services.chat.selfLeave({ principal: w.h.owner, chatId: w.h.chatId });

  const fork = await w.h.root.services.chat.forkChat({ principal: member, chatId: w.h.chatId });
  const view = await w.h.root.services.chat.memoryView({ principal: member, chatId: fork.chat.id });
  expect(view.unmatchedStrikes).toEqual([expect.objectContaining({ strikeId: expect.any(String), topicAnchor: null })]);
});

/** Seat two of the member's own cards in their fork, on their own connections. A card seated after the fork witnessed
 *  none of the copied story, so only the room's shared group memory summarizes it; the first card speaks. */
async function seatMemberCards(h: ChatRoot, member: Member): Promise<CharacterId> {
  await seedCorpusConnections(h.root, member);
  const seat = async (handle: string): Promise<CharacterId> => {
    const card = await h.root.services.character.create({
      principal: member,
      input: createCharacterSchema.parse({ handle, name: handle, description: `The ${handle}.` }),
    });
    await h.root.services.chat.addCharacterToChat({ principal: member, chatId: h.chatId, characterId: card.id });
    return card.id;
  };
  const speaker = await seat("rider");
  await seat("scribe");
  return speaker;
}

test("a floored fork whose blocks cut a struck scene in two keeps the scene out of its built memory and its prompt", { tags: ["slow"] }, async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const { member, floor } = await joinAfter(w, [PAUSE]);
  // The farewell scene is the room's block right above the floor; the fork's blocks start on the floor message, so
  // it splits across the fork's first two blocks. The duel scene sits on a fork block of its own; the filler lines push
  // both scenes out of the prompt's window, so recall decides whether their summaries are read.
  await commitAll(w.h, [
    sceneLine("farewell"),
    sceneLine("farewell"),
    PAUSE,
    sceneLine("duel"),
    sceneLine("duel"),
    ...Array.from({ length: FILLER_AFTER }, (_, index) => fillerLine(index)),
  ]);
  await w.sweep({ kind: "memory-backfill", params: {} });
  const struck = itemAt(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), 0, floor / BLOCK_SIZE);
  expect(struck.text).toContain("arc-farewell.");
  await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: struck.key });
  await w.h.root.services.chat.selfLeave({ principal: w.h.owner, chatId: w.h.chatId });

  const forked = await w.h.root.services.chat.forkChat({ principal: member, chatId: w.h.chatId });
  const fork: ChatRoot = { ...w.h, owner: member, chatId: forked.chat.id };
  // The fork seats none of the owner's cards.
  const rider = await seatMemberCards(fork, member);
  const built = await w.h.root.services.chat.forceCharacterTurn({ principal: member, chatId: fork.chatId, characterId: rider, intent: TURN_INTENT });
  expect(built.aborted).toBe(false);
  await w.h.root.settleBackground();
  await w.activate(member);

  const run = await recallTurn(fork, `Tell me about the scene. ${probe("duel")} ${probe("farewell")}`);
  expect(run.prompt).not.toContain("arc-farewell.");
  // The control: the unstruck scene the same window ages out reaches the prompt from the fork's memory.
  expect(run.prompt).toContain("arc-duel.");
  expect(verdicts(run.trace, "struck").map((candidate) => candidate.blockIdx)).toEqual([0, 1]);

  // The host of the fork sees both halves struck, as summaries that are not the one struck, and nothing waiting.
  const view = await w.h.root.services.chat.memoryView({ principal: member, chatId: fork.chatId });
  const farewell = view.items.filter((item) => item.text.includes("arc-farewell."));
  expect(farewell.map((item) => item.key.blockIdx)).toEqual([0, 1]);
  expect(farewell.map((item) => item.strike)).toEqual([
    { strikeId: expect.any(String), changedSinceStrike: true },
    { strikeId: expect.any(String), changedSinceStrike: true },
  ]);
  expect(view.unmatchedStrikes).toEqual([]);
});
