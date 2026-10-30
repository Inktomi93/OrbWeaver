// Stepping a seeded greeting to a card alternate is not an edit: the row stays unedited, and a hand edit made earlier
// keeps the stamp it set.
// @subject packages/server/src/domain/chat/verbs/edit.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const GREETINGS = ["The market opens.", "The keeper lifts the ledger.", "Rain taps the window."] as const;
const AUTHORED = "The host wrote a different opening.";
const TAIL = 10;

test("stepping a seeded greeting leaves it unedited, and a hand edit keeps its own stamp", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "greeting-stamp",
      name: "Greeting keeper",
      description: "Keeps the opening.",
      greetings: GREETINGS.map((text) => ({ text })),
    }),
  });
  const started = await caller.chat.startChat({ characterIds: [card.id], opening: "first-message" });
  const greeting = started.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the production start did not seed its real card greeting");
  }
  const chatId = started.chat.id;
  const stamp = async (): Promise<number | null> => {
    const { messages } = await caller.chat.listMessages({ chatId, limit: TAIL });
    const row = messages.find((message) => message.id === greeting.id);
    if (row === undefined) {
      throw new Error("the greeting row is not in the room");
    }
    return row.editedAt;
  };

  expect(await stamp()).toBeNull();
  await caller.chat.setSeededGreeting({ chatId, messageId: greeting.id, greetingIndex: 1 });
  expect(await stamp()).toBeNull();

  await caller.chat.editMessage({ chatId, messageId: greeting.id, content: AUTHORED, timeZone: UTC_TIME_ZONE });
  const edited = await stamp();
  expect(edited).toEqual(expect.any(Number));

  await caller.chat.setSeededGreeting({ chatId, messageId: greeting.id, greetingIndex: 2 });
  expect(await stamp()).toBe(edited);
});
