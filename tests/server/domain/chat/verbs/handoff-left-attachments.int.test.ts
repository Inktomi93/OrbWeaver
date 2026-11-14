// @subject packages/server/src/domain/chat/verbs/participants.ts
// @subject packages/server/src/domain/world-info/persistence/handoff-copy-write.ts
// @subject packages/server/src/domain/regex/persistence/handoff-copy-write.ts

// D64: a handoff leaves the room carrying only what the new host owns. The former host's chat-attached book and
// regex script are detached in the swap batch unless the offer copied them, so nothing the former host edits
// afterwards reaches the new host's prompt or transforms their text.

import { expect, test } from "@orb/testkit/node";
import { CHAT_OP_CODES, ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import type { SentTurn } from "../handoff-attachments-physical.ts";
import { accept, attachRoomAttachments, editAttachments, handOff, nominate, roomRack, seatOwnCard, sendTurn } from "../handoff-attachments-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

const FORMER = { lore: "Former host lore ALPHA.", find: "hello", replace: "HELLO-FORMER" } as const;
const NEW_HOST = { lore: "New host lore BETA.", find: "there", replace: "THERE-NEW" } as const;
const SEATED_EDIT = { lore: "Rewritten while seated OMEGA.", replace: "HELLO-SEATED" } as const;
const DEPARTED_EDIT = { lore: "Rewritten after leaving SIGMA.", replace: "HELLO-DEPARTED" } as const;
const MESSAGE = "hello there";

const FORMER_TEXT = [FORMER.lore, FORMER.replace, SEATED_EDIT.lore, SEATED_EDIT.replace, DEPARTED_EDIT.lore, DEPARTED_EDIT.replace];

function expectOnlyNewHostAttachments(turn: SentTurn): void {
  expect(turn.wire).toContain(NEW_HOST.lore);
  expect(turn.wire).toContain(NEW_HOST.replace);
  for (const text of FORMER_TEXT) {
    expect(turn.wire).not.toContain(text);
    expect(turn.stored).not.toContain(text);
  }
}

test("a handoff without copies detaches the former host's room book and script, and their later edits never reach the new host's turn", async () => {
  await using h = await textRoom(["First reply.", "Second reply."]);
  const formerHost = h.owner;
  const left = await attachRoomAttachments(h, formerHost, FORMER);
  const newHost = await invitePerson(h);
  await handOff(h, newHost, false);
  await seatOwnCard(h, newHost);
  const own = await attachRoomAttachments(h, newHost, NEW_HOST);
  expect(await roomRack(h, newHost)).toEqual({ books: [own.bookId], scripts: [own.scriptId] });

  await editAttachments(h, formerHost, left, SEATED_EDIT);
  await expect(h.root.services.worldInfo.attachToChat({ principal: formerHost, chatId: h.chatId, bookId: left.bookId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  await expect(h.root.services.regex.attachToChat({ principal: formerHost, chatId: h.chatId, scriptId: left.scriptId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  expectOnlyNewHostAttachments(await sendTurn(h, newHost, MESSAGE));

  await h.root.services.chat.selfLeave({ principal: formerHost, chatId: h.chatId });
  await editAttachments(h, formerHost, left, DEPARTED_EDIT);
  await expect(h.root.services.worldInfo.attachToChat({ principal: formerHost, chatId: h.chatId, bookId: left.bookId })).rejects.toBeInstanceOf(
    ChatNotFoundError,
  );
  expectOnlyNewHostAttachments(await sendTurn(h, newHost, MESSAGE));
  expect(await roomRack(h, newHost)).toEqual({ books: [own.bookId], scripts: [own.scriptId] });
});

test("a handoff with copies re-points the room at the new host's copies, and the former host editing the originals changes nothing", async () => {
  await using h = await textRoom(["First reply.", "Second reply."]);
  const formerHost = h.owner;
  const originals = await attachRoomAttachments(h, formerHost, FORMER);
  const newHost = await invitePerson(h);
  await handOff(h, newHost, true);

  const rack = await roomRack(h, newHost);
  expect(rack.books).toHaveLength(1);
  expect(rack.scripts).toHaveLength(1);
  expect(rack.books).not.toContain(originals.bookId);
  expect(rack.scripts).not.toContain(originals.scriptId);
  const copied = await sendTurn(h, newHost, MESSAGE);
  expect(copied.wire).toContain(FORMER.lore);
  expect(copied.wire).toContain(FORMER.replace);

  await editAttachments(h, formerHost, originals, SEATED_EDIT);
  const afterEdit = await sendTurn(h, newHost, MESSAGE);
  expect(afterEdit.wire).toContain(FORMER.lore);
  expect(afterEdit.wire).toContain(FORMER.replace);
  for (const text of [SEATED_EDIT.lore, SEATED_EDIT.replace]) {
    expect(afterEdit.wire).not.toContain(text);
    expect(afterEdit.stored).not.toContain(text);
  }
  expect(await roomRack(h, newHost)).toEqual(rack);
});

test("a host who leaves after nominating takes their room book and script with them when the nominee accepts", async () => {
  await using h = await textRoom(["Only reply."]);
  const formerHost = h.owner;
  await attachRoomAttachments(h, formerHost, FORMER);
  const newHost = await invitePerson(h);
  await nominate(h, newHost, true);
  await h.root.services.chat.selfLeave({ principal: formerHost, chatId: h.chatId });
  await accept(h, newHost);
  expect(await roomRack(h, newHost)).toEqual({ books: [], scripts: [] });

  await seatOwnCard(h, newHost);
  const own = await attachRoomAttachments(h, newHost, NEW_HOST);
  expect(await roomRack(h, newHost)).toEqual({ books: [own.bookId], scripts: [own.scriptId] });
  expectOnlyNewHostAttachments(await sendTurn(h, newHost, MESSAGE));
});
