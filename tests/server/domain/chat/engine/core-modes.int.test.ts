// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/engine/pipeline.ts
import { CHAT_REACT_TOOL_NAME, reactToolArgsSchema } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, readRoomCanon } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

test("a public continuation retains real prior calls, namespaces repeated wire ids and rebases their prose offsets", async () => {
  const argumentsJson = JSON.stringify(reactToolArgsSchema.parse({ character: "Aria", emoji: "👍" }));
  const withCall = (text: string): Response =>
    coreSse([
      coreFrame({
        choices: [
          {
            delta: {
              content: text,
              ["tool_calls"]: [{ index: 0, id: "same-wire-id", type: "function", function: { name: CHAT_REACT_TOOL_NAME, arguments: argumentsJson } }],
            },
          },
        ],
      }),
      terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 4, completionTokens: 2 } }),
    ]);
  const prose = (text: string): Response =>
    coreSse([coreFrame({ choices: [{ delta: { content: text } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]);
  await using h = await coreHttpRoom([
    (): Response => withCall("Before."),
    (): Response => prose("Start."),
    (): Response => withCall("After."),
    (): Response => prose("Done."),
  ]);
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: false } },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.root.services.chat.setCharactersCanReact({ principal: h.owner, chatId: h.chatId, enabled: true });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "A real target for the character reaction." });
  const first = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(first.aborted).toBe(false);
  const initial = first.messages[0];
  if (initial === undefined) {
    throw new Error("the native tool turn committed no assistant");
  }
  expect(initial.content).toBe("Before.Start.");
  expect(initial.toolCalls).toHaveLength(1);
  const prior = initial.toolCalls[0];
  expect(prior).toMatchObject({ toolCallId: "same-wire-id", name: CHAT_REACT_TOOL_NAME, isError: false });
  const continued = await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: initial.id });
  expect(continued.aborted).toBe(false);
  const message = continued.messages[0];
  if (message === undefined) {
    throw new Error("the native continuation returned no assistant");
  }
  expect(message.id).toBe(initial.id);
  expect(message.content).toBe("Before.Start.After.Done.");
  expect(message.toolCalls).toHaveLength(2);
  expect(message.toolCalls[0]).toEqual(prior);
  expect(message.toolCalls[1]).toMatchObject({
    toolCallId: "same-wire-id",
    name: CHAT_REACT_TOOL_NAME,
    textOffset: "Before.Start.After.".length,
    isError: false,
  });
  expect(message.toolCalls[1]?.turnId).not.toBe(prior?.turnId);
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).find(({ id }) => id === message.id)).toMatchObject({
    selectedVariantId: message.selectedVariantId,
    content: message.content,
    toolCalls: message.toolCalls,
  });
  expect(h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(4);
});
