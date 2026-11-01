// A member's impersonation draft is model text on its own stream: it runs the member strip, and the host's stays verbatim.
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts

import { expect, test } from "@orb/testkit/node";
import type { Room } from "./_held-room.ts";
import { admit, openRoom, SECRET_HEAD, SECRET_TAIL } from "./_held-room.ts";

const CLOSED_SPAN = `<lie character="Witness" truth="${SECRET_HEAD}"/>`;
const OPEN_SPAN = `<lie character="Witness" truth="${SECRET_TAIL}`;
const DRAFT = `I nod. ${CLOSED_SPAN}I wait. ${OPEN_SPAN}`;

async function draftFor(room: Room, principal: Room["host"]): Promise<string> {
  const deltas: string[] = [];
  for await (const { delta } of room.root.services.chat.impersonateStream({ principal, chatId: room.chatId })) {
    deltas.push(delta);
  }
  return deltas.join("");
}

test("a member's impersonation draft holds no hidden bytes; the host's draft is verbatim", async () => {
  await using room = await openRoom();
  const seat = await admit(room, "draft-member");
  room.answerWith(DRAFT);
  expect(await draftFor(room, await room.root.principalFor(seat.id))).toBe("I nod. I wait. ");
  expect(await draftFor(room, room.host)).toBe(DRAFT);
});
