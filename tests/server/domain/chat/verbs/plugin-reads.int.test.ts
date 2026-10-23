// Production room readers must not send foreign, pre-join or hidden canon into a guest.

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createChatAutomationReads, createResolveViewerVisibility, loadPluginCharacters, loadPluginMessages } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  createServerHarness,
  seedCharacter,
  seedChat,
  seedChatInvite,
  seedCorpusActors,
  seedInvitedChatParticipant,
  seedMessage,
} from "@orb/testkit/node/composed";

async function actor(harness: ServerTestHarness): Promise<Principal> {
  return await harness.principalFor((await harness.actor()).id);
}

// A committed line is funded by the room host's chat binding, so both hosts carry the corpus connections.
test("a cross-wired message fact cannot hydrate another room's canon", async (): Promise<void> => {
  await using root = await createServerHarness();
  const { owner: ownHost, secondUserId } = await seedCorpusActors(root);
  const foreignHost = await root.principalFor(secondUserId);
  const { row: own } = await seedChat(root, { principal: ownHost, characterIds: [] });
  const { row: foreign } = await seedChat(root, { principal: foreignHost, characterIds: [] });
  const { slot: message } = await seedMessage(root, { principal: foreignHost, chatId: foreign.id, content: "Foreign room marker" });
  const read = createChatAutomationReads(databaseHandle(root.db));
  expect(await read.getMessageFact(own.id, message.id)).toBeNull();
  expect((await read.getMessageFact(foreign.id, message.id))?.content).toBe("Foreign room marker");
});

test("the guest page applies the floor in SQL and strips hidden bytes before returning content", async (): Promise<void> => {
  await using root = await createServerHarness();
  const { owner: host } = await seedCorpusActors(root);
  const guest = await actor(root);
  const db = root.db;
  const { row: room } = await seedChat(root, { principal: host, characterIds: [] });
  await seedMessage(root, { principal: host, chatId: room.id, content: "Pre-join marker" });
  await seedMessage(root, { principal: host, chatId: room.id, content: 'Visible <lie character="A" truth="Host-only marker"/>' });
  const invite = await seedChatInvite(root, { principal: host, chatId: room.id, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(root, { principal: guest, inviteId: invite.id });
  await root.services.chat.setMemberHistoryVisibility({ principal: host, chatId: room.id, userId: guest.userId, visibility: "from-join" });
  await seedMessage(root, { principal: host, chatId: room.id, content: "Newest" });
  const visibility = createResolveViewerVisibility({ db: databaseHandle(db) });
  const hostView = await visibility(room.id, host.userId);
  const memberView = await visibility(room.id, guest.userId);
  if (hostView === null || memberView === null) {
    throw new Error("each present human must have a visibility verdict");
  }
  const member = await loadPluginMessages(databaseHandle(db), room.id, { floorSeq: memberView.historyFloorSeq, readsHidden: memberView.readsHidden, limit: 3 });
  const hosted = await loadPluginMessages(databaseHandle(db), room.id, { floorSeq: hostView.historyFloorSeq, readsHidden: hostView.readsHidden, limit: 3 });
  expect(member.map((row) => [row.seq, row.content])).toEqual([
    [2, "Visible "],
    [3, "Newest"],
  ]);
  expect(JSON.stringify(member)).not.toContain("marker");
  expect(hosted.map((row) => row.seq)).toEqual([1, 2, 3]);
  expect(hosted[1]?.content).toContain("Host-only marker");
});

test("a departed character seat is not exposed as a present guest roster member", async ({ harness, db }): Promise<void> => {
  const host = await actor(harness);
  const foreignHost = await actor(harness);
  const input = createCharacterSchema.parse({ handle: "guest-reader", name: "Guest reader", description: "" });
  const { row: seated } = await seedCharacter(harness, { principal: host, input });
  const { row: foreignSeated } = await seedCharacter(harness, { principal: foreignHost, input });
  const { row: room } = await seedChat(harness, { principal: host, characterIds: [seated.id] });
  const { row: foreign } = await seedChat(harness, { principal: foreignHost, characterIds: [foreignSeated.id] });
  expect((await loadPluginCharacters(databaseHandle(db), room.id)).map((row) => row.id)).toEqual([seated.id]);
  expect((await loadPluginCharacters(databaseHandle(db), foreign.id)).map((row) => row.id)).toEqual([foreignSeated.id]);
  await harness.services.chat.removeCharacterFromChat({ principal: host, chatId: room.id, characterId: seated.id });
  expect(await loadPluginCharacters(databaseHandle(db), room.id)).toEqual([]);
});
