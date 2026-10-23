// @subject packages/server/src/entry/compose/chat-tools.ts
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import { chatParticipants, chats, messageReactions } from "@orb/db";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";

test("the real registered react tool attributes the character seat, preserves repeat data, and rechecks changed room posture", async ({
  harness,
  app,
  db,
  ids,
  clock,
}) => {
  const host = await seedUser(db);
  const character = await seedCharacter(db, { ownerId: host.id, name: "Aria" });
  const room = await seedChat(db, { metadata: { reactionsEnabled: true, charactersCanReact: true } });
  const humanSeat = typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant));
  const characterSeat = typeIdSchema(ID_PREFIX.chatParticipant).parse(ids.next(ID_PREFIX.chatParticipant));
  await db.insert(chatParticipants).values([
    { id: humanSeat, chatId: room.id, kind: "human", userId: host.id, role: "host", joinedAt: clock.now(), joinSeq: 0 },
    { id: characterSeat, chatId: room.id, kind: "character", characterId: character.id, role: "member", joinedAt: clock.now(), joinSeq: 0 },
  ]);
  const message = await seedMessage(db, { chatId: room.id, content: "Aria: That worked." });
  const set = app.toolUse.resolveTools(host.id, [CHAT_REACT_TOOL_NAME]);
  const call = { toolCallId: "call_react", name: CHAT_REACT_TOOL_NAME, arguments: JSON.stringify({ character: "Aria", emoji: "👍" }) };
  const exec = { principal: await principal(harness, host.id), triggeredBy: host.id, chatId: room.id, turnId: null, membership: null };
  const absent = await app.toolUse.executeToolCalls(set, [call], { ...exec, chatId: null });
  expect(absent[0]).toMatchObject({ isError: true, result: JSON.stringify({ error: "react requires a chat context" }) });
  expect(await db.select().from(messageReactions)).toEqual([]);
  const fresh = await app.toolUse.executeToolCalls(set, [call], exec);
  expect(fresh[0]).toMatchObject({
    isError: false,
    result: JSON.stringify({ reacted: true, alreadyReacted: false, character: "Aria", emoji: "👍", target: "the whole message" }),
  });
  const repeat = await app.toolUse.executeToolCalls(set, [call], exec);
  expect(repeat[0]).toMatchObject({
    isError: false,
    result: JSON.stringify({ reacted: false, alreadyReacted: true, character: "Aria", emoji: "👍", target: "the whole message" }),
  });
  expect((await db.select().from(messageReactions)).map((row) => ({ participant: row.reactorParticipantId, variant: row.variantId }))).toEqual([
    { participant: characterSeat, variant: message.variantId },
  ]);
  await db
    .update(chats)
    .set({ metadata: { reactionsEnabled: false, charactersCanReact: true } })
    .where(eq(chats.id, room.id));
  const refused = await app.toolUse.executeToolCalls(set, [call], exec);
  expect(refused[0]).toMatchObject({ isError: true, result: JSON.stringify({ error: "Reactions by characters are turned off in this chat." }) });
  expect((await db.select().from(messageReactions)).map((row) => row.reactorParticipantId)).toEqual([characterSeat]);
});
