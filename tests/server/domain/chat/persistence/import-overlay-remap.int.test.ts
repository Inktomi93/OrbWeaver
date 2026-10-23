// @subject packages/server/src/domain/chat/persistence/import-write.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts
// A re-import re-links the carried campaign onto the slot each anchor was exported from, whichever seq origin.
import { messages, messageVariants, rpgGames, rpgSnapshots } from "@orb/db";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { asc, eq } from "drizzle-orm";
import { importedSeqs, LEGACY_IMPORT_ARMS, renumberFromZero, textRoom } from "../scenario-physical.ts";

const LINES = ["The first line.", "The second line.", "The third line.", "The fourth line."] as const;
const sceneAfter = (line: string): string => `Scene after: ${line}`;

interface ImportedRoom {
  readonly chatId: ChatId;
  readonly slots: readonly MessageId[];
  readonly reimport: () => Promise<unknown>;
}

/** A live room whose campaign stamps one hand snapshot after each line, exported and imported once. The imported
 *  room's campaign is then dropped, the state of a room whose first import restored none, so a re-import re-links. */
async function importedRoom(h: ChatRoot, legacy: boolean): Promise<ImportedRoom> {
  await h.root.services.rpg.createGame({ principal: h.owner, chatId: h.chatId, mode: "lite" });
  for (const line of LINES) {
    await h.caller.chat.commitMessage({ chatId: h.chatId, timeZone: UTC_TIME_ZONE, content: line });
    expect(await h.root.services.rpg.editSnapshot({ principal: h.owner, chatId: h.chatId, patch: { location: sceneAfter(line) } })).toEqual({ ok: true });
  }
  const exported = await h.root.app.exportService.exportChatBundle({ principal: h.owner, chatId: h.chatId });
  const descriptor = h.root.app.portability.find((entity) => entity.kind === "chat");
  if (exported === null || descriptor === undefined) {
    throw new Error("the production graph produced no chat bundle or chat descriptor");
  }
  const file = { filename: exported.filename, bytes: exported.bytes };
  expect(await descriptor.importFile(h.owner.userId, file)).toMatchObject({ ok: true, created: true });
  const rooms = await h.root.db.selectDistinct({ chatId: messages.chatId }).from(messages);
  const chatId = rooms.map((row) => row.chatId).find((id) => id !== h.chatId);
  if (chatId === undefined) {
    throw new Error("the production import landed no room");
  }
  expect(await anchoredLines(h, chatId)).toEqual(LINES.map((line) => ({ location: sceneAfter(line), line })));
  await h.root.db.delete(rpgGames).where(eq(rpgGames.chatId, chatId));
  if (legacy) {
    await renumberFromZero(h, chatId);
  }
  expect(await importedSeqs(h, chatId)).toEqual(legacy ? [0, 1, 2, 3] : [1, 2, 3, 4]);
  const slots = await h.root.db.select({ id: messages.id }).from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
  return { chatId, slots: slots.map((slot) => slot.id), reimport: () => descriptor.importFile(h.owner.userId, file) };
}

/** Each scene-bearing snapshot of the room's campaign and the line of the slot it is stamped as of (null when its
 *  as-of slot is gone), in campaign order. */
async function anchoredLines(h: ChatRoot, chatId: ChatId): Promise<readonly { readonly location: string; readonly line: string | null }[]> {
  const rows = await h.root.db
    .select({ location: rpgSnapshots.location, line: messageVariants.content })
    .from(rpgSnapshots)
    .innerJoin(rpgGames, eq(rpgGames.id, rpgSnapshots.gameId))
    .leftJoin(messages, eq(messages.id, rpgSnapshots.asOfMessageId))
    .leftJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(rpgGames.chatId, chatId))
    .orderBy(asc(rpgSnapshots.createdAt), asc(rpgSnapshots.id));
  return rows.flatMap((row) => (row.location.startsWith(sceneAfter("")) ? [{ location: row.location, line: row.line }] : []));
}

function slotAt(room: ImportedRoom, index: number): MessageId {
  const id = room.slots[index];
  if (id === undefined) {
    throw new Error(`the imported room has no slot ${index}`);
  }
  return id;
}

test.for(LEGACY_IMPORT_ARMS)("$title: a re-import after a deleted slot re-links each snapshot to the slot it was exported from", async ({ legacy }) => {
  await using h = await textRoom([]);
  const room = await importedRoom(h, legacy);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: room.chatId, messageIds: [slotAt(room, 1)] });

  expect(await room.reimport()).toEqual({ ok: true, created: false });
  expect(await anchoredLines(h, room.chatId)).toEqual(LINES.map((line, index) => ({ location: sceneAfter(line), line: index === 1 ? null : line })));
});

// Guessing an origin here would stamp every scene one slot off.
test.for(LEGACY_IMPORT_ARMS)("$title: a room that lost both origin proofs refuses the campaign re-link and writes no overlay", async ({ legacy }) => {
  await using h = await textRoom([]);
  const room = await importedRoom(h, legacy);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: room.chatId, messageIds: [slotAt(room, 0), slotAt(room, LINES.length - 1)] });

  expect(await room.reimport()).toEqual({ ok: true, created: false, notes: [expect.any(String)] });
  expect(await h.root.db.select({ id: rpgGames.id }).from(rpgGames).where(eq(rpgGames.chatId, room.chatId))).toEqual([]);
});

// A legacy room's next live slot reuses the deleted last import seq; pairing it would stamp the last scene on it.
test("a live slot written into a deleted import seq takes no carried snapshot", async () => {
  await using h = await textRoom([]);
  const room = await importedRoom(h, true);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: room.chatId, messageIds: [slotAt(room, LINES.length - 1)] });
  await h.caller.chat.commitMessage({ chatId: room.chatId, timeZone: UTC_TIME_ZONE, content: "A live line." });
  expect(await importedSeqs(h, room.chatId)).toEqual([0, 1, 2, 3]);

  expect(await room.reimport()).toEqual({ ok: true, created: false });
  expect(await anchoredLines(h, room.chatId)).toEqual(
    LINES.map((line, index) => ({ location: sceneAfter(line), line: index === LINES.length - 1 ? null : line })),
  );
});
