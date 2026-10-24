// The registered react tool stores one message_reactions row on the character seat, a repeat adds none, and
// turning reactions off refuses the tool while the stored row stays.
// @subject packages/server/src/entry/compose/chat-tools.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import { messageReactions } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { seedCharacter, seedTranscript } from "@orb/testkit/node/composed";

test("the real registered react tool attributes the character seat, preserves repeat data, and rechecks changed room posture", async ({ harness, app, db }) => {
  const host = await harness.principalFor((await harness.actor()).id);
  const character = await seedCharacter(harness, { principal: host, input: createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "" }) });
  const room = await seedTranscript(harness, {
    ownerId: host.userId,
    characterHandles: [character.row.handle],
    lines: [{ role: "assistant", content: "Aria: That worked." }],
  });
  const chatId = room.row.id;
  await harness.services.chat.setReactionsEnabled({ principal: host, chatId, enabled: true });
  await harness.services.chat.setCharactersCanReact({ principal: host, chatId, enabled: true });
  const characterSeat = room.participants.find((seat) => seat.characterId === character.row.id)?.id;
  const message = room.messages[0];
  if (characterSeat === undefined || message === undefined) {
    throw new Error("the transcript import seated no character or wrote no message");
  }
  const set = app.toolUse.resolveTools(host.userId, [CHAT_REACT_TOOL_NAME]);
  const call = { toolCallId: "call_react", name: CHAT_REACT_TOOL_NAME, arguments: JSON.stringify({ character: "Aria", emoji: "👍" }) };
  const exec = { principal: host, triggeredBy: host.userId, chatId, turnId: null, membership: null };
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
    { participant: characterSeat, variant: message.variant.id },
  ]);
  await harness.services.chat.setReactionsEnabled({ principal: host, chatId, enabled: false });
  const refused = await app.toolUse.executeToolCalls(set, [call], exec);
  expect(refused[0]).toMatchObject({ isError: true, result: JSON.stringify({ error: "Reactions by characters are turned off in this chat." }) });
  expect((await db.select().from(messageReactions)).map((row) => row.reactorParticipantId)).toEqual([characterSeat]);
});
