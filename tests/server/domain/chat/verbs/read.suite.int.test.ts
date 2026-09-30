import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chatParticipants, chats, messageVariants } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTurnPersonaResolver } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read.ts";
import { loadPersonasForOwners } from "../../../../../packages/server/src/domain/persona/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal } from "../../../../support/factories/principal.ts";
import { makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, makeLoadParticipantViews, seedCharacter, seedChat, seedMessage, seedParticipant, seedPersona, seedUser } from "../_support.ts";

function reader(db: Db): ReturnType<typeof createRead> {
  const resolvePersonas = createTurnPersonaResolver(async ({ personaIds, allowedOwnerIds }) => {
    const rows = await loadPersonasForOwners(db, [...new Set(personaIds)], [...new Set(allowedOwnerIds)]);
    return new Map(rows.map((row) => [row.id, row]));
  });
  return createRead(makeChatContext(db), {
    loadParticipantViews: makeLoadParticipantViews(db),
    resolveConnection: () => Promise.resolve(makeResolved()),
    checkSendAvailability: () => Promise.resolve({ available: true }),
    getNextTurnConnection: () => Promise.resolve({ state: "unset" }),
    resolveForeignInputs: async (args) => ({
      promptConfig: DEFAULT_PROMPT_CONFIG,
      personas: await resolvePersonas(args),
      scanDepth: 6,
      injectionTokenBudget: 0,
    }),
  });
}

test("greeting previews resolve against the room anchor for every viewer, re-pin on read, and preserve raw canon", async () => {
  const db = await freshDb();
  const host = await seedUser(db, castId<Handle>("host"));
  const member = await seedUser(db, castId<Handle>("member"));
  const anchor = await seedPersona(db, host, "Nyx");
  const replacement = await seedPersona(db, member, "Mara");
  const character = await seedCharacter(db, host, "Aria");
  const chatId = await seedChat(db, "greeting-preview", { anchorPersonaId: anchor });
  await seedParticipant(db, { chatId, key: "greeting-host", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "greeting-member", userId: member, activePersonaId: replacement });
  await seedParticipant(db, { chatId, key: "greeting-character", characterId: character });
  const raw = '{{char}} greets {{user}}. {{roll:1d6}} <lie truth="secret"/> ';
  const { variantId } = await seedMessage(db, chatId, 1, { characterId: character, content: raw });
  const read = reader(db);
  for (const userId of [host, member]) {
    const page = await read.listChats({ principal: principal(userId) });
    expect(page.items[0]?.lastMessagePreview).toBe("Aria greets Nyx. {{roll:1d6}}");
  }
  await db.update(chats).set({ anchorPersonaId: replacement }).where(eq(chats.id, chatId));
  expect((await read.listChats({ principal: principal(host) })).items[0]?.lastMessagePreview).toBe("Aria greets Mara. {{roll:1d6}}");
  const stored = await db.select({ content: messageVariants.content }).from(messageVariants).where(eq(messageVariants.id, variantId));
  expect(stored).toEqual([{ content: raw }]);
});

test("summary reads resolve departed speakers and authoring personas from row stamps, with fork and lineage parity", async () => {
  const db = await freshDb();
  const host = await seedUser(db, castId<Handle>("host"));
  const oldPersona = await seedPersona(db, host, "OldPersona");
  const anchor = await seedPersona(db, host, "NewPersona");
  const character = await seedCharacter(db, host, "Departed");
  const parent = await seedChat(db, "preview-parent", { anchorPersonaId: anchor });
  const child = await seedChat(db, "preview-child", { parentChatId: parent, anchorPersonaId: anchor });
  for (const chatId of [parent, child]) {
    await seedParticipant(db, { chatId, key: `${chatId}-host`, userId: host, role: "host", activePersonaId: anchor });
    await seedMessage(db, chatId, 1, { characterId: character, content: "{{char}} remembers {{user}}" });
  }
  const read = reader(db);
  const expected = "Departed remembers NewPersona";
  expect((await read.listChats({ principal: principal(host) })).items.map((row) => row.lastMessagePreview)).toEqual([expected, expected]);
  expect((await read.listForks({ principal: principal(host), chatId: parent })).map((row) => row.lastMessagePreview)).toEqual([expected]);
  expect((await read.getChatLineage({ principal: principal(host), chatId: child })).chain.map((row) => row.lastMessagePreview)).toEqual([expected, expected]);
  await seedMessage(db, child, 2, { role: "user", authorUserId: host, personaId: oldPersona, content: "{{user}} remembers" });
  expect((await read.listForks({ principal: principal(host), chatId: parent }))[0]?.lastMessagePreview).toBe("OldPersona remembers");
});

test("macro previews keep the viewer history floor and strip hidden content introduced by a persona description", async () => {
  const db = await freshDb();
  const host = await seedUser(db, castId<Handle>("host"));
  const member = await seedUser(db, castId<Handle>("member"));
  const anchor = await seedPersona(db, host, "Anchor", { description: 'visible <lie truth="secret"/>' });
  const chatId = await seedChat(db, "preview-floor", { anchorPersonaId: anchor });
  await seedParticipant(db, { chatId, key: "floor-host", userId: host, role: "host" });
  const membershipId = await seedParticipant(db, { chatId, key: "floor-member", userId: member, joinSeq: 2, joinHistoryVisibility: "from-join" });
  await seedMessage(db, chatId, 1, { content: "{{persona}}" });
  const read = reader(db);
  expect((await read.listChats({ principal: principal(member) })).items[0]?.lastMessagePreview).toBeNull();
  expect((await read.listChats({ principal: principal(host) })).items[0]?.lastMessagePreview).toBe("visible");
  await db.update(chatParticipants).set({ joinHistoryVisibility: "full" }).where(eq(chatParticipants.id, membershipId));
  expect((await read.listChats({ principal: principal(member) })).items[0]?.lastMessagePreview).toBe("visible");
});
