// @subject packages/server/src/domain/chat/persistence/import-write.ts
// A re-import heals each user slot's persona on the slot the first import wrote, whichever seq origin it used.
import { createPersonaSchema } from "@orb/contracts/persona";
import { messages } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { buildChatBundleFile, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { expect, test } from "@orb/testkit/node";
import { asc, eq } from "drizzle-orm";
import { importedSeqs, LEGACY_IMPORT_ARMS, renumberFromZero, textRoom } from "../scenario-physical.ts";

const PERSONA = "Lantern Wanderer";
const LINES = ["The first line the wanderer wrote.", "The second line the wanderer wrote."];

test.for(LEGACY_IMPORT_ARMS)("$title: a re-import attributes every user slot to the persona it now resolves", async ({ legacy }) => {
  await using h = await textRoom([]);
  for (const content of LINES) {
    await h.caller.chat.commitMessage({ chatId: h.chatId, timeZone: UTC_TIME_ZONE, content });
  }
  const exported = await h.root.app.exportService.exportChatBundle({ principal: h.owner, chatId: h.chatId });
  const descriptor = h.root.app.portability.find((entity) => entity.kind === "chat");
  if (exported === null || descriptor === undefined) {
    throw new Error("the production graph produced no chat bundle or chat descriptor");
  }
  const parsed = parseChatBundleFile(exported.bytes);
  if (!parsed.ok) {
    throw new Error(`the production exporter wrote an unreadable bundle: ${parsed.reason}`);
  }
  // The bundle names a persona this account does not hold yet, so the first import lands every slot unattributed.
  const file = {
    filename: exported.filename,
    bytes: buildChatBundleFile({
      ...parsed.value,
      anchorPersonaName: PERSONA,
      messages: parsed.value.messages.map((m) => (m.role === "user" ? { ...m, personaName: PERSONA } : m)),
    }),
  };
  expect(await descriptor.importFile(h.owner.userId, file)).toMatchObject({ ok: true, created: true });
  const rooms = await h.root.db.selectDistinct({ chatId: messages.chatId }).from(messages);
  const chatId = rooms.map((row) => row.chatId).find((id) => id !== h.chatId);
  if (chatId === undefined) {
    throw new Error("the production import landed no room");
  }
  if (legacy) {
    await renumberFromZero(h, chatId);
  }
  const persona = await h.root.services.persona.create({
    principal: h.owner,
    input: createPersonaSchema.parse({ name: PERSONA, description: "Carries a lantern." }),
  });

  expect(await descriptor.importFile(h.owner.userId, file)).toMatchObject({ ok: true, created: false });
  const slots = await h.root.db
    .select({ role: messages.role, personaId: messages.personaId })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
  expect(slots).toEqual(LINES.map(() => ({ role: "user", personaId: persona.id })));
  expect(await importedSeqs(h, chatId)).toEqual(legacy ? [0, 1] : [1, 2]);
});
