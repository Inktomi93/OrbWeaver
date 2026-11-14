// A chat_books, chat_regex_scripts or chat_documents row owned by a former host, as a handoff that did not detach
// them left them, must apply nothing and be listed nowhere: the world-info pool, the regex resolver and the databank
// chat scope read a chat attachment only when the room's host owns it, and the member racks and the document panel
// list through the same owner check (D64). The rows are planted directly because no current write path leaves one
// behind.
// @subject packages/server/src/domain/chat/assembly/world-info/pool.ts
// @subject packages/server/src/domain/regex/persistence/resolve-sources.ts
// @subject packages/server/src/domain/world-info/verbs/attachments/list-for-chat.ts
// @subject packages/server/src/domain/regex/verbs/attachments/list-for-chat.ts
// @subject packages/server/src/domain/databank/persistence/scope.ts

import { chatBooks, chatDocuments, chatRegexScripts } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES, ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import type { RoomAttachments, SentTurn } from "../handoff-attachments-physical.ts";
import {
  attachRoomAttachments,
  attachRoomDocument,
  documentRoom,
  editAttachments,
  embedDocuments,
  handOff,
  roomDocuments,
  roomRack,
  seatOwnCard,
  sendTurn,
} from "../handoff-attachments-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";

const FORMER = { lore: "Stale room lore ALPHA.", find: "hello", replace: "HELLO-STALE" } as const;
const NEW_HOST = { lore: "Current host lore BETA.", find: "there", replace: "THERE-HOST" } as const;
const SEATED_EDIT = { lore: "Stale lore rewritten OMEGA.", replace: "HELLO-REWRITTEN" } as const;
const DEPARTED_EDIT = { lore: "Stale lore rewritten after leaving SIGMA.", replace: "HELLO-GONE" } as const;
const MESSAGE = "hello there";
// The new host's own script attaches first, so the stale row's position follows it.
const STALE_POSITION = 1;

type Room = ChatRoot;

/** Put back the former host's junction rows a handoff without the detach left in place. A source that still
 *  leaves them keeps its own rows, so the plant is a no-op there. */
async function plantStaleRows(h: Room, stale: RoomAttachments): Promise<void> {
  const at = h.root.clock.now();
  await h.root.db.insert(chatBooks).values({ chatId: h.chatId, worldBookId: stale.bookId, createdAt: at }).onConflictDoNothing();
  await h.root.db
    .insert(chatRegexScripts)
    .values({ chatId: h.chatId, regexScriptId: stale.scriptId, position: STALE_POSITION, createdAt: at })
    .onConflictDoNothing();
}

function expectOnlyHostAttachments(turn: SentTurn): void {
  expect(turn.wire).toContain(NEW_HOST.lore);
  expect(turn.wire).toContain(NEW_HOST.replace);
  for (const text of [FORMER.lore, FORMER.replace, SEATED_EDIT.lore, SEATED_EDIT.replace, DEPARTED_EDIT.lore, DEPARTED_EDIT.replace]) {
    expect(turn.wire).not.toContain(text);
    expect(turn.stored).not.toContain(text);
  }
}

test("a former host's book and script left attached are listed by neither rack and apply nothing to the new host's turn, however the former host edits them", async () => {
  await using h = await documentRoom(["First reply.", "Second reply."]);
  const formerHost = h.owner;
  const stale = await attachRoomAttachments(h, formerHost, FORMER);
  const newHost = await invitePerson(h);
  await handOff(h, newHost, false);
  await seatOwnCard(h, newHost);
  const own = await attachRoomAttachments(h, newHost, NEW_HOST);
  await plantStaleRows(h, stale);
  // The racks hide the row the room no longer applies; the new host's own attachment is the positive control.
  expect(await roomRack(h, newHost)).toEqual({ books: [own.bookId], scripts: [own.scriptId] });

  await editAttachments(h, formerHost, stale, SEATED_EDIT);
  await expect(h.root.services.regex.attachToChat({ principal: formerHost, chatId: h.chatId, scriptId: stale.scriptId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  expectOnlyHostAttachments(await sendTurn(h, newHost, MESSAGE));

  await h.root.services.chat.selfLeave({ principal: formerHost, chatId: h.chatId });
  await editAttachments(h, formerHost, stale, DEPARTED_EDIT);
  await expect(h.root.services.worldInfo.attachToChat({ principal: formerHost, chatId: h.chatId, bookId: stale.bookId })).rejects.toBeInstanceOf(
    ChatNotFoundError,
  );
  expectOnlyHostAttachments(await sendTurn(h, newHost, MESSAGE));
});

const STALE_DOCUMENT = { name: "Stale shelf ALPHADOC", text: "The stale document ALPHATEXT." } as const;
const HOST_DOCUMENT = { name: "Host shelf BETADOC", text: "The current host's document BETATEXT." } as const;
const STALE_RENAMES = ["Stale renamed while seated OMEGADOC", "Stale renamed after leaving SIGMADOC"] as const;

function expectOnlyHostDocument(turn: SentTurn): void {
  expect(turn.wire).toContain(HOST_DOCUMENT.text);
  for (const text of [STALE_DOCUMENT.name, STALE_DOCUMENT.text, ...STALE_RENAMES]) {
    expect(turn.wire).not.toContain(text);
  }
}

test("a former host's document left attached reaches neither the new host's panel nor their turn, however the former host renames it", async () => {
  await using h = await documentRoom(["First reply.", "Second reply."]);
  const formerHost = h.owner;
  const stale = await attachRoomDocument(h, formerHost, STALE_DOCUMENT);
  const newHost = await invitePerson(h);
  await handOff(h, newHost, false);
  await seatOwnCard(h, newHost);
  const own = await attachRoomDocument(h, newHost, HOST_DOCUMENT);
  await h.root.db.insert(chatDocuments).values({ chatId: h.chatId, documentId: stale }).onConflictDoNothing();
  await embedDocuments(h, newHost, [formerHost, newHost]);

  await h.root.services.databank.rename({ principal: formerHost, id: stale, name: STALE_RENAMES[0] });
  expectOnlyHostDocument(await sendTurn(h, newHost, MESSAGE));
  expect(await roomDocuments(h, newHost)).toEqual([own]);

  await h.root.services.chat.selfLeave({ principal: formerHost, chatId: h.chatId });
  await h.root.services.databank.rename({ principal: formerHost, id: stale, name: STALE_RENAMES[1] });
  await expect(h.root.services.databank.attachToChat({ principal: formerHost, chatId: h.chatId, documentId: stale })).rejects.toBeInstanceOf(ChatNotFoundError);
  expectOnlyHostDocument(await sendTurn(h, newHost, MESSAGE));
  expect(await roomDocuments(h, newHost)).toEqual([own]);
});
