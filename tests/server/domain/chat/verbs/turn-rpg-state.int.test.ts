// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/chat-ops/gather.ts
// @subject packages/server/src/domain/rpg/chat-ops/flush.ts

import { expect, test } from "@orb/testkit/node";
import { turnRpgReply, turnRpgRoom, turnWireBody } from "./turn-rpg-physical.ts";

test("a real RPG swipe reads state before its target slot while the next SEND reads the selected head", async () => {
  const wire: string[] = [];
  const locations = ["Retained moor", "Rejected ford", "Selected orchard", "Final hill"];
  await using h = await turnRpgRoom(
    locations.map((location, index) => async (request): Promise<Response> => {
      wire.push(JSON.stringify(await turnWireBody(request)));
      return turnRpgReply(`The keeper records beat ${index + 1}.`, location);
    }),
  );
  const params = { principal: h.owner, chatId: h.chatId };
  expect((await h.root.services.chat.send({ ...params, content: "First beat." })).aborted).toBe(false);
  await h.root.settleBackground();
  const second = await h.root.services.chat.send({ ...params, content: "Second beat." });
  expect(second.aborted).toBe(false);
  await h.root.settleBackground();
  const target = second.messages.find((message) => message.role === "assistant");
  if (target === undefined) {
    throw new Error("the actual swipe has no assistant target");
  }
  expect((await h.root.services.rpg.getTrackerView(params)).ambient?.location).toBe(locations[1]);
  const swiped = await h.root.services.chat.swipe({ ...params, messageId: target.id });
  expect(swiped.aborted).toBe(false);
  expect(swiped.messages).toMatchObject([{ id: target.id, selectedVariantIdx: 1 }]);
  await h.root.settleBackground();
  expect(wire[2]).toContain(locations[0]);
  expect(wire[2]).not.toContain(locations[1]);
  expect((await h.root.services.rpg.getTrackerView(params)).ambient?.location).toBe(locations[2]);
  expect((await h.root.services.chat.send({ ...params, content: "Third beat." })).aborted).toBe(false);
  await h.root.settleBackground();
  expect(wire).toHaveLength(4);
  expect(wire[3]).toContain(locations[2]);
  expect(wire[3]).not.toContain(locations[1]);
  expect((await h.root.services.rpg.getTrackerView(params)).ambient?.location).toBe(locations[3]);
});
