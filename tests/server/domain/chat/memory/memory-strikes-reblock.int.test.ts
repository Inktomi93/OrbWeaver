// A strike holds when the room's memory is sliced into other blocks, through the composed root: after the block size
// drops, the struck scene's smaller summaries stay out of the prompt while an unstruck scene stays, the view lists the
// strike as matched, and restore brings the scene back; after the block size grows, a block that holds part of the
// struck scene and part of an unstruck one is left out whole; and a new host after a handoff reads the same.
// Digests come from the production memory build; only the provider edges are scripted (`recall-world.ts`).
// @subject packages/kit/src/recall/index.ts
// @subject packages/server/src/domain/chat/memory/strikes.ts

import type { MemoryView } from "@orb/contracts/chat";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { seedCorpusConnections } from "@orb/testkit/node/composed";
import { handOff } from "../handoff-attachments-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import type { Arc } from "./recall-world.ts";
import { BLOCK_SIZE, BOTH, blockOf, probe, RECALL_KNOBS, recallTurn, redigest, sceneOf, verdicts, world } from "./recall-world.ts";

/** Every tier-0 summary of `arc`'s scene, with its block position and strike as the view lists them. */
function scenePieces(view: MemoryView, arc: Arc): readonly (readonly [number, MemoryView["items"][number]["strike"], boolean])[] {
  return view.items
    .filter((item) => item.key.tier === 0 && item.text.includes(`arc-${arc}.`))
    .map((item) => [item.key.blockIdx, item.strike, item.retellsStruck] as const);
}

test("a struck scene stays out of the prompt after the block size drops, the strike lists as matched, and restore brings it back", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const { strikeId } = await w.h.caller.chat.strikeMemory({
    chatId: w.h.chatId,
    item: sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").key,
  });

  // One message per block: each of the storm scene's two lines is now its own summary, neither spanning the strike.
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { blockSize: 1 } } });
  await redigest(w);
  const stormBlocks = [blockOf("storm") * BLOCK_SIZE, blockOf("storm") * BLOCK_SIZE + 1];
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(scenePieces(view, "storm")).toEqual([
    [stormBlocks[0], { strikeId, changedSinceStrike: true }, false],
    [stormBlocks[1], null, true],
  ]);
  expect(view.unmatchedStrikes).toEqual([]);

  const struck = await recallTurn(w.h, BOTH);
  expect(struck.prompt).not.toContain("arc-storm.");
  expect(struck.prompt).toContain("arc-bath.");
  expect(verdicts(struck.trace, "covers-struck").map((candidate) => candidate.blockIdx)).toEqual(stormBlocks);

  // A member reads the scene as struck, without the id only the host restores with.
  const member = await invitePerson(w.h);
  expect(scenePieces(await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId }), "storm")).toEqual([
    [stormBlocks[0], { strikeId: null, changedSinceStrike: true }, false],
    [stormBlocks[1], null, true],
  ]);

  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  const restored = await recallTurn(w.h, BOTH);
  expect(restored.prompt).toContain("arc-storm.");
  expect(verdicts(restored.trace, "covers-struck")).toEqual([]);
});

test("after the block size grows, a block holding part of the struck scene and part of an unstruck one is left out whole", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const { strikeId } = await w.h.caller.chat.strikeMemory({
    chatId: w.h.chatId,
    item: sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").key,
  });

  // Three messages per block: the storm scene's first line closes the shrine block, and its second opens the farewell
  // block. The scripted summarizer names a block by the first arc it holds, so those read as shrine and storm.
  const blockSize = 3;
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { blockSize } } });
  await redigest(w);
  const straddlers = [Math.floor((blockOf("storm") * BLOCK_SIZE) / blockSize), Math.floor((blockOf("storm") * BLOCK_SIZE + 1) / blockSize)];
  const ask = `Tell me about the scene. ${probe("bath")} ${probe("shrine")} ${probe("storm")}`;

  const struck = await recallTurn(w.h, ask);
  expect(verdicts(struck.trace, "covers-struck").map((candidate) => candidate.blockIdx)).toEqual(straddlers);
  expect(struck.prompt).not.toContain("arc-storm.");
  expect(struck.prompt).not.toContain("arc-shrine.");
  expect(struck.prompt).toContain("arc-bath.");
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(view.items.filter((item) => item.strike !== null).map((item) => [item.key.blockIdx, item.strike])).toEqual([
    [straddlers[0], { strikeId, changedSinceStrike: true }],
  ]);
  expect(view.unmatchedStrikes).toEqual([]);

  // The control: restored, both straddling blocks reach the prompt, so the strike alone left them out.
  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  const restored = await recallTurn(w.h, ask);
  expect(restored.prompt).toContain("arc-shrine.");
  expect(restored.prompt).toContain("arc-storm.");
});

test("a new host after a handoff and a smaller block size keeps the struck scene out of their prompt and reads the strike", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const { strikeId } = await w.h.caller.chat.strikeMemory({
    chatId: w.h.chatId,
    item: sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").key,
  });
  const member = await invitePerson(w.h);
  await w.h.root.services.settings.updateUserSettingsSection({ principal: member, input: { section: "memory", patch: { enabled: true } } });
  await seedCorpusConnections(w.h.root, member);
  await handOff(w.h, member, true);
  const room: ChatRoot = { ...w.h, owner: member };

  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { blockSize: 1 } } });
  await w.activate(member);
  // Which summary carries the strike is not pinned here: the new host's sweep writes the room's spans into their own
  // embed space beside the old host's, and the span read folds both (draft item filed with this case).
  const asHost = await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId });
  expect(asHost.items.filter((item) => item.strike !== null).map((item) => item.strike)).toEqual([{ strikeId, changedSinceStrike: true }]);
  expect(nonEmpty(scenePieces(asHost, "storm")).every(([, strike, retells]) => strike !== null || retells)).toBe(true);
  expect(asHost.unmatchedStrikes).toEqual([]);
  // The old host is a member now, and reads the strike without its id.
  const asOldHost = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(asOldHost.items.filter((item) => item.strike !== null).map((item) => item.strike)).toEqual([{ strikeId: null, changedSinceStrike: true }]);

  const run = await recallTurn(room, BOTH);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).toContain("arc-bath.");
});
