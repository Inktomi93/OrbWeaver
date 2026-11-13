// The owner's character count is the characters that hold a seat in a started room, past seats included: the live
// write bumps it on a character's first such room, and a rebuild from canon counts the same set, so a character
// that sits in the library and was never seated counts in neither.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/chat/verbs/claim-chat.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

async function card(root: ServerTestHarness, principal: Principal, handle: string): ReturnType<ServerTestHarness["services"]["character"]["create"]> {
  return await root.services.character.create({ principal, input: createCharacterSchema.parse({ name: handle, handle, description: `The ${handle} card` }) });
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
