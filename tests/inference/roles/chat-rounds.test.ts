// roles/chat-rounds — the two non-turn chat calls behind neutral inputs. Pins, per chat api, which executor method
// a structured-output call reaches and the exact request it sends (the Agent SDK's chat turn with an output format
// vs the `structured` task on the same row), which apis carry a forced tool round, the forced round's request on
// each history wire, and the refusal on a connection that cannot carry one.

import type { ChatApi } from "@orb/contracts/inference";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatRequest, ChatResult, ForcedToolRoundInput, StructuredChatInput, StructuredRequest, SummarizeResult, WireTool } from "@orb/inference";
import { carriesForcedToolRound, ProviderError, runStructuredChat, toForcedToolRoundRequest } from "@orb/inference";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { describe } from "vitest";
import { z } from "zod";
import { makeResolved } from "../../support/factories/resolved-connection.ts";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_rounds");
const FORMAT: ResponseFormat = { name: "state", schema: projectJsonSchema(z.object({ place: z.string() })) };
const SCENE: WireTool = { name: "update_scene", description: "scene", parameters: { type: "object", properties: {} } };
const HISTORY: ForcedToolRoundInput["history"] = [{ role: "user", content: [{ type: "text", text: "the beat" }] }];

const CHAT_RESULT: ChatResult = {
  reply: '{"place":"tower"}',
  reasoning: "",
  reasoningRedacted: false,
  stopReason: null,
  terminalReason: null,
  finishReason: "stop",
  ttftMs: null,
  durationApiMs: null,
  apiErrorStatus: null,
  numTurns: 1,
  appliedEffort: null,
  usage: {
    model: castId<ModelId>("test-model"),
    tokensIn: 1,
    tokensOut: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: null,
    contextWindow: null,
    maxOutputTokens: null,
    costUsd: 0,
    costDetails: null,
    costProvenance: "measured",
  },
  events: [],
  rateLimit: null,
};

const connectionOf = (api: ChatApi | null): StructuredChatInput["connection"] => makeResolved({ api, model: castId<ModelId>("test-model") });

/** A recording executor: each method records the request it was handed and answers with a fixed body. */
function recordingExecutor(items: SummarizeResult["items"] = [{ text: '{"place":"ford"}', usage: { tokensIn: null, tokensOut: null, costUsd: null } }]): {
  readonly executor: Parameters<typeof runStructuredChat>[0];
  readonly chat: ChatRequest[];
  readonly structured: StructuredRequest[];
} {
  const chat: ChatRequest[] = [];
  const structured: StructuredRequest[] = [];
  return {
    chat,
    structured,
    executor: {
      runChatTurn: (req): Promise<ChatResult> => {
        chat.push(req);
        return Promise.resolve(CHAT_RESULT);
      },
      structured: (req): Promise<SummarizeResult> => {
        structured.push(req);
        return Promise.resolve({ items, model: "test-model" });
      },
    },
  };
}

function structuredInput(api: ChatApi | null, signal?: AbortSignal): StructuredChatInput {
  return { connection: connectionOf(api), chatId: CHAT_ID, systemPrompt: "SYSTEM", userPrompt: "USER", responseFormat: FORMAT, signal };
}

describe("runStructuredChat", () => {
  test("agent-sdk rides a tool-less chat turn with the output format and returns the reply", async () => {
    const rec = recordingExecutor();
    const signal = new AbortController().signal;
    const input = structuredInput("agent-sdk", signal);
    await expect(runStructuredChat(rec.executor, input)).resolves.toBe('{"place":"tower"}');
    expect(rec.structured).toEqual([]);
    expect(rec.chat).toEqual([
      {
        api: "agent-sdk",
        chatId: CHAT_ID,
        connection: input.connection,
        params: {},
        systemPrompt: { static: "SYSTEM", dynamic: "" },
        prompt: "USER",
        responseFormat: FORMAT,
        signal,
      },
    ]);
  });

  for (const api of ["chat-completions", "anthropic-messages", null] as const) {
    test(`${String(api)} rides the structured task on the same row, chatless, and returns the first item`, async () => {
      const rec = recordingExecutor();
      const input = structuredInput(api);
      await expect(runStructuredChat(rec.executor, input)).resolves.toBe('{"place":"ford"}');
      expect(rec.chat).toEqual([]);
      expect(rec.structured).toEqual([
        {
          connection: { ...input.connection, task: "structured" },
          inputs: [{ systemPrompt: "SYSTEM", userPrompt: "USER" }],
          responseFormat: FORMAT,
          signal: undefined,
        },
      ]);
      // The format passes through untouched: no vehicle is resolved onto it.
      expect(rec.structured[0]?.responseFormat).not.toHaveProperty("vehicle");
    });
  }

  test("a batch that answered with no item reads as empty text, never a throw", async () => {
    const rec = recordingExecutor([]);
    await expect(runStructuredChat(rec.executor, structuredInput("chat-completions"))).resolves.toBe("");
  });
});

describe("forced tool round", () => {
  test("only the history wires carry one", () => {
    expect(carriesForcedToolRound(connectionOf("agent-sdk"))).toBe(false);
    expect(carriesForcedToolRound(connectionOf("chat-completions"))).toBe(true);
    expect(carriesForcedToolRound(connectionOf("anthropic-messages"))).toBe(true);
    expect(carriesForcedToolRound(connectionOf(null))).toBe(false);
  });

  for (const api of ["chat-completions", "anthropic-messages"] as const) {
    test(`${api}: the round projects onto its own arm with toolChoice required and no prose knobs`, () => {
      const signal = new AbortController().signal;
      const connection = connectionOf(api);
      const req = toForcedToolRoundRequest({ connection, chatId: CHAT_ID, systemPrompt: "ROUND", history: HISTORY, tools: [SCENE], signal });
      expect(req).toEqual({
        api,
        chatId: CHAT_ID,
        connection,
        params: {},
        systemPrompt: { static: "ROUND", dynamic: "" },
        history: HISTORY,
        tools: [SCENE],
        toolChoice: { mode: "required" },
        signal,
      });
    });
  }

  test("an absent signal adds no signal key", () => {
    const req = toForcedToolRoundRequest({
      connection: connectionOf("chat-completions"),
      chatId: CHAT_ID,
      systemPrompt: "ROUND",
      history: HISTORY,
      tools: [SCENE],
    });
    expect(req).not.toHaveProperty("signal");
  });

  for (const api of ["agent-sdk", null] as const) {
    test(`${String(api)}: a connection that cannot carry a round is refused as an invariant`, () => {
      expect(() =>
        toForcedToolRoundRequest({ connection: connectionOf(api), chatId: CHAT_ID, systemPrompt: "ROUND", history: HISTORY, tools: [SCENE] }),
      ).toThrow(ProviderError);
    });
  }
});
