// The outbound body of an openai-compat chat turn, read at the provider edge: the user's own body (extras,
// includeBody, excludeBody) is the last word, and every computed key leaves a key they settled alone.
// @subject packages/inference/src/backends/openai-compat/body.ts
import { toolCallIdSchema } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import { connectionExtrasSchema, DEFAULT_ATTACHMENT_QUALITY, isBeltOwnedBodyKey, providerIdSchema, WARNING_CODE } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatEvent, ChatHistoryMessage } from "@orb/inference";
import { isPlainObject } from "@orb/kit/guards";
import type { JsonObject } from "@orb/kit/json";
import { jsonObjectSchema } from "@orb/kit/json";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { openAiServer, recordRequest, warningCodes } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { PROVIDER_CACHE_EVENT } from "#inference/backends/http/provider-log.ts";
import { createRuntimeRoot, generationCapability, wireConnection } from "../../roles/runtime.fixtures.ts";

type Connection = Parameters<typeof wireConnection<"chat">>[1];

const SYSTEM_TEXT = "You are a fixture.";
const USER_TEXT = "Hello.";
const USER_LINE: ChatHistoryMessage = { role: "user", content: [{ type: "text", text: USER_TEXT }] };
const ASSISTANT_OPENING: ChatHistoryMessage = { role: "assistant", content: [{ type: "text", text: "Once upon a" }] };

interface Sent {
  readonly url: string;
  readonly body: RecordedRequest["body"];
  readonly events: readonly ChatEvent[];
  /** The root ring's log lines at turn end — the `provider.*` receipts ride them. */
  readonly receipts: readonly string[];
}

/** One chat turn against a scripted openai-compatible endpoint; what the endpoint received and what the turn reported. */
async function send(
  row: Omit<Connection, "task" | "model" | "providerId"> & { readonly providerId?: ProviderId; readonly model?: string },
  options: {
    readonly params?: UserIntent;
    readonly history?: readonly ChatHistoryMessage[];
    readonly responseFormat?: ResponseFormat;
    readonly prefillReasoning?: string;
    readonly cacheBreakpointDepth?: number;
  } = {},
): Promise<Sent> {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => ({}));
  await using root = await createRuntimeRoot({ providerFetch: server.execute, logLevel: "debug" });
  const connection = await wireConnection(root, { ...row, task: "chat", providerId: row.providerId ?? "custom-openai", model: row.model ?? "shaping-model" });
  const turn = await root.app.runtime.executor.runChatTurn({
    signal: new AbortController().signal,
    api: "chat-completions",
    connection,
    params: options.params ?? {},
    systemPrompt: { static: SYSTEM_TEXT, dynamic: "" },
    history: options.history ?? [USER_LINE],
    ...(options.responseFormat === undefined ? {} : { responseFormat: options.responseFormat }),
    ...(options.prefillReasoning === undefined ? {} : { prefillReasoning: options.prefillReasoning }),
    ...(options.cacheBreakpointDepth === undefined ? {} : { cacheBreakpointDepth: options.cacheBreakpointDepth }),
  });
  const [first] = recorded;
  if (first === undefined) {
    throw new Error("the turn reached no endpoint");
  }
  return { url: first.url, body: first.body, events: turn.events, receipts: root.observability.logLines(1000) };
}

function ignoredKeys(events: readonly ChatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "warning" && event.code === WARNING_CODE.customParametersIgnored ? [String(event.key)] : []));
}

const NO_THINKING_SWITCH = generationCapability({ reasoning: { mode: "none", enabled: false } });
const EFFORT = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] } });

test("a minimal turn sends exactly one request body on each transport, so a provider SDK upgrade that reshapes any field fails here", async () => {
  const params = { effort: "high" } satisfies UserIntent;
  const compatible = await send({ capability: EFFORT, declaredFeatures: { effort: "reasoning_effort" } }, { params });
  expect(compatible.body).toEqual({
    model: "shaping-model",
    ["reasoning_effort"]: "high",
    messages: [
      { role: "system", content: SYSTEM_TEXT },
      { role: "user", content: USER_TEXT },
    ],
    stream: true,
    ["stream_options"]: { ["include_usage"]: true },
    ["chat_template_kwargs"]: { ["enable_thinking"]: true, ["preserve_reasoning"]: false },
  });

  const openRouter = await send(
    { providerId: providerIdSchema.parse("openrouter"), model: "anthropic/claude-opus-4-5", capability: generationCapability() },
    { params },
  );
  expect(openRouter.body).toEqual({
    model: "anthropic/claude-opus-4-5",
    messages: [
      { role: "system", content: [{ type: "text", text: SYSTEM_TEXT, ["cache_control"]: { type: "ephemeral", ttl: "1h" } }] },
      { role: "user", content: USER_TEXT },
    ],
    reasoning: { effort: "high" },
    usage: { include: true },
    stream: true,
    ["stream_options"]: { ["include_usage"]: true },
    provider: { order: ["Anthropic"], ["allow_fallbacks"]: false },
    plugins: [{ id: "context-compression", enabled: false }],
  });
});

test("the connection's own body beats the preset knob and a computed key, a belt-owned key is dropped by name, and a fresh key rides", async () => {
  const belt = ["model", "stream", "messages"] as const;
  for (const key of belt) {
    expect(isBeltOwnedBodyKey(key)).toBe(true);
  }
  const preset = { temperature: 0.7 };
  const control = await send({ capability: NO_THINKING_SWITCH }, { params: preset });
  expect(control.body["temperature"]).toBe(0.7);

  const sent = await send(
    { capability: NO_THINKING_SWITCH, extras: { model: "evil", stream: false, messages: [], temperature: 1.2, ["mirostat_tau"]: 5 } },
    { params: preset },
  );

  expect(sent.body["temperature"]).toBe(1.2);
  expect(sent.body["mirostat_tau"]).toBe(5);
  expect(sent.body["model"]).toBe(control.body["model"]);
  expect(sent.body["stream"]).toBe(true);
  expect(sent.body["messages"]).toEqual(control.body["messages"]);
  expect(ignoredKeys(sent.events).toSorted()).toEqual([...belt].toSorted());
  expect(ignoredKeys(control.events)).toEqual([]);
});

test("the OpenRouter transport takes only the keys it models off the connection's extras and names every other one it drops", async () => {
  const sent = await send({
    providerId: providerIdSchema.parse("openrouter"),
    capability: NO_THINKING_SWITCH,
    extras: { provider: { order: ["Anthropic"] }, ["chat_template_kwargs"]: { ["enable_thinking"]: false }, ["mirostat_tau"]: 5 },
  });

  expect(ignoredKeys(sent.events).toSorted()).toEqual(["chat_template_kwargs", "mirostat_tau"]);
  expect(sent.body).not.toHaveProperty("chat_template_kwargs");
  expect(sent.body).not.toHaveProperty("mirostat_tau");
  expect(sent.body["provider"]).toMatchObject({ order: ["Anthropic"] });
});

test("a prototype-pollution key in the connection's body never lands on the wire, at any depth", async () => {
  const poisoned = connectionExtrasSchema.parse(JSON.parse('{"__proto__": {"polluted": true}, "nested": {"constructor": {"prototype": {"x": 1}}, "ok": 1}}'));
  const sent = await send({ capability: NO_THINKING_SWITCH, extras: poisoned });

  const nested = sent.body["nested"];
  expect(nested).toEqual({ ok: 1 });
  expect(Object.hasOwn(sent.body, "__proto__")).toBe(false);
  expect(Object.hasOwn(new Object(nested), "constructor")).toBe(false);
  expect(Object.hasOwn(sent.body, "polluted")).toBe(false);
});

test("includeBody replaces a modelled field and an extra whole, and excludeBody still drops a key the overrides set", async () => {
  const sent = await send(
    {
      capability: NO_THINKING_SWITCH,
      extras: { ["top_k"]: 40 },
      transport: { includeBody: { temperature: 0.1, ["top_k"]: 10, stop: { replaced: true }, seed: 7 }, excludeBody: ["seed"] },
    },
    { params: { temperature: 0.7, stop: ["</s>"] } },
  );

  expect(sent.body["temperature"]).toBe(0.1);
  expect(sent.body["top_k"]).toBe(10);
  expect(sent.body["stop"]).toEqual({ replaced: true });
  expect(sent.body).not.toHaveProperty("seed");
});

test("the output cap keeps the row's word, and a cap the user's body states stands over the rename", async () => {
  const declaredFeatures = { outputCapField: "max_completion_tokens" } as const;
  const params = { maxOutputTokens: 512 };
  const renamed = await send({ capability: NO_THINKING_SWITCH, declaredFeatures }, { params });
  expect(renamed.body["max_completion_tokens"]).toBe(512);
  expect(renamed.body).not.toHaveProperty("max_tokens");

  const fromExtras = await send({ capability: NO_THINKING_SWITCH, declaredFeatures, extras: { ["max_completion_tokens"]: 4096 } }, { params });
  expect(fromExtras.body["max_completion_tokens"]).toBe(4096);
  expect(fromExtras.body).not.toHaveProperty("max_tokens");

  const fromInclude = await send({ capability: NO_THINKING_SWITCH, declaredFeatures, transport: { includeBody: { ["max_tokens"]: 50 } } }, { params });
  expect(fromInclude.body["max_tokens"]).toBe(50);
  expect(fromInclude.body).not.toHaveProperty("max_completion_tokens");

  const excluded = await send({ capability: NO_THINKING_SWITCH, declaredFeatures, transport: { excludeBody: ["max_completion_tokens"] } }, { params });
  expect(excluded.body).not.toHaveProperty("max_completion_tokens");
  expect(excluded.body).not.toHaveProperty("max_tokens");
});

test("a reasoning-off turn tells the template not to think and zeroes the budget, and the user's own thinking switch outranks both", async () => {
  const off = { effort: "none" } satisfies UserIntent;
  const control = await send({ providerId: providerIdSchema.parse("vllm"), capability: EFFORT }, { params: off });
  expect(control.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false });
  expect(control.body["thinking_token_budget"]).toBe(0);

  const keepsTheirKwargs = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["custom_flag"]: "x" } } },
    { params: off },
  );
  expect(keepsTheirKwargs.body["chat_template_kwargs"]).toMatchObject({ ["custom_flag"]: "x", ["enable_thinking"]: false });

  const theirsOn = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["enable_thinking"]: true } } },
    { params: off },
  );
  expect(theirsOn.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: true });
  expect(theirsOn.body).not.toHaveProperty("thinking_token_budget");

  const excluded = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, transport: { excludeBody: ["chat_template_kwargs"] } },
    { params: off },
  );
  expect(excluded.body).not.toHaveProperty("chat_template_kwargs");
  expect(excluded.body).not.toHaveProperty("thinking_token_budget");

  const theirBudget = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, extras: { ["thinking_token_budget"]: 256 } },
    { params: off },
  );
  expect(theirBudget.body["thinking_token_budget"]).toBe(256);
});

const prefillCapability = (): ReturnType<typeof generationCapability> =>
  generationCapability({
    reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] },
    turns: { assistantPrefill: true, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: false },
  });

test("a delivered prefill sends the continue pair and turns thinking off for the server, unless the user's body decides the prefill", async () => {
  const prefill = prefillCapability();
  const history = [USER_LINE, ASSISTANT_OPENING];
  const params = { effort: "high" } satisfies UserIntent;

  const pair = await send({ providerId: providerIdSchema.parse("vllm"), capability: prefill }, { params, history });
  expect(pair.body["continue_final_message"]).toBe(true);
  expect(pair.body["add_generation_prompt"]).toBe(false);
  expect(pair.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false });
  expect(pair.body).not.toHaveProperty("reasoning_effort");
  expect(warningCodes(pair.events)).toContain(WARNING_CODE.reasoningDroppedForPrefill);

  const noPrefillTurn = await send({ providerId: providerIdSchema.parse("vllm"), capability: prefill }, { params, history: [USER_LINE] });
  expect(noPrefillTurn.body).not.toHaveProperty("continue_final_message");
  expect(warningCodes(noPrefillTurn.events)).not.toContain(WARNING_CODE.reasoningDroppedForPrefill);

  const theirDecision = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: prefill, transport: { excludeBody: ["continue_final_message"] } },
    { params, history },
  );
  expect(theirDecision.body).not.toHaveProperty("continue_final_message");
  expect(theirDecision.body).not.toHaveProperty("add_generation_prompt");
  expect(warningCodes(theirDecision.events)).not.toContain(WARNING_CODE.reasoningDroppedForPrefill);
});

test("a messages array the user's body sets is theirs whole: the plan's prefill pair and interlock never touch it", async () => {
  const prefill = prefillCapability();
  const theirs = [{ role: "user", content: "Their own row." }];
  const params = { effort: "high" } satisfies UserIntent;
  const history = [USER_LINE, ASSISTANT_OPENING];

  const control = await send({ providerId: providerIdSchema.parse("vllm"), capability: prefill }, { params, history });
  expect(control.body["continue_final_message"]).toBe(true);

  const owned = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: prefill, transport: { includeBody: { messages: theirs } } },
    { params, history },
  );
  expect(owned.body["messages"]).toEqual(theirs);
  expect(owned.body).not.toHaveProperty("continue_final_message");
  expect(owned.body).not.toHaveProperty("add_generation_prompt");
  expect(owned.body["reasoning_effort"]).toBe("high");
  expect(warningCodes(owned.events)).not.toContain(WARNING_CODE.reasoningDroppedForPrefill);
});

test("a reasoning-on turn tells the template to think, but never over an off the user's own body already set", async () => {
  const on = { effort: "high" } satisfies UserIntent;
  const thinks = await send({ providerId: providerIdSchema.parse("vllm"), capability: EFFORT }, { params: on });
  expect(thinks.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: true });

  const theirOff = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["enable_thinking"]: false } } },
    { params: on },
  );
  expect(theirOff.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false });
});

test("an effort the row cannot spell is dropped with a warning, and one the user's body sets stays", async () => {
  const params = { effort: "high" } satisfies UserIntent;
  const dropped = await send({ capability: EFFORT }, { params });
  expect(dropped.body).not.toHaveProperty("reasoning_effort");
  expect(warningCodes(dropped.events)).toContain(WARNING_CODE.effortDropped);

  const theirs = await send({ capability: EFFORT, extras: { ["reasoning_effort"]: "low" } }, { params });
  expect(theirs.body["reasoning_effort"]).toBe("low");

  const spelled = await send({ providerId: providerIdSchema.parse("vllm"), capability: EFFORT }, { params });
  expect(spelled.body["reasoning_effort"]).toBe("high");
});

test("a turn whose reasoning carry is off tells the template not to replay thinking, beside the user's kwargs and never over their decision", async () => {
  const params = { effort: "high", carryReasoning: "off" } satisfies UserIntent;
  const replaying = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], replay: "text" } });
  const control = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: replaying },
    { params: { effort: "high", carryReasoning: "conversation" } },
  );
  expect(control.body["chat_template_kwargs"]).not.toHaveProperty("preserve_reasoning");

  const carried = await send({ providerId: providerIdSchema.parse("vllm"), capability: EFFORT }, { params });
  expect(carried.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: true, ["preserve_reasoning"]: false });

  const theirKwargs = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["custom_flag"]: "x" } } },
    { params },
  );
  expect(theirKwargs.body["chat_template_kwargs"]).toMatchObject({ ["custom_flag"]: "x", ["preserve_reasoning"]: false });

  const theirKey = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, extras: { ["chat_template_kwargs"]: { ["preserve_reasoning"]: true } } },
    { params },
  );
  expect(theirKey.body["chat_template_kwargs"]).toMatchObject({ ["preserve_reasoning"]: true });

  const excluded = await send(
    { providerId: providerIdSchema.parse("vllm"), capability: EFFORT, transport: { excludeBody: ["chat_template_kwargs"] } },
    { params },
  );
  expect(excluded.body).not.toHaveProperty("chat_template_kwargs");
});

test("template kwargs the user set to a non-object are theirs whole: no thinking switch, budget or preserve key merges into them", async () => {
  const off = { effort: "none", carryReasoning: "off" } satisfies UserIntent;
  const control = await send({ providerId: providerIdSchema.parse("vllm"), capability: EFFORT }, { params: off });
  expect(control.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: false, ["preserve_reasoning"]: false });
  expect(control.body["thinking_token_budget"]).toBe(0);

  const theirs = await send({ providerId: providerIdSchema.parse("vllm"), capability: EFFORT, extras: { ["chat_template_kwargs"]: "raw" } }, { params: off });
  expect(theirs.body["chat_template_kwargs"]).toBe("raw");
  expect(theirs.body).not.toHaveProperty("thinking_token_budget");
});

const SEES_IMAGES = generationCapability({
  imageDetail: true,
  input: ["text", "image"],
  output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text", "image"] },
});

function wireRows(body: RecordedRequest["body"]): readonly Record<string, unknown>[] {
  const rows = body["messages"];
  if (!Array.isArray(rows)) {
    throw new Error("the endpoint received no messages array");
  }
  return rows.flatMap((row) => (isPlainObject(row) ? [row] : []));
}

/** The `function` block of the planned tool at `index`, narrowed by the guards like `wireRows`, never asserted. */
function wireTool(body: RecordedRequest["body"], index: number): Record<string, unknown> | undefined {
  const tools = body["tools"];
  if (!Array.isArray(tools)) {
    throw new Error("the endpoint received no tools array");
  }
  const tool = tools[index];
  return isPlainObject(tool) && isPlainObject(tool["function"]) ? tool["function"] : undefined;
}

test("participant names, a prior reply's image and the image detail ride the wire rows, and a messages array the user set takes none of them", async () => {
  const picture = "data:image/png;base64,AAAA";
  const history: ChatHistoryMessage[] = [
    {
      role: "user",
      name: "Mira",
      content: [
        { type: "text", text: "Look." },
        { type: "image", url: picture },
      ],
    },
    {
      role: "assistant",
      name: "Aria",
      content: [
        { type: "text", text: "Seen." },
        { type: "image", url: picture },
      ],
    },
    { role: "user", content: [{ type: "text", text: "Again." }] },
  ];
  const sent = await send({ capability: SEES_IMAGES }, { history });
  const [, first, second] = wireRows(sent.body);
  expect(first?.["name"]).toBe("Mira");
  expect(second?.["name"]).toBe("Aria");
  const imageParts = wireRows(sent.body)
    .flatMap((row) => (Array.isArray(row["content"]) ? row["content"] : []))
    .filter((part) => typeof part === "object" && part !== null && "image_url" in part);
  expect(imageParts).toHaveLength(2);
  for (const part of imageParts) {
    expect(part).toMatchObject({ ["image_url"]: { url: picture, detail: DEFAULT_ATTACHMENT_QUALITY.imageDetail } });
  }

  const theirs = [{ role: "user", content: "Their own row." }];
  const owned = await send({ capability: SEES_IMAGES, transport: { includeBody: { messages: theirs } } }, { history });
  expect(owned.body["messages"]).toEqual(theirs);
});

const CACHEABLE = generationCapability({
  turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
});
// The curated openai rows' spelling for a user who TURNED explicit caching on: the default-enabled fact
// (resolve-task reads it into `promptSettings.enabled`; the curated rows ship it `false`) and a placement
// floor lowered off the fixture's tiny rows — the placement arithmetic, not the token estimate, is what
// the receipt arm pins.
const OPENAI_SPELLING = generationCapability({
  turns: {
    assistantPrefill: false,
    midConversationSystem: false,
    historySystemRows: false,
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    promptCacheFormat: "openai-breakpoint",
    promptCacheDefaultEnabled: true,
    cacheMinTokens: 1,
  },
});
const ANTHROPIC_ON_OPENROUTER = { providerId: providerIdSchema.parse("openrouter"), model: "anthropic/claude-sonnet-4.5", capability: CACHEABLE } as const;
const MARKED = { cacheBreakpoint: true } as const;

function contentOf(body: RecordedRequest["body"], index: number): unknown {
  return wireRows(body)[index]?.["content"];
}

test("an OpenRouter cache marker rides its row's last text part, and a row with no text hands it to the nearest earlier row with text", async () => {
  const withText: ChatHistoryMessage[] = [
    { role: "user", content: [{ type: "text", text: "One." }] },
    { role: "assistant", wireMeta: MARKED, content: [{ type: "text", text: "Two." }] },
    { role: "user", content: [{ type: "text", text: "Three." }] },
  ];
  const own = await send(ANTHROPIC_ON_OPENROUTER, { history: withText });
  expect(contentOf(own.body, 2)).toEqual([expect.objectContaining({ text: "Two.", ["cache_control"]: expect.anything() })]);
  expect(contentOf(own.body, 1)).toBe("One.");

  const toolCallOnly: ChatHistoryMessage[] = [
    { role: "user", content: [{ type: "text", text: "One." }] },
    { role: "assistant", wireMeta: MARKED, content: [{ type: "tool-call", toolCallId: toolCallIdSchema.parse("c1"), name: "look", arguments: "{}" }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: toolCallIdSchema.parse("c1"), content: "{}" }] },
    { role: "user", content: [{ type: "text", text: "Three." }] },
  ];
  const moved = await send(ANTHROPIC_ON_OPENROUTER, { history: toolCallOnly });
  expect(contentOf(moved.body, 1)).toEqual([expect.objectContaining({ text: "One.", ["cache_control"]: expect.anything() })]);
  expect(wireRows(moved.body)[2]).not.toHaveProperty("cache_control");
  expect(wireRows(moved.body)[2]?.["content"]).toBeNull();
});

/** The last `provider.*` line of this event the root ring holds, fields parsed off the JSON line. */
function lastReceipt(lines: readonly string[], event: string): JsonObject {
  const matching = lines.filter((line) => line.includes(`"event":"${event}"`));
  const last = matching.at(-1);
  if (last === undefined) {
    throw new Error(`no ${event} line in the root ring (${lines.length} lines captured)`);
  }
  return jsonObjectSchema.parse(JSON.parse(last));
}

// The `provider.cache` receipt used to be gated on `dialect === "openrouter"` while the PLACER is gated on
// the resolved plan — so exactly the rows the curator spells `prompt_cache_breakpoint` themselves (the
// curated openai rows) placed real breakpoints, had the span count them, and emitted no log line. The
// gate is now the placement; this is the pin that keeps it there.
test("the provider.cache receipt fires on placement, not dialect: a plain openai-compatible row that spells the breakpoint format gets the line", async () => {
  const history: ChatHistoryMessage[] = [
    { role: "user", content: [{ type: "text", text: "One." }] },
    { role: "assistant", content: [{ type: "text", text: "Two." }] },
    { role: "user", content: [{ type: "text", text: "Three." }] },
  ];
  const sent = await send(
    { capability: OPENAI_SPELLING, promptCache: { enabled: true, cacheSystem: false, historyDepth: null, ttl: "1h" } },
    { history, cacheBreakpointDepth: 1 },
  );
  // The wire bytes first: the placed breakpoint was translated to the provider's spelling.
  expect(JSON.stringify(sent.body), "the breakpoint was sent in the openai spelling").toContain("prompt_cache_breakpoint");
  const cache = lastReceipt(sent.receipts, PROVIDER_CACHE_EVENT);
  expect(cache["breakpointsPlaced"], "the receipt counts the breakpoint the placer wrote").toBe(1);
});

test("same-role rows fold into one message of parts on a block-end-preserving prefix, each marker on its own part, and stay separate elsewhere", async () => {
  const history: ChatHistoryMessage[] = [
    { role: "user", content: [{ type: "text", text: "One." }] },
    { role: "user", wireMeta: MARKED, content: [{ type: "text", text: "Uno." }] },
    { role: "assistant", content: [{ type: "text", text: "Two." }] },
    { role: "user", content: [{ type: "text", text: "Three." }] },
  ];
  const folded = await send(ANTHROPIC_ON_OPENROUTER, { history });
  expect(contentOf(folded.body, 1)).toEqual([{ type: "text", text: "One." }, expect.objectContaining({ text: "Uno.", ["cache_control"]: expect.anything() })]);
  expect(wireRows(folded.body)).toHaveLength(4);

  const plain = await send({ capability: CACHEABLE }, { history });
  expect(wireRows(plain.body)).toHaveLength(5);
});

test("a named row, a tool-call row and a replayed-reasoning row keep their own message when same-role rows fold", async () => {
  const replaying = generationCapability({
    reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], replay: "text" },
    turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
  });
  const history: ChatHistoryMessage[] = [
    { role: "user", content: [{ type: "text", text: "One." }] },
    { role: "user", name: "Mira", content: [{ type: "text", text: "Two." }] },
    { role: "assistant", content: [{ type: "text", text: "Three." }] },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: toolCallIdSchema.parse("c1"), name: "look", arguments: "{}" }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: toolCallIdSchema.parse("c1"), content: "{}" }] },
    { role: "assistant", content: [{ type: "text", text: "Four." }] },
    {
      role: "assistant",
      content: [
        { type: "reasoning", text: "A thought.", meta: { openrouter: { reasoningDetails: [{ type: "reasoning.text", text: "A thought." }] } } },
        { type: "text", text: "Five." },
      ],
    },
    { role: "user", content: [{ type: "text", text: "Six." }] },
  ];
  const sent = await send({ ...ANTHROPIC_ON_OPENROUTER, capability: replaying }, { history, params: { effort: "high", carryReasoning: "conversation" } });
  const rows = wireRows(sent.body);
  // Nothing folded: every history row is still its own wire message, in order, after the system row.
  expect(rows.map((row) => row["role"])).toEqual(["system", "user", "user", "assistant", "assistant", "tool", "assistant", "assistant", "user"]);
  expect(rows[2]?.["name"]).toBe("Mira");
  expect(rows[4]).toHaveProperty("tool_calls");
});

test("a plain same-role pair folds beside the rows that keep their own message", async () => {
  const history: ChatHistoryMessage[] = [
    { role: "user", content: [{ type: "text", text: "One." }] },
    { role: "user", content: [{ type: "text", text: "Two." }] },
    { role: "user", name: "Mira", content: [{ type: "text", text: "Three." }] },
  ];
  const sent = await send(ANTHROPIC_ON_OPENROUTER, { history });
  expect(wireRows(sent.body).map((row) => row["role"])).toEqual(["system", "user", "user"]);
});

test("an image detail is stamped only where the capability admits one", async () => {
  const picture = "data:image/png;base64,AAAA";
  const history: ChatHistoryMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Look." },
        { type: "image", url: picture },
      ],
    },
  ];
  const without = generationCapability({ input: ["text", "image"] });
  const sent = await send({ capability: without }, { history });
  const images = wireRows(sent.body)
    .flatMap((row) => (Array.isArray(row["content"]) ? row["content"] : []))
    .filter((part) => typeof part === "object" && part !== null && "image_url" in part);
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ ["image_url"]: { url: picture } });
  expect(images[0]).not.toHaveProperty("image_url.detail");

  const admits = await send({ capability: SEES_IMAGES }, { history });
  expect(JSON.stringify(admits.body["messages"])).toContain(DEFAULT_ATTACHMENT_QUALITY.imageDetail);
});

test("a messages array the user set keeps its own cache marker where they put it", async () => {
  const theirs = [{ role: "user", content: [{ type: "text", text: "Their row." }], ["cache_control"]: { type: "ephemeral" } }];
  const history: ChatHistoryMessage[] = [{ role: "user", wireMeta: MARKED, content: [{ type: "text", text: "Ours." }] }];
  const sent = await send({ ...ANTHROPIC_ON_OPENROUTER, transport: { includeBody: { messages: theirs } } }, { history });
  expect(sent.body["messages"]).toEqual(theirs);
});

test("a reply that may carry an image asks for both modalities, and the user's own modalities stand", async () => {
  const wants = { replyMedia: "text+image" } satisfies UserIntent;
  const control = await send({ capability: SEES_IMAGES }, { params: {} });
  expect(control.body).not.toHaveProperty("modalities");

  const asked = await send({ capability: SEES_IMAGES }, { params: wants });
  expect(asked.body["modalities"]).toEqual(["text", "image"]);

  const theirs = await send({ capability: SEES_IMAGES, extras: { modalities: ["text"] } }, { params: wants });
  expect(theirs.body["modalities"]).toEqual(["text"]);
});

test("a mandatory-reasoning model keeps its thinking and its effort through a delivered prefill", async () => {
  const mandatory = generationCapability({
    reasoning: { mode: "effort", enabled: true, mandatory: true, effortLevels: ["low", "medium", "high"] },
    turns: { assistantPrefill: true, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: false },
  });
  const params = { effort: "high" } satisfies UserIntent;
  const history = [USER_LINE, ASSISTANT_OPENING];

  const sent = await send({ providerId: providerIdSchema.parse("vllm"), capability: mandatory }, { params, history });
  expect(sent.body["continue_final_message"]).toBe(true);
  expect(sent.body["chat_template_kwargs"]).toMatchObject({ ["enable_thinking"]: true });
  expect(sent.body["reasoning_effort"]).toBe("high");
  expect(warningCodes(sent.events)).not.toContain(WARNING_CODE.reasoningDroppedForPrefill);
});

test("the shipped deepseek row spells effort words literally, turns thinking off with `none`, and never writes template kwargs", async () => {
  const deepseek = providerIdSchema.parse("deepseek");
  const capability = generationCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "high", "max"] } });

  const on = await send({ providerId: deepseek, capability }, { params: { effort: "high" } });
  expect(on.body["reasoning_effort"]).toBe("high");
  expect(on.body).not.toHaveProperty("chat_template_kwargs");

  // The row's `effortMaxLiteral`: our `max` rides the wire as the word the vendor spells, not the V4 `xhigh`
  // mapping — DeepSeek's own enum includes `max` and silently down-maps `xhigh`.
  const max = await send({ providerId: deepseek, capability }, { params: { effort: "max" } });
  expect(max.body["reasoning_effort"]).toBe("max");

  const mapped = await send({ capability, declaredFeatures: { effort: "reasoning_effort" } }, { params: { effort: "max" } });
  expect(mapped.body["reasoning_effort"]).toBe("xhigh");

  // `thinkingOff: "reasoning_effort"`: the off is the effort word itself, no kwargs beside it.
  const off = await send({ providerId: deepseek, capability }, { params: { effort: "none" } });
  expect(off.body["reasoning_effort"]).toBe("none");
  expect(off.body).not.toHaveProperty("chat_template_kwargs");
});

test("a `prefix-flag` row stamps the converted trailing assistant row and rides that turn on the beta route alone", async () => {
  const deepseek = providerIdSchema.parse("deepseek");
  const prefill = prefillCapability();
  const params = { effort: "high" } satisfies UserIntent;
  const history = [USER_LINE, ASSISTANT_OPENING];

  const stamped = await send({ providerId: deepseek, capability: prefill }, { params, history });
  expect(wireRows(stamped.body).at(-1)).toMatchObject({ role: "assistant", content: "Once upon a", prefix: true });
  expect(stamped.url).toContain("/beta/v1/chat/completions");

  // The route and the stamp share the prefill gate: a turn that does not end on an assistant row keeps the
  // prod base and gets no stamp anywhere in the array.
  const plain = await send({ providerId: deepseek, capability: prefill }, { params, history: [USER_LINE] });
  expect(plain.url).not.toContain("/beta");
  expect(JSON.stringify(plain.body["messages"])).not.toContain("prefix");

  // A `messages` array the user owns is never stamped, but the route is the stamping gate's superset: the
  // turn still rides `/beta`, where both spellings answer.
  const theirs = [{ role: "user", content: "Their own row." }];
  const owned = await send({ providerId: deepseek, capability: prefill, transport: { includeBody: { messages: theirs } } }, { params, history });
  expect(owned.body["messages"]).toEqual(theirs);
  expect(owned.url).toContain("/beta/v1/chat/completions");
});

// The steered chain of thought (`prefillReasoning`, `docs/law/deepseek-api-surface.md` "Assistant prefill and
// continuation"): the seeded `reasoning_content` on the continue row IS the model's thinking — measured 6/6, the
// answer follows the seed and the model writes no reasoning of its own. Red-proof: lift the seed stamp out of
// rule 5a (`body.ts`) and the continue row keeps its flag but sheds the seed, which the first assertion catches.
test("the continue row carries the authored chain of thought beside the prefix stamp, and an unstampeable turn drops it loudly", async () => {
  const deepseek = providerIdSchema.parse("deepseek");
  const prefill = prefillCapability();
  const params = { effort: "high" } satisfies UserIntent;
  const seed = "(He leans on my counter, dripping on the wood I just polished. I answer short, and in Spanish: azul.)";

  const stamped = await send({ providerId: deepseek, capability: prefill }, { params, history: [USER_LINE, ASSISTANT_OPENING], prefillReasoning: seed });
  expect(wireRows(stamped.body).at(-1)).toMatchObject({ role: "assistant", content: "Once upon a", prefix: true, ["reasoning_content"]: seed });

  // No assistant tail, no continue row, no silent rider on some other row: the seed drops with its own code.
  const dropped = await send({ providerId: deepseek, capability: prefill }, { params, history: [USER_LINE], prefillReasoning: seed });
  expect(JSON.stringify(dropped.body["messages"])).not.toContain("reasoning_content");
  expect(warningCodes(dropped.events)).toContain(WARNING_CODE.prefillReasoningDropped);

  // The plain prefill turn is unchanged: the stamp rides alone, no empty seed appears.
  const plain = await send({ providerId: deepseek, capability: prefill }, { params, history: [USER_LINE, ASSISTANT_OPENING] });
  expect(JSON.stringify(plain.body["messages"])).not.toContain("reasoning_content");
});

const LLAMA_URL = "http://box.local:8080/v1";

/** One chat turn on the shipped llama-cpp row, whose `/tokenize` answers one token per space-led word of the phrase. */
async function sendLlama(params: UserIntent): Promise<{ readonly body: RecordedRequest["body"]; readonly events: readonly ChatEvent[] }> {
  const chats: RecordedRequest[] = [];
  using chat = openAiServer(chats, () => ({}));
  const server: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith("/tokenize")) {
      const pieces = z
        .string()
        .parse((await recordRequest(request)).body["content"])
        .split(/(?= )/u);
      const tokens = pieces.map((piece) => ({ id: Array.from(piece).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0), piece }));
      return Response.json({ tokens });
    }
    return chat.execute(request);
  };
  await using root = await createRuntimeRoot({ providerFetch: server });
  const connection = await wireConnection(root, { task: "chat", providerId: providerIdSchema.parse("llama-cpp"), model: "local-model", baseUrl: LLAMA_URL });
  const turn = await root.app.runtime.executor.runChatTurn({
    signal: new AbortController().signal,
    api: "chat-completions",
    connection,
    params,
    systemPrompt: { static: SYSTEM_TEXT, dynamic: "" },
    history: [USER_LINE],
  });
  const [first] = chats;
  if (first === undefined) {
    throw new Error("the turn reached no endpoint");
  }
  return { body: first.body, events: turn.events };
}

function droppedPhraseWarnings(events: readonly ChatEvent[]): string[] {
  return events.flatMap((event) =>
    event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped && event.knob === "bannedStrings" ? [event.message] : [],
  );
}

// llama.cpp tokenizes a string `logit_bias` key and biases every one of its tokens for the whole reply, so a
// multi-token phrase sent there would ban each of its words everywhere.
test("on llama.cpp a one-token banned phrase rides as a false bias, and a multi-token phrase is dropped by name instead of banning its words", async () => {
  const mixed = await sendLlama({ bannedStrings: ["Ozymandias", "her spine"], logitBias: { "42": -5 } });
  expect(mixed.body["logit_bias"]).toEqual({ "42": -5, ["Ozymandias"]: false });
  const [dropped, ...more] = droppedPhraseWarnings(mixed.events);
  expect(dropped).toContain('"her spine"');
  expect(dropped).not.toContain("Ozymandias");
  expect(more).toEqual([]);

  const onlyMulti = await sendLlama({ bannedStrings: ["her spine"] });
  expect(onlyMulti.body).not.toHaveProperty("logit_bias");
  expect(droppedPhraseWarnings(onlyMulti.events)).toHaveLength(1);
});

test("a turn carrying a strict tool rides the row's beta route; without a beta path the same strict body rides the base", async () => {
  const deepseek = providerIdSchema.parse("deepseek");
  // The DeepSeek capability shape: no `response_format` json_schema carrier, no forced choices — the
  // structured plan must ride an offered tool, and `strictJson: default-on` stamps it strict.
  const capability = generationCapability({
    output: { maxTokens: { min: 1, max: 8192 }, structured: false, modalities: ["text"] },
    tools: { parallel: true, requiredChoice: false, namedChoice: false, noneChoice: true, parallelControl: false },
  });
  const format: ResponseFormat = { name: "report", schema: projectJsonSchema(z.object({ mood: z.string() })) };

  const beta = await send({ providerId: deepseek, capability }, { responseFormat: format });
  expect(beta.url).toContain("/beta/v1/chat/completions");
  expect(beta.body).not.toHaveProperty("response_format");
  expect(wireTool(beta.body, 0)).toMatchObject({ name: "report", strict: true });

  // Control: the same plan on a row with the same features and no `betaChatPath` sends the strict tool to
  // the base URL — the hop is the row's declared path, not a provider reflex.
  const base = await send({ capability, declaredFeatures: { structuredMode: "strict-compatible", strictJson: "default-on" } }, { responseFormat: format });
  expect(base.url).not.toContain("/beta");
  expect(base.url).toContain("/v1/chat/completions");
  expect(wireTool(base.body, 0)).toMatchObject({ strict: true });
});
