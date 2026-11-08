// @subject packages/server/src/domain/chat/verbs/invites.ts
// The host's invite list names who a targeted invite is for, and a share link names no one, through the real invite verbs.

import { expect, test } from "@orb/testkit/node";
import { personaRoom } from "../persona-cache-physical.ts";

test("a targeted invite carries its target's handle at creation and in the list, and a share link carries none", async () => {
  await using h = await personaRoom([]);
  const { chat } = h.root.services;
  const person = await h.root.principalFor((await h.root.actor()).id);

  const targeted = await chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: person.handle } });
  const shared = await chat.createInvite({ principal: h.owner, chatId: h.chatId, input: {} });
  expect(targeted.invite.invitedHandle).toBe(person.handle);
  expect(shared.invite.invitedHandle).toBeNull();

  const listed = await chat.listInvites({ principal: h.owner, chatId: h.chatId });
  expect(listed.find((invite) => invite.id === targeted.invite.id)?.invitedHandle).toBe(person.handle);
  expect(listed.find((invite) => invite.id === shared.invite.id)?.invitedHandle).toBeNull();
});
