// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/chat-ops/gather.ts
// @subject packages/server/src/domain/rpg/chat-ops/flush.ts
import { rpgSnapshots } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { TURN_SCENE_TOOL, turnRpgReply, turnRpgRoom, turnWireBody } from "./turn-rpg-physical.ts";

test("public SEND folds actual terminal bytes into durable RPG state without exposing a public tool exchange", async () => {
  const requests: string[] = [];
  await using h = await turnRpgRoom([
    async (request): Promise<Response> => {
      const body = await turnWireBody(request);
      expect(JSON.stringify(body["tools"])).toContain(TURN_SCENE_TOOL);
      requests.push(JSON.stringify(body));
      return turnRpgReply("She fords the river.", "The ford");
    },
  ]);
  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Cross the river." });
  expect(sent.aborted).toBe(false);
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the folded SEND has no selected assistant variant");
  }
  expect(assistant.content).toBe("She fords the river.");
  expect(assistant.toolCalls).toEqual([]);
  await h.root.settleBackground();
  expect(requests).toHaveLength(1);
  expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, assistant.selectedVariantId))).toMatchObject([
    { messageId: assistant.id, location: "The ford" },
  ]);
  expect((await h.root.services.rpg.getTrackerView({ principal: h.owner, chatId: h.chatId })).ambient).toMatchObject({ location: "The ford" });
  expect(h.root.app.rpgTrace?.recent({ chatId: h.chatId }).map(({ event }) => event)).toContainEqual(
    expect.objectContaining({ phase: "flush", path: "folded", fallbackReason: null }),
  );
});

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
