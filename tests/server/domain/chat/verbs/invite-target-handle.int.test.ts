// @subject packages/server/src/domain/chat/verbs/invites.ts
// The host's invite list names who a targeted invite is for, and a share link names no one, through the real invite verbs.

import { expect, test } from "@orb/testkit/node";
import { freshCountedDb } from "@orb/testkit/node/composed";
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

test("the invite list resolves every target's handle in one read, however many invites the room has sent", async () => {
  using counted = await freshCountedDb();
  await using h = await personaRoom([], { db: counted.db });
  const { chat } = h.root.services;
  const people = await Promise.all([0, 1, 2, 3].map(async () => await h.root.principalFor((await h.root.actor()).id)));
  const created: Awaited<ReturnType<typeof chat.createInvite>>[] = [];
  for (const person of people) {
    created.push(await chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: person.handle } }));
  }
  await chat.createInvite({ principal: h.owner, chatId: h.chatId, input: {} });

  counted.queries.reset();
  const listed = await chat.listInvites({ principal: h.owner, chatId: h.chatId });

  expect(listed.filter((invite) => invite.invitedHandle !== null)).toHaveLength(people.length);
  for (const [index, person] of people.entries()) {
    expect(listed.find((invite) => invite.id === created[index]?.invite.id)?.invitedHandle).toBe(person.handle);
  }
  const userReads = counted.queries.statements().filter((statement) => statement.includes('from "users"'));
  expect(userReads, counted.queries.statements().join("\n")).toHaveLength(1);
  expect(counted.queries.statements().filter((statement) => statement.includes("user_settings"))).toHaveLength(0);
});
