// Public SEND folds terminal bytes into durable RPG state: the snapshot row is keyed to the reply's
// selected variant and slot, without a public tool exchange.
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/chat-ops/gather.ts
// @subject packages/server/src/domain/rpg/chat-ops/flush.ts

import { rpgSnapshots } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { TURN_SCENE_TOOL, turnRpgReply, turnRpgRoom, turnWireBody } from "../../chat/verbs/turn-rpg-physical.ts";

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
