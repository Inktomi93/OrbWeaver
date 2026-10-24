// @subject packages/server/src/domain/chat/engine/recover-narrative.ts
// @subject packages/server/src/domain/rpg/chat-ops/flush.ts
import { resolveProseText } from "@orb/contracts/prose";
import type { RPG_TOOL_ROUND_TOOL_NAMES } from "@orb/contracts/rpg";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, processObservability, readRoomCanon } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import type { CoreWireReply } from "./core-physical.ts";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const SCENE_TOOL = "update_scene" satisfies (typeof RPG_TOOL_ROUND_TOOL_NAMES)[number];

async function foldedRoom(replies: readonly CoreWireReply[]): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await coreHttpRoom(replies, { server: { logLevel: "warn" } }));
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
  await h.root.services.rpg.createGame({ principal: h.owner, chatId: h.chatId, mode: "lite" });
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, extractionMode: "folded" });
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("a real folded game recovers its prose once, keeps the first pass's state and sends the recovery tool-less", async () => {
  let calls = 0;
  await using h = await foldedRoom([
    (): Response => {
      calls += 1;
      return coreSse([
        coreFrame({
          choices: [
            {
              delta: {
                ["tool_calls"]: [
                  { index: 0, id: "scene-1", type: "function", function: { name: SCENE_TOOL, arguments: JSON.stringify({ location: "The observatory" }) } },
                ],
              },
            },
          ],
        }),
        terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 10, completionTokens: 4 } }),
      ]);
    },
    async (request): Promise<Response> => {
      calls += 1;
      const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
      if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
        throw new Error("the recovery has no native message list");
      }
      expect(body["tools"]).toBeUndefined();
      const tail = body["messages"].at(-1);
      if (tail === null || typeof tail !== "object" || Array.isArray(tail)) {
        throw new Error("the recovery has no native tail message");
      }
      expect(tail["role"]).toBe("user");
      expect(JSON.stringify(tail["content"])).toContain(resolveProseText("chat.recovery.narrativeContinuation", {}));
      return coreSse([
        coreFrame({ choices: [{ delta: { content: "The keeper reaches the observatory." } }] }),
        terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
      ]);
    },
  ]);
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: "The keeper reaches the observatory." }]);
  expect(outcome.messages[0]?.toolCalls ?? []).toEqual([]);
  await h.root.settleBackground();
  expect(await h.root.services.rpg.getTrackerView({ principal: h.owner, chatId: h.chatId })).toMatchObject({ ambient: { location: "The observatory" } });
  expect(calls).toBe(2);
  const logs = processObservability.logLines(100).filter((line) => line.includes(h.chatId));
  expect(logs.some((line) => line.includes('"event":"chat.generation.recovering"'))).toBe(true);
  expect(logs.some((line) => line.includes('"event":"chat.generation.empty"'))).toBe(false);
});

const EMPTY_RPG_ROWS = [
  { label: "a second empty pass", calls: true, finishReason: "tool_calls", expectedCalls: 2, detail: "tool calls and no story text" },
  { label: "no terminal calls", calls: false, finishReason: "stop", expectedCalls: 1, detail: "returned no text" },
  { label: "a length-cut empty pass", calls: false, finishReason: "length", expectedCalls: 1, detail: "output limit of 4096 tokens" },
] as const;

test.for(EMPTY_RPG_ROWS)("a real folded game refuses $label without a recovery loop or staged state leak", async (row) => {
  let requests = 0;
  const empty = (): Response => {
    requests += 1;
    return coreSse([terminalSseLine({ finishReason: row.finishReason, usage: { promptTokens: 10, completionTokens: 4 } })]);
  };
  const first = (): Response => {
    requests += 1;
    return coreSse([
      coreFrame({
        choices: [
          {
            delta: {
              ["tool_calls"]: [
                {
                  index: 0,
                  id: "refused-scene",
                  type: "function",
                  function: { name: SCENE_TOOL, arguments: JSON.stringify({ location: "An uncommitted observatory" }) },
                },
              ],
            },
          },
        ],
      }),
      terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 10, completionTokens: 4 } }),
    ]);
  };
  await using h = await foldedRoom(row.calls ? [first, empty] : [empty]);
  const outer = `controlled-core-rpg-abort:${h.chatId}`;
  const beforeTraces = new Set(processObservability.traces(100).map((trace) => trace.requestId));
  const generating = processObservability.inRequestSpan(outer, "controlled public folded generation", () =>
    h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { maxOutputTokens: 4096 } }),
  );
  await expect(generating).rejects.toMatchObject({ code: "empty_generation" });
  await expect(generating).rejects.toThrow(row.detail);
  await h.root.settleBackground();
  expect(requests).toBe(row.expectedCalls);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual([]);
  expect((await h.root.services.rpg.getTrackerView({ principal: h.owner, chatId: h.chatId })).ambient).toBeNull();
  const logs = processObservability.logLines(100).filter((line) => line.includes(h.chatId));
  expect(logs.some((line) => line.includes('"event":"chat.generation.empty"'))).toBe(true);
  expect(logs.some((line) => line.includes('"event":"chat.generation.recovering"'))).toBe(row.calls);
  expect(logs.some((line) => line.includes('"event":"chat.generation.recoveryFailed"'))).toBe(row.calls);
  expect(logs.some((line) => line.includes("turn-abort staging clear failed"))).toBe(false);
  const abortTraces = processObservability
    .traces(100)
    .filter(
      (trace) =>
        !beforeTraces.has(trace.requestId) && trace.rootName === "rpg.turnAborted" && trace.spans.some((span) => span.attributes["chatId"] === h.chatId),
    );
  expect(abortTraces).toHaveLength(1);
  expect(abortTraces[0]).toMatchObject({ status: "ok", requestId: expect.stringMatching(/^rpg-turn-abort:/u) });
  expect(abortTraces[0]?.requestId).not.toBe(outer);
  expect(abortTraces[0]?.spans.find((span) => span.name === "rpg.turnAborted")?.parentSpanId).toBeUndefined();
});
