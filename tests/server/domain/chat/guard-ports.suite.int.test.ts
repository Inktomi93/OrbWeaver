// Composed consumers share chat's admission ports; refused mutations preserve the room's production reads.
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createBookSchema } from "@orb/contracts/world-info";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainNotFoundError } from "@orb/kit/errors";
import { ID_PREFIX } from "@orb/kit/ids";
import { createWiredChatGuards } from "@orb/server/domain/chat";
import { forged } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { can } from "@orb/testkit/node/auth";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";

test("wired admission ports retain undefined success, fresh membership and synchronous invalid-handle refusal", async ({ harness }) => {
  const host = await harness.principalFor(harness.ownerId);
  const { chat } = await harness.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  const guards = createWiredChatGuards({ db: databaseHandle(harness.db), can });
  await expect(guards.requireHost(host, chat.id)).resolves.toBeUndefined();
  await expect(guards.requireParticipant(host, chat.id)).resolves.toBeUndefined();

  const invalid = createWiredChatGuards({ db: forged<DatabaseHandle>({}), can });
  expect(() => invalid.requireHost(host, chat.id)).toThrow("database wiring handle is not registered");
  expect(() => invalid.requireParticipant(host, chat.id)).toThrow("database wiring handle is not registered");

  await harness.services.chat.selfLeave({ principal: host, chatId: chat.id });
  await expect(guards.requireHost(host, chat.id)).rejects.toThrow(DomainNotFoundError);
  await expect(guards.requireParticipant(host, chat.id)).rejects.toThrow(DomainNotFoundError);
});

test("composed host and member ports preserve room authority and leak-free refusal across library and tag consumers", async () => {
  await using root = await createServerHarness({
    startJobs: false,
    env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" },
  });
  const host = await root.principalFor(root.ownerId);
  const member = await root.principalFor((await root.actor()).id);
  const departed = await root.principalFor((await root.actor()).id);
  const stranger = await root.principalFor((await root.actor()).id);
  const admin = await root.principalFor((await root.actor({ role: "admin" })).id);
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [], opening: "none" });
  for (const principal of [member, departed]) {
    const invitation = await root.services.chat.createInvite({ principal: host, chatId: chat.id, input: { invitedHandle: principal.handle } });
    await root.services.chat.acceptInvite({ principal, inviteId: invitation.invite.id });
  }
  await root.services.chat.selfLeave({ principal: departed, chatId: chat.id });
  const script = await root.services.regex.createScript({
    principal: host,
    input: createRegexScriptSchema.parse({ name: "Guard script", findRegex: "needle", replaceString: "replacement", placement: [] }),
  });
  const book = await root.services.worldInfo.createBook({ principal: host, input: createBookSchema.parse({ name: "Guard book" }) });
  const { document } = await root.services.databank.createFromText({ principal: host, name: "Guard document", text: "Room-visible guard witness." });
  for (const attach of [
    (): Promise<void> => root.services.regex.attachToChat({ principal: host, chatId: chat.id, scriptId: script.id }),
    (): Promise<void> => root.services.worldInfo.attachToChat({ principal: host, chatId: chat.id, bookId: book.id }),
    (): Promise<void> => root.services.databank.attachToChat({ principal: host, chatId: chat.id, documentId: document.id }),
  ]) {
    await attach();
  }
  const readRoom = async (): Promise<{
    readonly scripts: Awaited<ReturnType<typeof root.services.regex.listForChat>>;
    readonly books: Awaited<ReturnType<typeof root.services.worldInfo.listForChat>>;
    readonly documents: Awaited<ReturnType<typeof root.services.databank.listActiveForChat>>;
  }> => ({
    scripts: await root.services.regex.listForChat({ principal: host, chatId: chat.id }),
    books: await root.services.worldInfo.listForChat({ principal: host, chatId: chat.id }),
    documents: await root.services.databank.listActiveForChat({ principal: host, chatId: chat.id }),
  });
  const before = await readRoom();
  expect(before.scripts.map(({ id }) => id)).toEqual([script.id]);
  expect(before.books.map(({ id }) => id)).toEqual([book.id]);
  expect(before.documents.map(({ id }) => id)).toEqual([document.id]);
  expect(await root.services.regex.listForChat({ principal: member, chatId: chat.id })).toEqual(before.scripts);
  expect(await root.services.worldInfo.listForChat({ principal: member, chatId: chat.id })).toEqual(before.books);
  expect((await root.services.databank.listActiveForChat({ principal: member, chatId: chat.id })).map(({ id }) => id)).toEqual([document.id]);

  const missing = root.idSource.typeId(ID_PREFIX.chat);
  // Detach does not require ownership of the library row, so each refusal reaches the room-host gate.
  await expect(root.services.regex.detachFromChat({ principal: member, chatId: chat.id, scriptId: script.id })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  await expect(root.services.worldInfo.detachFromChat({ principal: member, chatId: chat.id, bookId: book.id })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  await expect(root.services.databank.detachFromChat({ principal: member, chatId: chat.id, documentId: document.id })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  expect(await readRoom()).toEqual(before);
  for (const [principal, chatId] of [
    [stranger, chat.id],
    [departed, chat.id],
    [admin, chat.id],
    [host, missing],
  ] as const) {
    for (const detach of [
      (): ReturnType<typeof root.services.regex.detachFromChat> => root.services.regex.detachFromChat({ principal, chatId, scriptId: script.id }),
      (): ReturnType<typeof root.services.worldInfo.detachFromChat> => root.services.worldInfo.detachFromChat({ principal, chatId, bookId: book.id }),
      (): Promise<void> => root.services.databank.detachFromChat({ principal, chatId, documentId: document.id }),
    ]) {
      await expect(detach()).rejects.toThrow(DomainNotFoundError);
    }
    expect(await readRoom()).toEqual(before);
  }

  for (const [principal, chatId] of [
    [stranger, chat.id],
    [departed, chat.id],
    [admin, chat.id],
    [host, missing],
  ] as const) {
    for (const read of [
      (): ReturnType<typeof root.services.regex.listForChat> => root.services.regex.listForChat({ principal, chatId }),
      (): ReturnType<typeof root.services.worldInfo.listForChat> => root.services.worldInfo.listForChat({ principal, chatId }),
      (): ReturnType<typeof root.services.databank.listActiveForChat> => root.services.databank.listActiveForChat({ principal, chatId }),
    ]) {
      await expect(read()).rejects.toThrow(DomainNotFoundError);
    }
    const tag = await root.services.tag.createTag({ principal, input: { name: `Guard tag ${principal.userId}` } });
    const tagBefore = await root.services.tag.listTagsWithUsage({ principal });
    await expect(root.services.tag.attachTag({ principal, tagId: tag.id, targetType: "chat", targetId: chatId })).rejects.toThrow(DomainNotFoundError);
    expect(await root.services.tag.listTagsWithUsage({ principal })).toEqual(tagBefore);
  }
  const tag = await root.services.tag.createTag({ principal: member, input: { name: "Admitted member tag" } });
  await root.services.tag.attachTag({ principal: member, tagId: tag.id, targetType: "chat", targetId: chat.id });
  expect(await root.services.tag.listTagsWithUsage({ principal: member })).toContainEqual(
    expect.objectContaining({ id: tag.id, usage: { characters: 0, chats: 1, worldBooks: 0, personas: 0, presets: 0, total: 1 } }),
  );
  for (const detach of [
    (): ReturnType<typeof root.services.regex.detachFromChat> => root.services.regex.detachFromChat({ principal: host, chatId: chat.id, scriptId: script.id }),
    (): ReturnType<typeof root.services.worldInfo.detachFromChat> =>
      root.services.worldInfo.detachFromChat({ principal: host, chatId: chat.id, bookId: book.id }),
    (): Promise<void> => root.services.databank.detachFromChat({ principal: host, chatId: chat.id, documentId: document.id }),
  ]) {
    await detach();
  }
  expect(await readRoom()).toEqual({ scripts: [], books: [], documents: [] });
});
