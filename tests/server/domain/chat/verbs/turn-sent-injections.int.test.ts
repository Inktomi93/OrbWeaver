// @subject packages/server/src/domain/chat/engine/pipeline.ts
// @subject packages/server/src/domain/chat/assembly/shape.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts
// What a reply sent, read back through getVariantWire, lists the chat's injection and the world info seated at its top
// and bottom, in the order the prompt placed them, each naming where it came from.

import { expect, test } from "@orb/testkit/node";
import { textRoom } from "../scenario-physical.ts";

const NOTE = "NOTE-BODY";
const TOP = "TOPSEAT-LORE";
const BOTTOM = "BOTTOMSEAT-LORE";
// SillyTavern's own slot numbers for the top and bottom of the Author's Note.
const SLOT_TOP = 2;
const SLOT_BOTTOM = 3;

const worldFile = JSON.stringify({
  entries: Object.fromEntries(
    [
      { content: TOP, slot: SLOT_TOP },
      { content: BOTTOM, slot: SLOT_BOTTOM },
    ].map((entry, uid) => [
      String(uid),
      {
        uid,
        key: ["harbor"],
        keysecondary: [],
        comment: entry.content,
        content: entry.content,
        order: 100,
        position: entry.slot,
        disable: false,
        constant: true,
      },
    ]),
  ),
});

test("the sent prompt lists the chat injection with the world info seated above and below it, in order", async () => {
  await using h = await textRoom(["A reply."]);
  const imported = await h.root.services.worldInfo.importFile({ principal: h.owner, filename: "Seats.json", fileText: worldFile });
  expect(imported.ok).toBe(true);
  const [book] = await h.root.services.worldInfo.listBooks({ principal: h.owner });
  if (book === undefined) {
    throw new Error("the imported world did not persist");
  }
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  await h.caller.chat.setChatInjection({ chatId: h.chatId, position: "in_chat", role: "system", depth: 2, order: 0, content: NOTE });

  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "we sail on" });
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the turn produced no assistant message");
  }
  const wire = await h.root.services.chat.getVariantWire({ principal: h.owner, chatId: h.chatId, variantId: assistant.selectedVariantId });

  // The new-chat marker is an injection the prompt placed above the history, so it is listed first.
  expect(wire.prompt?.afterHistory.map(({ content, origin, seatedAt }) => ({ content, origin, seatedAt }))).toEqual([
    { content: expect.any(String), origin: "new-chat-marker", seatedAt: undefined },
    { content: TOP, origin: "world-info", seatedAt: "top" },
    { content: NOTE, origin: "user", seatedAt: undefined },
    { content: BOTTOM, origin: "world-info", seatedAt: "bottom" },
  ]);
});
