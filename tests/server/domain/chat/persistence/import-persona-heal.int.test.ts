// @subject packages/server/src/domain/chat/persistence/import-write.ts
// A re-import heals each user slot's persona on the slot the first import wrote, whichever seq origin it used.
import { createPersonaSchema } from "@orb/contracts/persona";
import { chats, messages } from "@orb/db";
import type { ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { buildChatBundleFile, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { plantLegacyZeroCanon } from "@orb/testkit/node/composed";
import { and, asc, eq } from "drizzle-orm";
import { importedSeqs, LEGACY_IMPORT_ARMS, textRoom } from "../scenario-physical.ts";

const LINES = [
  { text: "The first line the wanderer wrote.", persona: "Lantern Wanderer" },
  { text: "The second line the keeper wrote.", persona: "River Keeper" },
] as const;
const REPLY = "The character answers the wanderer.";

interface ImportedRoom {
  readonly h: ChatRoot;
  readonly chatId: ChatId;
  readonly reimport: () => Promise<unknown>;
}

/** A live room exported, its user lines renamed to personas this account lacks, and imported once, so every
 *  user slot lands unattributed. `replyAfterFirst` orders it [user, assistant, user], else [user, user, assistant]. */
async function importedRoom(h: ChatRoot, legacy: boolean, replyAfterFirst: boolean): Promise<ImportedRoom> {
  const [first] = LINES;
  const repliedLine = replyAfterFirst ? 0 : LINES.length - 1;
  const aborted: boolean[] = [];
  for (const [index, line] of LINES.entries()) {
    if (index === repliedLine) {
      aborted.push((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: line.text })).aborted);
    } else {
      await h.caller.chat.commitMessage({ chatId: h.chatId, timeZone: UTC_TIME_ZONE, content: line.text });
    }
  }
  expect(aborted).toEqual([false]);
  const exported = await h.root.app.exportService.exportChatBundle({ principal: h.owner, chatId: h.chatId });
  const descriptor = h.root.app.portability.find((entity) => entity.kind === "chat");
  if (exported === null || descriptor === undefined) {
    throw new Error("the production graph produced no chat bundle or chat descriptor");
  }
  const parsed = parseChatBundleFile(exported.bytes);
  if (!parsed.ok) {
    throw new Error(`the production exporter wrote an unreadable bundle: ${parsed.reason}`);
  }
  const userLines = parsed.value.messages.filter((m) => m.role === "user");
  expect(userLines).toHaveLength(LINES.length);
  const file = {
    filename: exported.filename,
    bytes: buildChatBundleFile({
      ...parsed.value,
      anchorPersonaName: first.persona,
      messages: parsed.value.messages.map((m) => (m.role === "user" ? { ...m, personaName: LINES[userLines.indexOf(m)]?.persona ?? null } : m)),
    }),
  };
  expect(await descriptor.importFile(h.owner.userId, file)).toMatchObject({ ok: true, created: true });
  const rooms = await h.root.db.selectDistinct({ chatId: messages.chatId }).from(messages);
  const chatId = rooms.map((row) => row.chatId).find((id) => id !== h.chatId);
  if (chatId === undefined) {
    throw new Error("the production import landed no room");
  }
  if (legacy) {
    await plantLegacyZeroCanon(h.root, chatId);
  }
  expect(await importedSeqs(h, chatId)).toEqual(legacy ? [0, 1, 2] : [1, 2, 3]);
  return { h, chatId, reimport: () => descriptor.importFile(h.owner.userId, file) };
}

async function createPersonas(h: ChatRoot): Promise<readonly PersonaId[]> {
  const ids: PersonaId[] = [];
  for (const line of LINES) {
    ids.push(
      (await h.root.services.persona.create({ principal: h.owner, input: createPersonaSchema.parse({ name: line.persona, description: "Imported." }) })).id,
    );
  }
  return ids;
}

async function slotAt(room: ImportedRoom, role: "user" | "assistant", nth: number): Promise<MessageId> {
  const rows = await room.h.root.db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.chatId, room.chatId), eq(messages.role, role)))
    .orderBy(asc(messages.seq));
  const row = rows[nth];
  if (row === undefined) {
    throw new Error(`the imported room has no ${role} slot ${nth}`);
  }
  return row.id;
}

async function userPersonas(room: ImportedRoom): Promise<readonly (PersonaId | null)[]> {
  const rows = await room.h.root.db
    .select({ personaId: messages.personaId })
    .from(messages)
    .where(and(eq(messages.chatId, room.chatId), eq(messages.role, "user")))
    .orderBy(asc(messages.seq));
  return rows.map((row) => row.personaId);
}

test.for(LEGACY_IMPORT_ARMS)("$title: a re-import after a deleted slot heals each user slot with its own persona", async ({ legacy }) => {
  await using h = await textRoom([REPLY]);
  const room = await importedRoom(h, legacy, true);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: room.chatId, messageIds: [await slotAt(room, "assistant", 0)] });
  const personas = await createPersonas(h);

  expect(await room.reimport()).toMatchObject({ ok: true, created: false });
  expect(await userPersonas(room)).toEqual(personas);
});

// Guessing the current origin here would write the first line's persona onto the second line's slot.
test("a legacy room that lost its seq-0 slot heals its pin but no slot, because its origin is unproven", async () => {
  await using h = await textRoom([REPLY]);
  const room = await importedRoom(h, true, false);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: room.chatId, messageIds: [await slotAt(room, "user", 0)] });
  const [anchor] = await createPersonas(h);

  expect(await room.reimport()).toMatchObject({ ok: true, created: false });
  expect(await userPersonas(room)).toEqual([null]);
  expect(await h.root.db.select({ anchorPersonaId: chats.anchorPersonaId }).from(chats).where(eq(chats.id, room.chatId)).get()).toEqual({
    anchorPersonaId: anchor,
  });
});
