// @subject packages/server/src/domain/chat/verbs/participants.ts
// @subject packages/server/src/transport/trpc/role-output.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("the host adds a character; the row is inserted and the wire view resolves the card", async () => {
  await using harness = await createServerHarness();
  const principal = await harness.principalFor(harness.ownerId);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const character = await harness.services.character.create({
    principal,
    input: createCharacterSchema.parse({ name: "Aria", handle: "aria", description: "A traveller at an orbital loom." }),
  });
  const before = await harness.services.chat.replayChatEvents({ principal, chatId: chat.id });
  const view = await caller.chat.addCharacterToChat({ chatId: chat.id, characterId: character.id });
  expect(view).toMatchObject({ kind: "character", characterId: character.id, role: "member", displayName: "Aria" });
  expect((await harness.services.chat.listParticipants({ principal, chatId: chat.id })).filter((seat) => seat.characterId === character.id)).toHaveLength(1);
  const events = await harness.services.chat.replayChatEvents({ principal, chatId: chat.id });
  expect(events.slice(before.length).map(({ event }) => event)).toEqual([{ type: "chatUpdated", chatId: chat.id }]);
});
