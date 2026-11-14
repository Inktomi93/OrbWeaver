// The owner's character count is the characters that hold a seat in a started room, past seats included: the live
// write moves it when that set changes, and a rebuild from canon counts the same set, so a character that sits in
// the library and was never seated counts in neither. The set changes when a room starts, when a character is
// deleted, and when a host handoff re-points a room onto the new host's copies.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/chat/verbs/claim-chat.ts
// @subject packages/server/src/domain/character/verbs/remove.ts
// @subject packages/server/src/domain/character/verbs/bulk-remove.ts
// @subject packages/server/src/domain/chat/verbs/participants.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { TURN_ABORTED_OP_CODE } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, freshHeldDb } from "@orb/testkit/node/composed";

async function card(root: ServerTestHarness, principal: Principal, handle: string): ReturnType<ServerTestHarness["services"]["character"]["create"]> {
  return await root.services.character.create({ principal, input: createCharacterSchema.parse({ name: handle, handle, description: `The ${handle} card` }) });
}

async function startedRoom(
  root: ServerTestHarness,
  principal: Principal,
  characterIds: Parameters<ServerTestHarness["services"]["chat"]["startChat"]>[0]["characterIds"],
): Promise<ChatId> {
  const room = await root.services.chat.startChat({ principal, characterIds, opening: "none" });
  await root.app.chatRpgOps.postNarratorMessage(room.chat.id, "The room opens.");
  return room.chat.id;
}

async function invite(root: ServerTestHarness, host: Principal, member: Principal, chatId: ChatId): Promise<void> {
  const invitation = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
}

async function liveCount(root: ServerTestHarness, ownerId: UserId): Promise<number> {
  return (await root.services.stats.overview(ownerId))?.characters ?? 0;
}

/** The count the live writes left, then the count a rebuild from canon gives. Reading the rebuild replaces the live row. */
async function liveThenRebuilt(root: ServerTestHarness, ownerId: UserId): Promise<{ readonly live: number; readonly rebuilt: number }> {
  const live = await liveCount(root, ownerId);
  await root.services.stats.reconcile(ownerId);
  return { live, rebuilt: await liveCount(root, ownerId) };
}

test("a started room with one of two characters seated counts one character live, and a rebuild counts the same", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor((await root.actor()).id);
  const seated = await card(root, owner, "seated-voice");
  const unseated = await card(root, owner, "library-only");
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [seated.id], opening: "none" });
  await root.app.chatRpgOps.postNarratorMessage(room.chat.id, "The seated voice opens the scene.");

  const live = await root.services.stats.overview(owner.userId);
  await root.services.stats.reconcile(owner.userId);
  const rebuilt = await root.services.stats.overview(owner.userId);
  expect(live).toMatchObject({ characters: 1, chats: 1 });
  expect(rebuilt).toMatchObject({ characters: 1, chats: 1 });

  // Control: once the second character takes a seat in a started room, both writers count it.
  const second = await root.services.chat.startChat({ principal: owner, characterIds: [unseated.id], opening: "none" });
  await root.app.chatRpgOps.postNarratorMessage(second.chat.id, "The library card finally speaks.");
  expect(await root.services.stats.overview(owner.userId)).toMatchObject({ characters: 2, chats: 2 });
  await root.services.stats.reconcile(owner.userId);
  expect(await root.services.stats.overview(owner.userId)).toMatchObject({ characters: 2, chats: 2 });
});

test("deleting a seated character lowers the live count by one however many rooms it sat in, a library-only delete leaves it, and a rebuild agrees", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor((await root.actor()).id);
  const wide = await card(root, owner, "two-rooms");
  const single = await card(root, owner, "one-room");
  const bulky = await card(root, owner, "bulk-deleted");
  const library = await card(root, owner, "library-only");
  await startedRoom(root, owner, [wide.id]);
  await startedRoom(root, owner, [wide.id]);
  await startedRoom(root, owner, [single.id]);
  await startedRoom(root, owner, [bulky.id]);
  expect(await liveCount(root, owner.userId)).toBe(3);

  // Control: the library card never counted, so deleting it moves nothing, and the delete itself went through.
  await root.services.character.remove({ principal: owner, characterId: library.id });
  await expect(root.services.character.get({ principal: owner, characterId: library.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await liveCount(root, owner.userId)).toBe(3);

  // One count however many rooms the character sat in.
  await root.services.character.remove({ principal: owner, characterId: wide.id });
  await expect(root.services.character.get({ principal: owner, characterId: wide.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await liveCount(root, owner.userId)).toBe(2);

  await root.services.character.bulkRemove({ principal: owner, characterIds: [bulky.id, library.id] });
  await expect(root.services.character.get({ principal: owner, characterId: bulky.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await liveThenRebuilt(root, owner.userId)).toEqual({ live: 1, rebuilt: 1 });
});

test("deleting one owner's character leaves another owner's count alone", async () => {
  await using root = await createServerHarness();
  const mine = await root.principalFor((await root.actor()).id);
  const theirs = await root.principalFor((await root.actor()).id);
  const mineCard = await card(root, mine, "mine");
  const theirCard = await card(root, theirs, "theirs");
  await startedRoom(root, mine, [mineCard.id]);
  await startedRoom(root, theirs, [theirCard.id]);

  await root.services.character.remove({ principal: mine, characterId: mineCard.id });
  expect(await liveThenRebuilt(root, theirs.userId)).toEqual({ live: 1, rebuilt: 1 });
  expect(await liveThenRebuilt(root, mine.userId)).toEqual({ live: 0, rebuilt: 0 });
});

test("a handoff that copies the host's only seat moves the count to the new host, and a rebuild agrees for both", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  const nominee = await root.principalFor((await root.actor()).id);
  const source = await card(root, host, "offered-voice");
  const chatId = await startedRoom(root, host, [source.id]);
  await invite(root, host, nominee, chatId);
  expect(await liveCount(root, host.userId)).toBe(1);

  await root.services.chat.nominateHostHandoff({ principal: host, chatId, userId: nominee.userId, offer: { copyCharacters: true, copyGmPreset: false } });
  await root.services.chat.acceptHostHandoff({ principal: nominee, chatId });

  expect(await liveCount(root, nominee.userId)).toBe(1);
  expect(await liveThenRebuilt(root, host.userId)).toEqual({ live: 0, rebuilt: 0 });
  expect(await liveThenRebuilt(root, nominee.userId)).toEqual({ live: 1, rebuilt: 1 });
});

test("a handoff keeps the host's count while the original still sits in another started room", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  const nominee = await root.principalFor((await root.actor()).id);
  const source = await card(root, host, "two-room-voice");
  const handedOff = await startedRoom(root, host, [source.id]);
  await startedRoom(root, host, [source.id]);
  await invite(root, host, nominee, handedOff);

  await root.services.chat.nominateHostHandoff({
    principal: host,
    chatId: handedOff,
    userId: nominee.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await root.services.chat.acceptHostHandoff({ principal: nominee, chatId: handedOff });

  expect(await liveThenRebuilt(root, host.userId)).toEqual({ live: 1, rebuilt: 1 });
  expect(await liveThenRebuilt(root, nominee.userId)).toEqual({ live: 1, rebuilt: 1 });
});

test("a handoff without the copy offer moves no count: the dropped seat still counts for the host", async () => {
  await using root = await createServerHarness();
  const host = await root.principalFor(root.ownerId);
  const nominee = await root.principalFor((await root.actor()).id);
  const source = await card(root, host, "kept-voice");
  const chatId = await startedRoom(root, host, [source.id]);
  await invite(root, host, nominee, chatId);

  await root.services.chat.nominateHostHandoff({ principal: host, chatId, userId: nominee.userId, offer: { copyCharacters: false, copyGmPreset: false } });
  await root.services.chat.acceptHostHandoff({ principal: nominee, chatId });

  expect(await liveThenRebuilt(root, host.userId)).toEqual({ live: 1, rebuilt: 1 });
  expect(await liveThenRebuilt(root, nominee.userId)).toEqual({ live: 0, rebuilt: 0 });
});

test("an accept that aborts after minting its copy leaves the copy uncounted until a retry seats it", async () => {
  using held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  const root = ownership.use(await createServerHarness({ db: held.db }));
  const host = await root.principalFor(root.ownerId);
  const nominee = await root.principalFor((await root.actor()).id);
  const source = await card(root, host, "minted-voice");
  const chatId = await startedRoom(root, host, [source.id]);
  const witness = await root.app.chatRpgOps.postNarratorMessage(chatId, "The canon witness.");
  await invite(root, host, nominee, chatId);
  await root.services.chat.nominateHostHandoff({ principal: host, chatId, userId: nominee.userId, offer: { copyCharacters: true, copyGmPreset: false } });

  const gate = held.hold(/^insert into "chats"/u);
  let pending: Promise<void> | undefined;
  try {
    const accept = root.services.chat.acceptHostHandoff({ principal: nominee, chatId });
    pending = accept.catch(() => undefined);
    await gate.reached;
    gate.disarm();
    await root.services.chat.editMessage({ principal: host, chatId, messageId: witness.messageId, content: "The canon moved under the accept." });
    gate.release();
    await expect(accept).rejects.toMatchObject({ code: TURN_ABORTED_OP_CODE });
  } finally {
    gate.release();
    await pending;
  }

  // The copy landed in the new host's library, but no room seats it yet.
  expect(await root.services.character.count({ principal: nominee })).toBe(1);
  expect(await liveThenRebuilt(root, nominee.userId)).toEqual({ live: 0, rebuilt: 0 });
  expect(await liveThenRebuilt(root, host.userId)).toEqual({ live: 1, rebuilt: 1 });

  // Control: the retry seats the same copy, and both writers count it.
  await root.services.chat.acceptHostHandoff({ principal: nominee, chatId });
  expect(await root.services.character.count({ principal: nominee })).toBe(1);
  expect(await liveThenRebuilt(root, nominee.userId)).toEqual({ live: 1, rebuilt: 1 });
  expect(await liveThenRebuilt(root, host.userId)).toEqual({ live: 0, rebuilt: 0 });
});
