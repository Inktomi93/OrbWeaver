// @subject packages/server/src/domain/chat/verbs/participants.ts
// @subject packages/server/src/transport/trpc/role-output.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { chatEvents, chatParticipants } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { and, asc, eq } from "drizzle-orm";

test("the host adds a character; the row is inserted and the wire view resolves the card", async () => {
  await using harness = await createServerHarness();
  const principal = await harness.principalFor(harness.ownerId);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const character = await harness.services.character.create({
    principal,
    input: createCharacterSchema.parse({ name: "Aria", handle: "aria", description: "A traveller at an orbital loom." }),
  });
  const before = await harness.db.select().from(chatEvents).where(eq(chatEvents.chatId, chat.id)).orderBy(asc(chatEvents.seq));
  const view = await caller.chat.addCharacterToChat({ chatId: chat.id, characterId: character.id });
  expect(view).toMatchObject({ kind: "character", characterId: character.id, role: "member", displayName: "Aria" });
  expect(
    await harness.db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chat.id), eq(chatParticipants.characterId, character.id))),
  ).toHaveLength(1);
  const events = await harness.db.select().from(chatEvents).where(eq(chatEvents.chatId, chat.id)).orderBy(asc(chatEvents.seq));
  expect(events.slice(before.length).map((row) => row.payload)).toEqual([{ type: "chatUpdated", chatId: chat.id }]);
});
