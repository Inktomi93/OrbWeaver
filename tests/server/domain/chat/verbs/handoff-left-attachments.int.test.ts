// @subject packages/server/src/domain/chat/verbs/participants.ts
// @subject packages/server/src/domain/world-info/persistence/handoff-copy-write.ts
// @subject packages/server/src/domain/regex/persistence/handoff-copy-write.ts
// @subject packages/server/src/domain/databank/persistence/handoff-detach.ts

// D64: a handoff leaves the room carrying only what the new host owns. The former host's chat-attached book,
// regex script and document are detached in the swap batch unless the offer copied them (documents are never
// copied), so nothing the former host edits or renames afterwards reaches the new host's prompt.

import type { DocumentId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES, ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import type { SentTurn } from "../handoff-attachments-physical.ts";
import {
  accept,
  attachRoomAttachments,
  attachRoomDocument,
  documentRoom,
  editAttachments,
  embedDocuments,
  handOff,
  nominate,
  roomDocuments,
  roomRack,
  seatOwnCard,
  sendTurn,
} from "../handoff-attachments-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";

const FORMER = { lore: "Former host lore ALPHA.", find: "hello", replace: "HELLO-FORMER" } as const;
const NEW_HOST = { lore: "New host lore BETA.", find: "there", replace: "THERE-NEW" } as const;
const SEATED_EDIT = { lore: "Rewritten while seated OMEGA.", replace: "HELLO-SEATED" } as const;
const DEPARTED_EDIT = { lore: "Rewritten after leaving SIGMA.", replace: "HELLO-DEPARTED" } as const;
const FORMER_DOCUMENT = { name: "Former shelf ALPHADOC", text: "The former host's document ALPHATEXT." } as const;
const NEW_HOST_DOCUMENT = { name: "New shelf BETADOC", text: "The new host's document BETATEXT." } as const;
const SEATED_RENAME = "Renamed while seated OMEGADOC";
const DEPARTED_RENAME = "Renamed after leaving SIGMADOC";
const MESSAGE = "hello there";

const FORMER_TEXT = [
  FORMER.lore,
  FORMER.replace,
  SEATED_EDIT.lore,
  SEATED_EDIT.replace,
  DEPARTED_EDIT.lore,
  DEPARTED_EDIT.replace,
  FORMER_DOCUMENT.name,
  FORMER_DOCUMENT.text,
  SEATED_RENAME,
  DEPARTED_RENAME,
];

function expectOnlyNewHostAttachments(turn: SentTurn): void {
  expect(turn.wire).toContain(NEW_HOST.lore);
  expect(turn.wire).toContain(NEW_HOST.replace);
  expect(turn.wire).toContain(NEW_HOST_DOCUMENT.text);
  for (const text of FORMER_TEXT) {
    expect(turn.wire).not.toContain(text);
    expect(turn.stored).not.toContain(text);
  }
}

async function rename(h: ChatRoot, owner: Awaited<ReturnType<typeof invitePerson>>, id: DocumentId, name: string): Promise<void> {
  await h.root.services.databank.rename({ signal: new AbortController().signal, principal: owner, id, name });
}

/** The rooms the owner's own document is attached to, as the owner's library reads them: the junction itself,
 *  which the room's panel no longer shows once the document's owner stops hosting. */
async function attachedRooms(h: ChatRoot, owner: Awaited<ReturnType<typeof invitePerson>>, id: DocumentId): Promise<readonly string[]> {
  return (await h.root.services.databank.listAttachments({ signal: new AbortController().signal, principal: owner, id })).chats.map((room) => room.id);
}

test("a handoff without copies detaches the former host's room book, script and document, and their later edits never reach the new host's turn", async () => {
  await using h = await documentRoom(["First reply.", "Second reply."]);
  const formerHost = h.owner;
  const left = await attachRoomAttachments(h, formerHost, FORMER);
  const leftDocument = await attachRoomDocument(h, formerHost, FORMER_DOCUMENT);
  expect(await attachedRooms(h, formerHost, leftDocument)).toEqual([h.chatId]);
  const newHost = await invitePerson(h);
  await handOff(h, newHost, false);
  expect(await attachedRooms(h, formerHost, leftDocument)).toEqual([]);
  await seatOwnCard(h, newHost);
  const own = await attachRoomAttachments(h, newHost, NEW_HOST);
  const ownDocument = await attachRoomDocument(h, newHost, NEW_HOST_DOCUMENT);
  await embedDocuments(h, newHost, [formerHost, newHost]);
  expect(await roomRack(h, newHost)).toEqual({ books: [own.bookId], scripts: [own.scriptId] });
  expect(await roomDocuments(h, newHost)).toEqual([ownDocument]);

  await editAttachments(h, formerHost, left, SEATED_EDIT);
  await rename(h, formerHost, leftDocument, SEATED_RENAME);
  await expect(h.root.services.worldInfo.attachToChat({ principal: formerHost, chatId: h.chatId, bookId: left.bookId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  await expect(h.root.services.regex.attachToChat({ principal: formerHost, chatId: h.chatId, scriptId: left.scriptId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  await expect(h.root.services.databank.attachToChat({ principal: formerHost, chatId: h.chatId, documentId: leftDocument })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  expectOnlyNewHostAttachments(await sendTurn(h, newHost, MESSAGE));

  await h.root.services.chat.selfLeave({ principal: formerHost, chatId: h.chatId });
  await editAttachments(h, formerHost, left, DEPARTED_EDIT);
  await rename(h, formerHost, leftDocument, DEPARTED_RENAME);
  await expect(h.root.services.worldInfo.attachToChat({ principal: formerHost, chatId: h.chatId, bookId: left.bookId })).rejects.toBeInstanceOf(
    ChatNotFoundError,
  );
  expectOnlyNewHostAttachments(await sendTurn(h, newHost, MESSAGE));
  expect(await roomRack(h, newHost)).toEqual({ books: [own.bookId], scripts: [own.scriptId] });
  expect(await roomDocuments(h, newHost)).toEqual([ownDocument]);
});

test("a handoff with copies re-points the room at the new host's copies, detaches the former host's document, and their edits change nothing", async () => {
  await using h = await documentRoom(["First reply.", "Second reply."]);
  const formerHost = h.owner;
  const originals = await attachRoomAttachments(h, formerHost, FORMER);
  const leftDocument = await attachRoomDocument(h, formerHost, FORMER_DOCUMENT);
  expect(await attachedRooms(h, formerHost, leftDocument)).toEqual([h.chatId]);
  const newHost = await invitePerson(h);
  await handOff(h, newHost, true);
  expect(await attachedRooms(h, formerHost, leftDocument)).toEqual([]);
  const ownDocument = await attachRoomDocument(h, newHost, NEW_HOST_DOCUMENT);
  await embedDocuments(h, newHost, [formerHost, newHost]);

  const rack = await roomRack(h, newHost);
  expect(rack.books).toHaveLength(1);
  expect(rack.scripts).toHaveLength(1);
  expect(rack.books).not.toContain(originals.bookId);
  expect(rack.scripts).not.toContain(originals.scriptId);
  expect(await roomDocuments(h, newHost)).toEqual([ownDocument]);
  const copied = await sendTurn(h, newHost, MESSAGE);
  expect(copied.wire).toContain(FORMER.lore);
  expect(copied.wire).toContain(FORMER.replace);
  expect(copied.wire).toContain(NEW_HOST_DOCUMENT.text);
  expect(copied.wire).not.toContain(FORMER_DOCUMENT.text);

  await editAttachments(h, formerHost, originals, SEATED_EDIT);
  await rename(h, formerHost, leftDocument, SEATED_RENAME);
  const afterEdit = await sendTurn(h, newHost, MESSAGE);
  expect(afterEdit.wire).toContain(FORMER.lore);
  expect(afterEdit.wire).toContain(FORMER.replace);
  for (const text of [SEATED_EDIT.lore, SEATED_EDIT.replace, FORMER_DOCUMENT.text, SEATED_RENAME]) {
    expect(afterEdit.wire).not.toContain(text);
    expect(afterEdit.stored).not.toContain(text);
  }
  expect(await roomRack(h, newHost)).toEqual(rack);
});

test("a host who leaves after nominating takes their room book, script and document with them when the nominee accepts", async () => {
  await using h = await documentRoom(["Only reply."]);
  const formerHost = h.owner;
  await attachRoomAttachments(h, formerHost, FORMER);
  const leftDocument = await attachRoomDocument(h, formerHost, FORMER_DOCUMENT);
  expect(await attachedRooms(h, formerHost, leftDocument)).toEqual([h.chatId]);
  const newHost = await invitePerson(h);
  await nominate(h, newHost, true);
  await h.root.services.chat.selfLeave({ principal: formerHost, chatId: h.chatId });
  await accept(h, newHost);
  expect(await roomRack(h, newHost)).toEqual({ books: [], scripts: [] });
  expect(await roomDocuments(h, newHost)).toEqual([]);

  await seatOwnCard(h, newHost);
  const own = await attachRoomAttachments(h, newHost, NEW_HOST);
  const ownDocument = await attachRoomDocument(h, newHost, NEW_HOST_DOCUMENT);
  await embedDocuments(h, newHost, [formerHost, newHost]);
  expect(await roomRack(h, newHost)).toEqual({ books: [own.bookId], scripts: [own.scriptId] });
  expect(await roomDocuments(h, newHost)).toEqual([ownDocument]);
  expectOnlyNewHostAttachments(await sendTurn(h, newHost, MESSAGE));

  // A library names a room only while its reader sits in it, so the former host rejoins to read the junction:
  // the accept detached the document even though its owner had already left.
  const invitation = await h.root.services.chat.createInvite({ principal: newHost, chatId: h.chatId, input: { invitedHandle: formerHost.handle } });
  await h.root.services.chat.acceptInvite({ principal: formerHost, inviteId: invitation.invite.id });
  expect(await attachedRooms(h, formerHost, leftDocument)).toEqual([]);
});
