// A chat_books and a chat_regex_scripts row owned by a former host, as a handoff that did not detach them left
// them, must apply nothing: the world-info pool and the regex resolver read a chat attachment only when the room's
// host owns it (D64). The rows are planted directly because no current write path leaves one behind.
// @subject packages/server/src/domain/chat/assembly/world-info/pool.ts
// @subject packages/server/src/domain/regex/persistence/resolve-sources.ts

import { chatBooks, chatRegexScripts } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { CHAT_OP_CODES, ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import type { RoomAttachments, SentTurn } from "../handoff-attachments-physical.ts";
import { attachRoomAttachments, editAttachments, handOff, roomRack, seatOwnCard, sendTurn } from "../handoff-attachments-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

const FORMER = { lore: "Stale room lore ALPHA.", find: "hello", replace: "HELLO-STALE" } as const;
const NEW_HOST = { lore: "Current host lore BETA.", find: "there", replace: "THERE-HOST" } as const;
const SEATED_EDIT = { lore: "Stale lore rewritten OMEGA.", replace: "HELLO-REWRITTEN" } as const;
const DEPARTED_EDIT = { lore: "Stale lore rewritten after leaving SIGMA.", replace: "HELLO-GONE" } as const;
const MESSAGE = "hello there";
// The new host's own script attaches first, so the stale row's position follows it.
const STALE_POSITION = 1;

type Room = Awaited<ReturnType<typeof textRoom>>;

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

test("a former host's book and script left attached apply nothing to the new host's turn, however the former host edits them", async () => {
  await using h = await textRoom(["First reply.", "Second reply."]);
  const formerHost = h.owner;
  const stale = await attachRoomAttachments(h, formerHost, FORMER);
  const newHost = await invitePerson(h);
  await handOff(h, newHost, false);
  await seatOwnCard(h, newHost);
  const own = await attachRoomAttachments(h, newHost, NEW_HOST);
  await plantStaleRows(h, stale);
  const rack = await roomRack(h, newHost);
  expect(rack.books).toEqual(expect.arrayContaining([stale.bookId, own.bookId]));
  expect(rack.scripts).toEqual(expect.arrayContaining([stale.scriptId, own.scriptId]));

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
