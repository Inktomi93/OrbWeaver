// @subject packages/server/src/domain/chat/substrate/participants-humans.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
// A held pin names the player whose persona it is, through the real invite, pin and leave verbs.

import { expect, test } from "@orb/testkit/node";
import { invitePerson, personaRoom, seatPersona } from "../persona-cache-physical.ts";

const SHARED_NAME = "Ledgerkeeper";

test("a pin names no player while live, and names the player who left once it is held, even when two players share a persona name", async () => {
  await using h = await personaRoom([]);
  const { chat } = h.root.services;
  await seatPersona(h, h.owner, SHARED_NAME, "The host's own voice.");
  const bob = await invitePerson(h);
  const bobsPersona = await seatPersona(h, bob, SHARED_NAME, "A second player whose persona carries the same name.");
  const read = (): ReturnType<typeof chat.getChat> => chat.getChat({ principal: h.owner, chatId: h.chatId });

  expect((await read()).anchorOwnerHandle).toBeNull();
  await chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: bobsPersona.id });
  const live = await read();
  expect(live.anchorState).toBe("live");
  expect(live.anchorOwnerHandle).toBeNull();

  await chat.selfLeave({ principal: bob, chatId: h.chatId });
  const held = await read();
  expect(held.anchorState).toBe("held");
  expect(held.anchorPersonaId).toBe(bobsPersona.id);
  expect(held.anchorOwnerHandle).toBe(bob.handle);
  // The roster no longer carries the player, which is why the handle has to travel with the pin.
  expect(held.participants.map((seat) => seat.userId)).not.toContain(bob.userId);

  await chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: null });
  expect((await read()).anchorOwnerHandle).toBeNull();
});
