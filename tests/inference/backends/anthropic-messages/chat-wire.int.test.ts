// The direct Anthropic wire's chat turn, read at the provider edge: the bytes a turn sends (thinking spelling,
// carried reasoning, tool choice, cue rows, cache markers) and what its reply records (reasoning provenance,
// refusal, rate limit, dropped-thinking alarm). The prefix-bound carry is the wire half of the append-only
// history ruling.
// @subject packages/inference/src/backends/anthropic-messages/chat.ts

import { toolCallIdSchema } from "@orb/contracts/chat";
import { WARNING_CODE } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ExtractionRefs } from "@orb/contracts/rpg";
import { buildToolRoundWireTools, rpgGameConfigSchema, withStateToolExamples } from "@orb/contracts/rpg";
import type { ChatHistoryMessage, ChatResult, ToolChoice, WireTool } from "@orb/inference";
import { ProviderError } from "@orb/inference";
import { isPlainObject } from "@orb/kit/guards";
import { expect, test } from "@orb/testkit/node";
import type { AnthropicStreamEvent, RecordedRequest } from "@orb/testkit/node/helpers";
import {
  anthropicSse,
  anthropicTextReply,
  messageEnd,
  messageStart,
  recordRequest,
  redactedThinkingBlock,
  textBlock,
  thinkingBlock,
  toolUseBlock,
  warningCodes,
} from "@orb/testkit/node/helpers";
import { vi } from "vitest";
import { z } from "zod";
import { createRuntimeRoot, wireConnection } from "../../roles/runtime.fixtures.ts";

const THINKING = "The signed thought.";
const SIGNATURE = "signed-by-the-provider";
const RESET = "2026-09-20T06:04:11Z";
const WEATHER: WireTool = { name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } };
const ASK: ChatHistoryMessage = { role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] };

function textReply(model: string, text = "ok", transformations?: readonly Record<string, string>[]): AnthropicStreamEvent[] {
  return anthropicTextReply(model, text, transformations === undefined ? {} : { inputTransformations: transformations });
}

function thinkingToolReply(model: string): AnthropicStreamEvent[] {
  return [
    messageStart(model),
    ...thinkingBlock(0, THINKING, SIGNATURE),
    ...toolUseBlock(1, { id: "toolu_1", name: "get_weather", inputJson: '{"city":"Paris"}' }),
    ...messageEnd({ stopReason: "tool_use" }),
  ];
}

function redactedReply(model: string): AnthropicStreamEvent[] {
  return [messageStart(model), ...redactedThinkingBlock(0, "REDACTED-PAYLOAD"), ...textBlock(1, "ok"), ...messageEnd({ stopReason: "end_turn" })];
}

function refusalReply(model: string): AnthropicStreamEvent[] {
  return [
    messageStart(model),
    ...messageEnd({ stopReason: "refusal", stopDetails: { type: "refusal", category: "cyber", explanation: "blocked under the Usage Policy" } }),
  ];
}

interface Drive {
  readonly model: string;
  readonly reply: (model: string) => AnthropicStreamEvent[];
  readonly params?: UserIntent;
  readonly history?: readonly ChatHistoryMessage[];
  readonly tools?: readonly WireTool[];
  readonly toolChoice?: ToolChoice;
  readonly systemPrompt?: { readonly static: string; readonly dynamic: string };
  readonly headers?: Readonly<Record<string, string>>;
}

interface Driven {
  readonly turn: ChatResult;
  readonly sent: RecordedRequest;
  readonly errorLog: readonly Record<string, unknown>[];
}

/** One chat turn on the direct Anthropic wire against a scripted SSE endpoint, on the model's curated capability. */
async function drive(options: Drive): Promise<Driven> {
  const recorded: RecordedRequest[] = [];
  const providerFetch: typeof fetch = async (input, init) => {
    recorded.push(await recordRequest(input, init));
    return anthropicSse(options.reply(options.model), options.headers);
  };
  await using root = await createRuntimeRoot({ providerFetch });
  using errors = vi.spyOn(root.logger, "error");
  const connection = await wireConnection(root, { task: "chat", providerId: "anthropic", model: options.model, baseUrl: null, key: "sk-ant-not-a-real-key" });
  const turn = await root.app.runtime.executor.runChatTurn({
    api: "anthropic-messages",
    connection,
    params: options.params ?? { effort: "high" },
    systemPrompt: options.systemPrompt ?? { static: "You are a helpful assistant.", dynamic: "" },
    history: options.history ?? [ASK],
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    ...(options.toolChoice === undefined ? {} : { toolChoice: options.toolChoice }),
  });
  const [sent] = recorded;
  if (sent === undefined) {
    throw new Error("the turn reached no endpoint");
  }
  return {
    turn,
    sent,
    errorLog: errors.mock.calls.flatMap(([first]) => (typeof first === "object" && first !== null ? [Object.fromEntries(Object.entries(first))] : [])),
  };
}

function thinkingOf(sent: RecordedRequest): unknown {
  return sent.body["thinking"];
}

function assistantContent(sent: RecordedRequest): unknown {
  const messages = sent.body["messages"];
  const row = Array.isArray(messages) ? messages.find((message) => isPlainObject(message) && message["role"] === "assistant") : undefined;
  return isPlainObject(row) ? row["content"] : undefined;
}

test("a thinking and tool loop sends the first leg's reasoning back with its signature, ahead of the tool call", async () => {
  const model = "claude-opus-5";
  const first = await drive({ model, reply: thinkingToolReply, tools: [WEATHER] });
  expect(first.turn.reasoning).toBe(THINKING);
  expect(first.turn.toolCalls?.[0]).toMatchObject({ name: "get_weather" });
  expect(first.turn.reasoningParts).toMatchObject([{ type: "reasoning", text: THINKING, meta: { anthropic: { signature: SIGNATURE } } }]);

  const second = await drive({
    model,
    reply: (name) => textReply(name, "18C and clear."),
    tools: [WEATHER],
    history: [
      ASK,
      {
        role: "assistant",
        content: [
          ...(first.turn.reasoningParts ?? []),
          { type: "tool-call", toolCallId: toolCallIdSchema.parse("toolu_1"), name: "get_weather", arguments: '{"city":"Paris"}' },
        ],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: toolCallIdSchema.parse("toolu_1"), content: "18C, clear." }] },
    ],
  });

  expect(assistantContent(second.sent)).toMatchObject([
    { type: "thinking", thinking: THINKING, signature: SIGNATURE },
    { type: "tool_use", name: "get_weather" },
  ]);
});

test("a redacted thinking block marks the turn redacted and keeps its opaque payload, and a turn with no reasoning is not marked", async () => {
  const redacted = await drive({ model: "claude-opus-5", reply: redactedReply });
  expect(redacted.turn.reasoningRedacted).toBe(true);
  expect(redacted.turn.reasoningParts?.[0]).toMatchObject({ type: "reasoning", text: "", meta: { anthropic: { redactedData: "REDACTED-PAYLOAD" } } });

  const plain = await drive({ model: "claude-opus-5", reply: (name) => textReply(name, "plain") });
  expect(plain.turn.reasoningRedacted).toBe(false);
  expect(plain.turn.reasoningParts ?? []).toHaveLength(0);
});

test("a prior turn's replayed thinking leads its assistant row, and the same row without the carry sends prose only", async () => {
  const prose: ChatHistoryMessage = { role: "assistant", content: [{ type: "text", text: "The map is genuine." }] };
  const reasoning: ChatHistoryMessage = {
    role: "assistant",
    content: [{ type: "reasoning", text: THINKING, meta: { anthropic: { signature: SIGNATURE } } }, ...prose.content],
  };
  const doubt: ChatHistoryMessage = { role: "user", content: [{ type: "text", text: "Are you sure?" }] };
  const carried = await drive({ model: "claude-opus-5", reply: textReply, history: [ASK, reasoning, doubt] });
  expect(assistantContent(carried.sent)).toMatchObject([
    { type: "thinking", thinking: THINKING, signature: SIGNATURE },
    { type: "text", text: "The map is genuine." },
  ]);

  const bare = await drive({ model: "claude-opus-5", reply: textReply, history: [ASK, prose, doubt] });
  expect(assistantContent(bare.sent)).toMatchObject([{ type: "text", text: "The map is genuine." }]);
  expect(JSON.stringify(assistantContent(bare.sent))).not.toContain("thinking");
});

test("a minimal turn sends exactly one request body, so a provider SDK upgrade that reshapes any field fails here", async () => {
  const { sent } = await drive({ model: "claude-opus-5", reply: textReply });

  expect(sent.body).toEqual({
    model: "claude-opus-5",
    ["max_tokens"]: expect.any(Number),
    thinking: { type: "adaptive", display: "summarized" },
    ["output_config"]: { effort: "high" },
    metadata: { ["user_id"]: expect.any(String) },
    system: [{ type: "text", text: "You are a helpful assistant.", ["cache_control"]: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    stream: true,
  });
});

test("a delivered trailing assistant row on a model that refuses prefill is a typed refusal and nothing is sent", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({
    providerFetch: async (input, init) => {
      recorded.push(await recordRequest(input, init));
      return new Response("", { status: 500 });
    },
  });
  const connection = await wireConnection(root, { task: "chat", providerId: "anthropic", model: "claude-opus-5", baseUrl: null, key: "sk-ant-not-a-real-key" });

  const refused = await root.app.runtime.executor
    .runChatTurn({
      api: "anthropic-messages",
      connection,
      params: { effort: "high" },
      systemPrompt: { static: "S.", dynamic: "" },
      history: [
        { role: "user", content: [{ type: "text", text: "Continue:" }] },
        { role: "assistant", content: [{ type: "text", text: "Once upon a" }] },
      ],
    })
    .catch((error: unknown) => error);

  expect(refused).toBeInstanceOf(ProviderError);
  expect(refused).toMatchObject({ kind: "invalid", retryable: false });
  expect(recorded).toHaveLength(0);
});

test("a forced tool choice goes out as auto, with the tools kept and a warning, on every model that rejects it, and unchanged on those that accept it", async () => {
  const forced = [{ mode: "required" }, { mode: "tool", name: "get_weather" }] as const satisfies readonly ToolChoice[];
  for (const model of ["claude-fable-5-1", "claude-mythos-5-1", "claude-opus-5-5", "claude-sonnet-5-5"]) {
    for (const toolChoice of forced) {
      const { turn, sent } = await drive({ model, reply: textReply, tools: [WEATHER], toolChoice });
      expect(sent.body["tool_choice"], `${model} ${toolChoice.mode}`).toMatchObject({ type: "auto" });
      expect(sent.body["tools"], model).toMatchObject([{ name: "get_weather" }]);
      expect(warningCodes(turn.events), `${model} ${toolChoice.mode}`).toContain(WARNING_CODE.toolChoiceDowngraded);
    }
  }
  for (const model of ["claude-opus-5", "claude-fable-5"]) {
    const required = await drive({ model, reply: textReply, tools: [WEATHER], toolChoice: { mode: "required" } });
    expect(required.sent.body["tool_choice"], model).toMatchObject({ type: "any" });
    expect(warningCodes(required.turn.events), model).not.toContain(WARNING_CODE.toolChoiceDowngraded);
    const named = await drive({ model, reply: textReply, tools: [WEATHER], toolChoice: { mode: "tool", name: "get_weather" } });
    expect(named.sent.body["tool_choice"], model).toMatchObject({ type: "tool", name: "get_weather" });
  }
});

test("manual extended thinking refuses a forced tool choice: a budget-thinking turn sends auto, and the same model with thinking off keeps it", async () => {
  const model = "claude-sonnet-4-5";
  const thinking = await drive({ model, reply: textReply, tools: [WEATHER], toolChoice: { mode: "required" }, params: { effort: "high" } });
  expect(thinkingOf(thinking.sent)).toMatchObject({ type: "enabled" });
  expect(thinking.sent.body["tool_choice"]).toMatchObject({ type: "auto" });
  expect(warningCodes(thinking.turn.events)).toContain(WARNING_CODE.toolChoiceDowngraded);

  const off = await drive({ model, reply: textReply, tools: [WEATHER], toolChoice: { mode: "required" }, params: { effort: "none" } });
  expect(off.sent.body["tool_choice"]).toMatchObject({ type: "any" });
});

test("reasoning off never sends thinking disabled where the model refuses it: Opus clamps to the lowest effort, Sonnet sends the bare between-tools type", async () => {
  const opus = await drive({ model: "claude-opus-5-5", reply: textReply, params: { effort: "none" } });
  expect(thinkingOf(opus.sent)).toMatchObject({ type: "adaptive" });
  expect(opus.sent.body["output_config"]).toMatchObject({ effort: "low" });
  expect(opus.turn.appliedEffort).toBe("low");
  expect(warningCodes(opus.turn.events)).toContain(WARNING_CODE.reasoningMandatoryClamp);

  const sonnet = await drive({ model: "claude-sonnet-5-5", reply: textReply, params: { effort: "none", carryReasoning: "conversation" } });
  expect(thinkingOf(sonnet.sent)).toEqual({ type: "between_tools" });
  // The SDK rewrites a `disabled` on this id itself and announces it, so its silence shows the wire spelled the request first.
  expect(warningCodes(sonnet.turn.events)).not.toContain(WARNING_CODE.sdkUnsupportedSetting);
  expect(sonnet.sent.body["output_config"]).toBeUndefined();
  expect(sonnet.turn.appliedEffort).toBe("none");

  const level = await drive({ model: "claude-sonnet-5-5", reply: textReply, params: { effort: "xhigh" } });
  expect(thinkingOf(level.sent)).toMatchObject({ type: "adaptive", display: "summarized" });
  expect(level.sent.body["output_config"]).toMatchObject({ effort: "xhigh" });

  const control = await drive({ model: "claude-sonnet-5", reply: textReply, params: { effort: "none" } });
  expect(thinkingOf(control.sent)).toEqual({ type: "disabled" });
  expect(control.turn.appliedEffort).toBe("none");
});

test("carry on a prefix-bound model asks the API to drop a stale thinking block, and nowhere else", async () => {
  const bound = ["claude-opus-5-5", "claude-fable-5-1"];
  for (const model of bound) {
    for (const carryReasoning of ["conversation", "tool-chain"] as const) {
      const { sent } = await drive({ model, reply: textReply, params: { effort: "high", carryReasoning } });
      expect(thinkingOf(sent), `${model} ${carryReasoning}`).toMatchObject({
        type: "adaptive",
        ["block_binding"]: { ["prefix_mismatch_behavior"]: "drop_block" },
      });
    }
  }
  const noCarry = await drive({ model: "claude-opus-5-5", reply: textReply, params: { effort: "high", carryReasoning: "off" } });
  expect(thinkingOf(noCarry.sent)).not.toHaveProperty("block_binding");
  const notBound = await drive({ model: "claude-opus-5", reply: textReply, params: { effort: "high", carryReasoning: "conversation" } });
  expect(thinkingOf(notBound.sent)).not.toHaveProperty("block_binding");
});

test("an unmeasured Claude id with the carry on fails closed under the binding beta, and a measured older id keeps its wire", async () => {
  for (const model of ["claude-opus-5-6", "claude-sonnet-5-1", "claude-fable-5-2", "claude-opus-5-20261104"]) {
    const { sent } = await drive({ model, reply: textReply, params: { effort: "high", carryReasoning: "conversation" } });
    expect(thinkingOf(sent), model).toMatchObject({ type: "adaptive", ["block_binding"]: { ["prefix_mismatch_behavior"]: "drop_block" } });
    expect(sent.headers["anthropic-beta"], model).toContain("thinking-binding-controls");
  }
  for (const model of ["claude-opus-5", "claude-opus-4-5", "claude-opus-4-1-20250805"]) {
    const { sent } = await drive({ model, reply: textReply, params: { effort: "high", carryReasoning: "conversation" } });
    expect(thinkingOf(sent), model).not.toHaveProperty("block_binding");
    expect(sent.headers["anthropic-beta"] ?? "", model).not.toContain("thinking-binding-controls");
  }
});

test("a thinking block the API dropped for a prefix mismatch is counted on the record and raised as an operator alarm, and a clean turn raises none", async () => {
  const paths = ["messages.1.content.0", "messages.3.content.0"];
  const transformations = paths.map((path) => ({ type: "thinking_dropped", path, reason: "prefix_binding_mismatch" }));
  const params = { effort: "high", carryReasoning: "conversation" } satisfies UserIntent;

  const dropped = await drive({ model: "claude-fable-5-1", reply: (model) => textReply(model, "ok", transformations), params });
  expect(dropped.turn.providerMetadata).toMatchObject({ provider: "anthropic", thinkingDropped: 2 });
  expect(dropped.errorLog.find((line) => line["event"] === "provider.thinking_dropped")).toMatchObject({ dropped: 2, paths, model: "claude-fable-5-1" });

  const clean = await drive({ model: "claude-fable-5-1", reply: (model) => textReply(model, "ok", []), params });
  expect(clean.turn.providerMetadata).toMatchObject({ provider: "anthropic", thinkingDropped: 0 });
  expect(clean.errorLog.some((line) => line["event"] === "provider.thinking_dropped")).toBe(false);
});

test("a turn-scoped system cue after a user row reaches the wire with clear_at under its beta", async () => {
  const { sent } = await drive({
    model: "claude-fable-5-1",
    reply: textReply,
    history: [
      { role: "user", content: [{ type: "text", text: "Where to?" }] },
      { role: "system", content: [{ type: "text", text: "CUE" }], wireMeta: { clearAt: "next_user_message" } },
    ],
  });

  expect(sent.body["messages"]).toMatchObject([{ role: "user" }, { role: "system", ["clear_at"]: "next_user_message" }]);
  expect(sent.headers["anthropic-beta"]).toContain("mid-conversation-system-clear-at");
});

test("the per-turn system half stays in system[] beside the cached static block, on a model with mid-conversation system rows and one without", async () => {
  for (const model of ["claude-opus-5", "claude-haiku-4-5"]) {
    const { sent } = await drive({ model, reply: textReply, systemPrompt: { static: "STATIC", dynamic: "DYNAMIC" } });
    expect(sent.body["system"], model).toMatchObject([
      { type: "text", text: "STATIC", ["cache_control"]: { type: "ephemeral" } },
      { type: "text", text: "DYNAMIC" },
    ]);
    expect(JSON.stringify(sent.body["system"]), model).not.toMatch(/DYNAMIC.*cache_control/u);
    expect(JSON.stringify(sent.body["messages"]), model).not.toContain("DYNAMIC");
  }
});

test("the parallel-tool switch off sends disable_parallel_tool_use, and unset sends none", async () => {
  const off = await drive({ model: "claude-opus-5", reply: textReply, tools: [WEATHER], params: { effort: "high", advanced: { parallelToolCalls: false } } });
  expect(off.sent.body["tool_choice"]).toMatchObject({ type: "auto", ["disable_parallel_tool_use"]: true });
  const unset = await drive({ model: "claude-opus-5", reply: textReply, tools: [WEATHER] });
  expect(JSON.stringify(unset.sent.body)).not.toContain("disable_parallel_tool_use");
});

test("the cache marker rides the last tool alone, a tool's strict and input examples reach the wire, and tool input streams eagerly", async () => {
  const tick: WireTool = { name: "tick_clock", description: "d", parameters: { type: "object" }, strict: true, inputExamples: [{ minutes: 30 }] };
  const roll: WireTool = { name: "roll_dice", description: "d", parameters: { type: "object" } };
  const { sent } = await drive({ model: "claude-opus-5", reply: textReply, tools: [tick, roll] });

  const tools = sent.body["tools"];
  if (!Array.isArray(tools)) {
    throw new Error("the turn sent no tools");
  }
  expect(tools[0]).toMatchObject({ name: "tick_clock", strict: true, ["input_examples"]: [{ minutes: 30 }], ["eager_input_streaming"]: true });
  expect(tools[0]).not.toHaveProperty("cache_control");
  expect(tools[1]).toMatchObject({ name: "roll_dice", ["cache_control"]: { type: "ephemeral" } });

  const none = await drive({ model: "claude-opus-5", reply: textReply });
  expect(none.sent.body).not.toHaveProperty("tools");
});

const ESTABLISH_STATES = [false, true].flatMap((location) =>
  [false, true].flatMap((timeOfDay) => [false, true].map((presentCast) => ({ location, timeOfDay, presentCast }))),
);

test("the cheap state round's tools reach the wire under a cached static system block and last tool, and update_scene's input examples validate against the schema sent beside them in every establish state", async () => {
  for (const establishScene of ESTABLISH_STATES) {
    const refs: ExtractionRefs = {
      actorRefs: ["Mira"],
      trackerWriteGroups: [],
      gameTrackerKeys: { deltaKeys: [], setKeys: [] },
      conditionNames: [],
      establishScene,
    };
    const tools = withStateToolExamples(buildToolRoundWireTools(refs, rpgGameConfigSchema.parse({}), {}));
    const { sent } = await drive({
      model: "claude-opus-5",
      reply: textReply,
      tools,
      toolChoice: { mode: "auto" },
      systemPrompt: { static: "STATE ROUND SYSTEM", dynamic: "" },
    });

    const wireTools = sent.body["tools"];
    if (!Array.isArray(wireTools)) {
      throw new Error("the turn sent no tools");
    }
    const scene = wireTools.find((tool) => isPlainObject(tool) && tool["name"] === "update_scene");
    const examples: unknown = isPlainObject(scene) ? scene["input_examples"] : undefined;
    const schema: unknown = isPlainObject(scene) ? scene["input_schema"] : undefined;
    if (!(Array.isArray(examples) && isPlainObject(schema))) {
      throw new Error("update_scene reached the wire without examples or a schema");
    }
    const sentSchema = z.fromJSONSchema(schema);
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(sentSchema.safeParse(example).success, JSON.stringify({ establishScene, example })).toBe(true);
    }
    expect(wireTools.at(-1)).toMatchObject({ ["cache_control"]: { type: "ephemeral" } });
    expect(sent.body["system"]).toMatchObject([{ type: "text", text: "STATE ROUND SYSTEM", ["cache_control"]: { type: "ephemeral" } }]);
  }
});

test("the provider's rate-limit headers become the turn's snapshot, and the message id is the generation id", async () => {
  const headers = {
    "anthropic-ratelimit-requests-limit": "5000",
    "anthropic-ratelimit-requests-remaining": "4999",
    "anthropic-ratelimit-requests-reset": RESET,
    "anthropic-ratelimit-tokens-limit": "6000000",
    "anthropic-ratelimit-tokens-remaining": "1500000",
    "anthropic-ratelimit-tokens-reset": RESET,
  };
  const { turn } = await drive({ model: "claude-opus-5", reply: textReply, headers });
  expect(turn.rateLimit).toMatchObject({ status: "allowed", rateLimitType: "tokens", resetsAt: Date.parse(RESET) });
  expect(turn.rateLimit?.utilization).toBeCloseTo(0.75);
  expect(turn.generationId).toBe("msg_wire");

  const bare = await drive({ model: "claude-opus-5", reply: textReply });
  expect(bare.turn.rateLimit).toBeNull();
});

test("a classifier block is a filter finish with a refusal event carrying its category, and a plain end carries none", async () => {
  const { turn } = await drive({ model: "claude-fable-5-1", reply: refusalReply });
  expect(turn.finishReason).toBe("filter");
  expect(turn.stopReason).toBe("refusal");
  expect(turn.events.find((event) => event.kind === "refusal")).toMatchObject({
    kind: "refusal",
    model: "claude-fable-5-1",
    category: "cyber",
    explanation: "blocked under the Usage Policy",
    retried: false,
    fallbackModel: null,
  });

  const plain = await drive({ model: "claude-fable-5-1", reply: textReply });
  expect(plain.turn.events.some((event) => event.kind === "refusal")).toBe(false);
});
