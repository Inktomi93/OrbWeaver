// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/chat-ops/index.ts
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { GAME_MOOD } from "./turn-rpg-macro-data.ts";
import { turnRpgReply, turnRpgRoom, turnWireBody } from "./turn-rpg-physical.ts";

test("a real game's default macro reaches public SEND without a preset declaration or fabricated draw", async () => {
  const wire: string[] = [];
  await using h = await turnRpgRoom(
    [
      async (request): Promise<Response> => {
        wire.push(JSON.stringify(await turnWireBody(request)));
        return turnRpgReply("The keeper answers the traveller.");
      },
    ],
    {
      promptConfig: makePromptConfig({
        userMacros: [],
        sections: [
          { type: "literal", id: "game-mood", name: "Game mood", role: "system", content: "Scene tone: {{mood}}.", enabled: true },
          ...DEFAULT_PROMPT_CONFIG.sections,
        ],
      }),
    },
  );
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, patch: { userMacros: [GAME_MOOD] } });
  const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Hello, keeper." });
  expect(sent.aborted).toBe(false);
  const assistant = sent.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the public SEND did not select an assistant variant");
  }
  await h.root.settleBackground();
  expect(wire).toHaveLength(1);
  expect(wire[0]).toContain("Scene tone: doomed.");
  expect((await h.root.services.chat.getVariantWire({ principal: h.owner, chatId: h.chatId, variantId: assistant.selectedVariantId })).macroDraws).toEqual({});
});
