// A hidden tag the model broke hides the rest of the body from a member; prose that merely starts like one does not.
// @subject packages/kit/src/content/index.ts
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts

import { expect, test } from "@orb/testkit/node";
import type { Room } from "./_held-room.ts";
import { leaks, memberWatching, openRoom, SECRET_HEAD, storedMemberBytes, textOf } from "./_held-room.ts";

const AFTER = "The story goes on.";

/** The room's newest reply as `principal` reads it. */
async function latestReply(room: Room, principal: Room["host"]): Promise<string> {
  const { messages } = await room.root.services.chat.listMessages({ principal, chatId: room.chatId });
  return messages.findLast((message) => message.role === "assistant")?.content ?? "";
}

test.each([
  ["an HTML-style close", `Opening. <lie character="Witness" truth="${SECRET_HEAD}"> ${AFTER}`],
  ["a newline between attrs", `Opening. <lie character="Witness"\n truth="${SECRET_HEAD}"/> ${AFTER}`],
  ["a newline before the first attr", `Opening. <lie\ntruth="${SECRET_HEAD}"/> ${AFTER}`],
])("%s stays hidden from a member, live, stored and on replay, and literal to the host and model", async (_name, body) => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "loose-member");
  try {
    room.answerWith(body);
    await room.send();
    await device.waitFor((frames) => frames.some(({ event }) => event.type === "turnCompleted"));
    expect(await leaks(room, device, guest)).toEqual([]);
    expect(await storedMemberBytes(room)).toBe("Opening. ");
    expect(textOf(device.frames)).toBe("Opening. ");
    expect(await latestReply(room, guest)).toBe("Opening. ");
    expect(await latestReply(room, room.host)).toBe(body);
    await room.root.services.chat.send({ principal: room.host, chatId: room.chatId, content: "Carry on." });
    expect(room.prompts().at(-1)).toContain(JSON.stringify(body).slice(1, -1));
  } finally {
    await device.close();
  }
});

test("prose that starts like a hidden tag reaches a member whole, live and committed", async () => {
  const body = "She will <lie down on the bed and rest.";
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "prose-member");
  try {
    room.answerWith(body);
    await room.send();
    await device.waitFor((frames) => frames.some(({ event }) => event.type === "turnCompleted"));
    expect(textOf(device.frames)).toBe(body);
    expect(await storedMemberBytes(room)).toBe(body);
    expect(await latestReply(room, guest)).toBe(body);
  } finally {
    await device.close();
  }
});
