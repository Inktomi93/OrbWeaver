// The owner's character count is the characters that hold a seat in a started room, past seats included: the live
// write moves it when that set changes, and a rebuild from canon counts the same set, so a character that sits in
// the library and was never seated counts in neither. The set changes when a room starts and when a character is
// deleted.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/chat/verbs/claim-chat.ts
// @subject packages/server/src/domain/character/verbs/remove.ts
// @subject packages/server/src/domain/character/verbs/bulk-remove.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

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
