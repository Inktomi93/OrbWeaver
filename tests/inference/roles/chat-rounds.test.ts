// roles/chat-rounds — the two non-turn chat calls behind neutral inputs. Pins, per chat api, the exact request a
// structured-output call sends (one side-generation chat turn on the same row), which apis carry a forced tool round,
// the forced round's request on each history wire, and the refusal on a connection that cannot carry one.

import type { ChatApi } from "@orb/contracts/inference";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatRequest, ChatResult, ForcedToolRoundInput, StructuredChatInput, WireTool } from "@orb/inference";
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

/** A recording executor: each chat turn records the request it was handed and answers with a fixed result. */
function recordingExecutor(result: ChatResult = CHAT_RESULT): { readonly executor: Parameters<typeof runStructuredChat>[0]; readonly chat: ChatRequest[] } {
  const chat: ChatRequest[] = [];
  return {
    chat,
    executor: {
      runChatTurn: (req): Promise<ChatResult> => {
        chat.push(req);
        return Promise.resolve(result);
      },
    },
  };
}

function structuredInput(api: ChatApi | null, signal?: AbortSignal): StructuredChatInput {
  return { connection: connectionOf(api), chatId: CHAT_ID, systemPrompt: "SYSTEM", userPrompt: "USER", responseFormat: FORMAT, signal };
}

describe("runStructuredChat", () => {
  test("agent-sdk rides one side-generation chat turn with the output format and returns the reply", async () => {
    const rec = recordingExecutor();
    const signal = new AbortController().signal;
    const input = structuredInput("agent-sdk", signal);
    await expect(runStructuredChat(rec.executor, input)).resolves.toBe('{"place":"tower"}');
    expect(rec.chat).toEqual([
      {
        api: "agent-sdk",
        chatId: CHAT_ID,
        connection: input.connection,
        params: {},
        posture: "side-gen",
        systemPrompt: { static: "SYSTEM", dynamic: "" },
        prompt: "USER",
        responseFormat: FORMAT,
        signal,
      },
    ]);
  });

  for (const api of ["chat-completions", "anthropic-messages", "google-generative-ai"] as const) {
    test(`${api} rides one side-generation chat turn on the same row, its chat id kept, and returns the payload`, async () => {
      const rec = recordingExecutor();
      const input = structuredInput(api);
      await expect(runStructuredChat(rec.executor, input)).resolves.toBe('{"place":"tower"}');
      expect(rec.chat).toEqual([
        {
          api,
          chatId: CHAT_ID,
          connection: input.connection,
          params: {},
          posture: "side-gen",
          systemPrompt: { static: "SYSTEM", dynamic: "" },
          history: [{ role: "user", content: [{ type: "text", text: "USER" }] }],
          responseFormat: FORMAT,
        },
      ]);
      // The format passes through untouched: the backend plans how it rides.
      expect((rec.chat[0] as { readonly responseFormat?: unknown }).responseFormat).toBe(FORMAT);
    });
  }

  test("a tool vehicle the model did not call reads as empty text, never a throw", async () => {
    const rec = recordingExecutor({ ...CHAT_RESULT, reply: "" });
    await expect(runStructuredChat(rec.executor, structuredInput("chat-completions"))).resolves.toBe("");
  });

  test("a refused turn is a refusal, never the payload", async () => {
    const rec = recordingExecutor({ ...CHAT_RESULT, finishReason: "filter" });
    await expect(runStructuredChat(rec.executor, structuredInput("chat-completions"))).rejects.toMatchObject({ kind: "refused" });
  });

  test("a chat connection with no chat api is refused as an invariant", async () => {
    await expect(runStructuredChat(recordingExecutor().executor, structuredInput(null))).rejects.toThrow(ProviderError);
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
