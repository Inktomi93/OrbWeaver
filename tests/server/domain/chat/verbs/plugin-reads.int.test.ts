// Production room readers must not send foreign, pre-join or hidden canon into a guest.

import { chatParticipants } from "@orb/db";
import { createChatAutomationReads, createResolveViewerVisibility, loadPluginCharacters, loadPluginMessages } from "@orb/server/domain/chat";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";

test("a cross-wired message fact cannot hydrate another room's canon", async ({ db }): Promise<void> => {
  const own = await seedChat(db);
  const foreign = await seedChat(db);
  const message = await seedMessage(db, { chatId: foreign.id, content: "Foreign room marker" });
  const read = createChatAutomationReads(db);
  expect(await read.getMessageFact(own.id, message.id)).toBeNull();
  expect((await read.getMessageFact(foreign.id, message.id))?.content).toBe("Foreign room marker");
});

test("the guest page applies the floor in SQL and strips hidden bytes before returning content", async ({ db }): Promise<void> => {
  const room = await seedChat(db, { withHost: true });
  if (room.hostUserId === undefined) {
    throw new Error("the builder must create its requested host");
  }
  const visibility = createResolveViewerVisibility({ db });
  const hostView = await visibility(room.id, room.hostUserId);
  await db.update(chatParticipants).set({ role: "member", joinSeq: 2, joinHistoryVisibility: "from-join" }).where(eq(chatParticipants.chatId, room.id));
  const memberView = await visibility(room.id, room.hostUserId);
  if (hostView === null || memberView === null) {
    throw new Error("the builder's present human must have a visibility verdict");
  }
  await seedMessage(db, { chatId: room.id, seq: 1, content: "Pre-join marker" });
  await seedMessage(db, { chatId: room.id, seq: 2, content: 'Visible <lie character="A" truth="Host-only marker"/>' });
  await seedMessage(db, { chatId: room.id, seq: 3, content: "Newest" });
  const member = await loadPluginMessages(db, room.id, { floorSeq: memberView.historyFloorSeq, readsHidden: memberView.readsHidden, limit: 3 });
  const host = await loadPluginMessages(db, room.id, { floorSeq: hostView.historyFloorSeq, readsHidden: hostView.readsHidden, limit: 3 });
  expect(member.map((row) => [row.seq, row.content])).toEqual([
    [2, "Visible "],
    [3, "Newest"],
  ]);
  expect(JSON.stringify(member)).not.toContain("marker");
  expect(host.map((row) => row.seq)).toEqual([1, 2, 3]);
  expect(host[1]?.content).toContain("Host-only marker");
});

test("a departed character seat is not exposed as a present guest roster member", async ({ db }): Promise<void> => {
  const room = await seedChat(db, { withCharacter: true });
  const foreign = await seedChat(db, { withCharacter: true });
  expect((await loadPluginCharacters(db, room.id)).map((row) => row.id)).toEqual([room.characterId]);
  expect((await loadPluginCharacters(db, foreign.id)).map((row) => row.id)).toEqual([foreign.characterId]);
  await db.update(chatParticipants).set({ leftSeq: 1 }).where(eq(chatParticipants.chatId, room.id));
  expect(await loadPluginCharacters(db, room.id)).toEqual([]);
});
