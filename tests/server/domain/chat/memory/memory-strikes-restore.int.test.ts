// A room's memory strikes travel with the library backup's chat arm: restored onto the library that wrote it after
// the strike was lifted, the file's strike comes back once; restored into a library that never held it, the strike
// lands on the same span and leaves the scene out of that room's prompt, and restoring that file again adds none; an
// ex-host's re-import writes nothing into the room they handed off.
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts
// @subject packages/server/src/domain/chat/memory/persistence/import-strikes.ts

import type { MemoryView } from "@orb/contracts/chat";
import type { PortableFile } from "@orb/contracts/portability";
import type { ChatId } from "@orb/kit/ids";
import { CHAT_BUNDLE_EXT } from "@orb/server/primitives/serde/chat-bundle";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { failOnExportNote } from "@orb/testkit/node/helpers";
import { invitePerson } from "../persona-cache-physical.ts";
import type { Arc } from "./recall-world.ts";
import { blockOf, probe, recallTurn, TURN_INTENT, world } from "./recall-world.ts";

const BOTH = `Tell me about the scene. ${probe("bath")} ${probe("storm")}`;
const RECALL_KNOBS = { minScore: 0.05, queryWindow: 1, keywordMatch: false } as const;

function chatArm(h: ChatRoot): NonNullable<ReturnType<ChatRoot["root"]["app"]["portability"]["find"]>> {
  return present(h.root.app.portability.find((entity) => entity.kind === "chat"));
}

/** The owner's room files from the chat arm of the library backup. */
async function exportRooms(h: ChatRoot): Promise<PortableFile[]> {
  const files: PortableFile[] = [];
  for await (const file of chatArm(h).exportAll(h.root.ownerId, failOnExportNote)) {
    if (file.filename.endsWith(CHAT_BUNDLE_EXT)) {
      files.push(file);
    }
  }
  return files;
}

async function roomIds(h: ChatRoot): Promise<readonly ChatId[]> {
  return (await h.caller.chat.listChats({ limit: 50 })).items.map((item) => item.id);
}

function struckScenes(view: MemoryView): readonly number[] {
  return view.items.filter((item) => item.key.tier === 0 && item.strike !== null).map((item) => item.key.blockIdx);
}

function sceneKey(view: MemoryView, arc: Arc): MemoryView["items"][number]["key"] {
  return present(view.items.find((item) => item.key.tier === 0 && item.key.blockIdx === blockOf(arc))).key;
}

/** The anchors of every strike standing in the owner's rooms, matched or waiting for its room's summaries. */
async function standingStrikeAnchors(h: ChatRoot): Promise<readonly (string | null)[]> {
  const anchors: (string | null)[] = [];
  for (const chatId of await roomIds(h)) {
    const view = await h.caller.chat.memoryView({ chatId });
    anchors.push(...view.items.flatMap((item) => (item.strike === null ? [] : [item.topicAnchor])), ...view.unmatchedStrikes.map((s) => s.topicAnchor));
  }
  return anchors;
}

test("restored onto the library that wrote it, a room whose strike was lifted after the backup gets it back from the file, once", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const before = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const storm = present(before.items.find((item) => item.key.tier === 0 && item.key.blockIdx === blockOf("storm")));
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: storm.key });
  const [file, ...others] = await exportRooms(w.h);
  expect(others).toEqual([]);
  // The room moves on after the backup: the host lifts the strike, so only the file still carries it.
  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  expect(await standingStrikeAnchors(w.h)).toEqual([]);

  for (const _attempt of [1, 2]) {
    await expect(chatArm(w.h).importFile(w.h.root.ownerId, present(file))).resolves.toMatchObject({ ok: true });
  }
  expect(await standingStrikeAnchors(w.h)).toEqual([storm.topicAnchor]);
});

test("restored into a library that never held the room, the strike lands on the same span and leaves the scene out of its prompt", {
  tags: ["slow"],
}, async () => {
  await using source = await world.build({ mode: "mixB", maxTier: 0 });
  await source.h.caller.chat.strikeMemory({
    chatId: source.h.chatId,
    item: sceneKey(await source.h.caller.chat.memoryView({ chatId: source.h.chatId }), "storm"),
  });
  const [file] = await exportRooms(source.h);

  await using target = await world.build({ mode: "mixB", maxTier: 0 });
  await target.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  // The target's own room is the same transcript under the same frozen clock, so a strikeless file would match it
  // as an unchanged room. Deleting it leaves a library that holds the character but never the room.
  await target.h.root.services.chat.delete({ principal: target.h.owner, chatId: target.h.chatId });
  const before = await roomIds(target.h);
  expect(before).toEqual([]);
  await expect(chatArm(target.h).importFile(target.h.root.ownerId, present(file))).resolves.toMatchObject({ ok: true, created: true });
  const restoredId = present((await roomIds(target.h)).find((id) => !before.includes(id)));
  const restored: ChatRoot = { ...target.h, chatId: restoredId };

  // The restored room has no summaries until its memory builds; the strike waits for them, listed, suppressing nothing.
  const waiting = await target.h.caller.chat.memoryView({ chatId: restoredId });
  expect(waiting.items).toEqual([]);
  expect(waiting.unmatchedStrikes).toHaveLength(1);
  const keeper = present(target.h.characters[0]);
  const built = await target.h.root.services.chat.forceCharacterTurn({
    principal: target.h.owner,
    chatId: restoredId,
    characterId: keeper.id,
    intent: TURN_INTENT,
  });
  expect(built.aborted).toBe(false);
  await target.h.root.settleBackground();
  await target.sweep({ kind: "memory-backfill", params: {} });

  const view = await target.h.caller.chat.memoryView({ chatId: restoredId });
  expect(struckScenes(view)).toEqual([blockOf("storm")]);
  expect(view.unmatchedStrikes).toEqual([]);
  // A restored strike never saw this library's summary, so the view does not claim the scene changed since.
  expect(view.items.find((item) => item.strike !== null)?.strike?.changedSinceStrike).toBe(false);
  const run = await recallTurn(restored, BOTH);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).toContain("arc-bath.");

  await expect(chatArm(target.h).importFile(target.h.root.ownerId, present(file))).resolves.toMatchObject({ ok: true, created: false });
  const again = await target.h.caller.chat.memoryView({ chatId: restoredId });
  expect(struckScenes(again)).toEqual([blockOf("storm")]);
  expect(again.unmatchedStrikes).toEqual([]);
});

test("an ex-host re-importing the room's file after a handoff writes no strike into the new host's room", { tags: ["slow"] }, async () => {
  await using source = await world.build({ mode: "mixB", maxTier: 0 });
  await source.h.caller.chat.strikeMemory({
    chatId: source.h.chatId,
    item: sceneKey(await source.h.caller.chat.memoryView({ chatId: source.h.chatId }), "storm"),
  });
  const [file] = await exportRooms(source.h);

  await using target = await world.build({ mode: "mixB", maxTier: 0 });
  await target.h.root.services.chat.delete({ principal: target.h.owner, chatId: target.h.chatId });
  await expect(chatArm(target.h).importFile(target.h.root.ownerId, present(file))).resolves.toMatchObject({ ok: true, created: true });
  const roomId = present((await roomIds(target.h))[0]);
  const room: ChatRoot = { ...target.h, chatId: roomId };
  const member = await invitePerson(room);
  await target.h.root.services.settings.updateUserSettingsSection({ principal: member, input: { section: "memory", patch: { enabled: true } } });
  await target.h.root.services.chat.nominateHostHandoff({ principal: target.h.owner, chatId: roomId, userId: member.userId });
  await target.h.root.services.chat.acceptHostHandoff({ principal: member, chatId: roomId });
  // The new host lifts the strike the first import landed.
  const asNewHost = await target.h.root.services.chat.memoryView({ principal: member, chatId: roomId });
  const standing = present(asNewHost.unmatchedStrikes[0]?.strikeId ?? asNewHost.items.find((item) => item.strike !== null)?.strike?.strikeId);
  await target.h.root.services.chat.restoreMemory({ principal: member, chatId: roomId, strikeId: standing });

  // The ex-host, now a member, imports the same file again; the import still claims the handed-off room.
  await expect(chatArm(target.h).importFile(target.h.root.ownerId, present(file))).resolves.toMatchObject({ ok: true, created: false });
  const after = await target.h.root.services.chat.memoryView({ principal: member, chatId: roomId });
  expect(after.unmatchedStrikes).toEqual([]);
  expect(struckScenes(after)).toEqual([]);
});
