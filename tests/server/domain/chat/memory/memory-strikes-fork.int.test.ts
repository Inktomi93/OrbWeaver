// A fork carries the room's memory strikes, through the composed root: a scene the host struck stays out of the fork's
// prompts once the fork's own memory builds, while an unstruck scene stays in; a fork point inside a struck span carries
// no strike for it; and a forker with a history floor gets only the strikes whose span sits at or above it.
// Digests come from the production memory build; only the provider edges are scripted (`recall-world.ts`).
// @subject packages/server/src/domain/chat/verbs/fork.ts
// @subject packages/server/src/domain/chat/memory/strikes.ts

import type { MemoryView } from "@orb/contracts/chat";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import type { Arc } from "./recall-world.ts";
import { BLOCK_SIZE, blockOf, probe, recallTurn, TURN_INTENT, world } from "./recall-world.ts";

const BOTH = `Tell me about the scene. ${probe("bath")} ${probe("storm")}`;
const RECALL_KNOBS = { minScore: 0.05, queryWindow: 1, keywordMatch: false } as const;

function itemAt(view: MemoryView, tier: number, blockIdx: number): MemoryView["items"][number] {
  return present(view.items.find((item) => item.key.tier === tier && item.key.blockIdx === blockIdx));
}

function sceneOf(view: MemoryView, arc: Arc): MemoryView["items"][number] {
  return itemAt(view, 0, blockOf(arc));
}

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

test("a floored forker's fork carries no strike below their floor", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  // One more reply makes the canon a whole number of blocks, so the join floor falls between two of them.
  const keeper = present(w.h.characters[0]);
  const extended = await w.h.root.services.chat.forceCharacterTurn({ principal: w.h.owner, chatId: w.h.chatId, characterId: keeper.id, intent: TURN_INTENT });
  expect(extended.aborted).toBe(false);
  await w.h.root.settleBackground();
  await w.sweep({ kind: "memory-backfill", params: {} });
  const joinedAt = (await readRoomCanon(w.h.root, w.h.owner, w.h.chatId)).length;
  expect(joinedAt % BLOCK_SIZE).toBe(0);
  const member = await invitePerson(w.h);
  await w.h.root.services.chat.setMemberHistoryVisibility({ principal: w.h.owner, chatId: w.h.chatId, userId: member.userId, visibility: "from-join" });
  await w.h.root.services.settings.updateUserSettingsSection({ principal: member, input: { section: "memory", patch: { enabled: true } } });
  // One exchange after the join fills the next block wholly above the floor.
  await recallTurn(w.h, BOTH);
  await w.h.root.settleBackground();

  const hostView = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const below = blockOf("storm");
  const straddler = joinedAt / BLOCK_SIZE - 1;
  const above = joinedAt / BLOCK_SIZE;
  // The storm scene lies below the floor, the straddler ends on the floor message and starts under it, and the last
  // block is the only one wholly at or above the floor.
  for (const blockIdx of [below, straddler, above]) {
    await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: itemAt(hostView, 0, blockIdx).key });
  }
  await w.h.root.services.chat.selfLeave({ principal: w.h.owner, chatId: w.h.chatId });

  const fork = await w.h.root.services.chat.forkChat({ principal: member, chatId: w.h.chatId });
  const view = await w.h.root.services.chat.memoryView({ principal: member, chatId: fork.chat.id });
  expect(view.unmatchedStrikes.map((strike) => strike.topicAnchor)).toEqual([itemAt(hostView, 0, above).topicAnchor]);
});
