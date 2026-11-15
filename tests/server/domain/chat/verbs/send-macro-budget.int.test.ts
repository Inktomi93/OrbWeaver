// A send or commit whose draft is too large for the macro engine's byte budget is refused by name and writes no
// row. The engine renders a tripped budget as empty text, so without the refusal the room stored an empty message
// in place of what the user typed.
// @subject packages/server/src/domain/chat/assembly/context.ts
// @subject packages/server/src/domain/chat/assembly/macros.ts

import { MESSAGE_MACRO_BUDGET_OP_CODE } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { textRoom } from "../scenario-physical.ts";

// Past the engine's 1,000,000-byte output budget and under its 2,000,000-byte input limit, so the output arm trips.
const OVER_BUDGET = "x".repeat(1_500_000);
// Under the output budget: the control that the same path stores a large draft whole.
const UNDER_BUDGET = "x".repeat(900_000);
const REFUSED = { code: MESSAGE_MACRO_BUDGET_OP_CODE };

test("a send whose draft trips the macro budget is refused by name and writes no row", async () => {
  await using h = await textRoom([]);
  const { chat } = h.root.services;

  await expect(chat.send({ principal: h.owner, chatId: h.chatId, content: OVER_BUDGET })).rejects.toMatchObject(REFUSED);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);
});

test("a commit whose draft trips the macro budget is refused by name, while a draft under it is stored whole", async () => {
  await using h = await textRoom([]);
  const { chat } = h.root.services;

  await expect(chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: OVER_BUDGET })).rejects.toMatchObject(REFUSED);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);

  await chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: UNDER_BUDGET });
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).map((message) => message.content.length)).toEqual([UNDER_BUDGET.length]);
});
