// @subject packages/server/src/domain/chat/verbs/start-chat.ts
// @subject packages/server/src/transport/trpc/role-output.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, readRoomCanon } from "@orb/testkit/node/composed";

test("first-message seeds the primary greeting verbatim; the caller is host and the roster references the live card", async () => {
  await using harness = await createServerHarness();
  const principal = await harness.principalFor(harness.ownerId);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const character = await harness.services.character.create({
    principal,
    input: createCharacterSchema.parse({
      name: "Aria",
      handle: "aria",
      description: "A traveller at an orbital loom.",
      greetings: [{ text: "Hello, I am {{char}}." }],
    }),
  });
  const { chat, opening } = await caller.chat.startChat({ characterIds: [character.id] });
  expect(chat.participants.find((seat) => seat.userId === harness.ownerId)).toMatchObject({ role: "host" });
  expect(chat.participants.find((seat) => seat.kind === "character")).toMatchObject({ characterId: character.id, role: "member" });
  expect(opening).toMatchObject({
    aborted: false,
    messages: [{ content: "Hello, I am {{char}}.", role: "assistant", characterId: character.id, seq: 1 }],
  });
  const events = await harness.services.chat.replayChatEvents({ principal, chatId: chat.id });
  expect(events.map(({ event }) => event.type)).toEqual(["chatCreated", "messageCommitted"]);
  expect(await readRoomCanon(harness, principal, chat.id)).toHaveLength(1);
  expect(chat.opening).toBeNull();
});
