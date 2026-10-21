// @subject packages/server/src/domain/chat/engine/pipeline.ts
// @subject packages/server/src/domain/rpg/chat-ops/flush.ts
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { coreFrame, coreSse } from "../engine/core-physical.ts";
import { TURN_SCENE_TOOL, turnRpgReply, turnRpgRoom, turnWireBody } from "./turn-rpg-physical.ts";

test("a withheld terminal channel and mounted-but-empty calls take distinguishable real state-round fallbacks", async () => {
  for (const guarded of [true, false]) {
    const wires: Awaited<ReturnType<typeof turnWireBody>>[] = [];
    await using h = await turnRpgRoom([
      async (request): Promise<Response> => {
        wires.push(await turnWireBody(request));
        return coreSse([
          coreFrame({ choices: [{ delta: { content: "The keeper reaches the next beat." } }] }),
          terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
        ]);
      },
      async (request): Promise<Response> => {
        wires.push(await turnWireBody(request));
        return turnRpgReply("", "Fallback observatory");
      },
    ]);
    if (guarded) {
      const connection = await h.root.services.connection.create({
        principal: h.owner,
        providerId: "custom-openai",
        credentialId: null,
        baseUrl: CORPUS_PROVIDER_ENDPOINT,
        model: CORPUS_TEXT_MODEL,
        declared: {
          kind: "generation",
          generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: true } },
          features: { detectServer: false },
        },
      });
      await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
    }
    const params = { principal: h.owner, chatId: h.chatId };
    const sent = await h.root.services.chat.send({ ...params, content: "Reach the next beat." });
    expect(sent.aborted).toBe(false);
    expect(sent.messages.filter((message) => message.role === "assistant")).toMatchObject([{ content: "The keeper reaches the next beat.", toolCalls: [] }]);
    await h.root.settleBackground();
    expect(wires).toHaveLength(2);
    expect(wires[0]?.["tools"] === undefined).toBe(guarded);
    expect(JSON.stringify(wires[0]?.["tools"])?.includes(TURN_SCENE_TOOL) ?? false).toBe(!guarded);
    expect(JSON.stringify(wires[1]?.["tools"])).toContain(TURN_SCENE_TOOL);
    expect((await h.root.services.rpg.getTrackerView(params)).ambient).toMatchObject({ location: "Fallback observatory" });
    expect(h.root.app.rpgTrace?.recent({ chatId: h.chatId }).map(({ event }) => event)).toContainEqual(
      expect.objectContaining({
        phase: "flush",
        path: "tool-round",
        fallbackReason: guarded ? "local-engine-fold-guard" : "no-terminal-calls",
      }),
    );
  }
});
