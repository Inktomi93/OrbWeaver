// The `/responses` protocol turn, read at the real fetch seam: the exact body the SDK + runner build,
// the stateless-send ruling (`store: false`), the SDK catalog gap that drops `reasoning.effort` for every
// off-catalog model id (closed by the shapeBody injection — a red without it), the structured plan's
// strict flag beating the SDK's default-on strictness, and the raw-reasoning dialect rewrite.
// @subject packages/inference/src/backends/openai-compat/responses.ts
import type { ProviderId } from "@orb/contracts/inference";
import { providerIdSchema, WARNING_CODE } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatEvent, ChatHistoryMessage, ChatResult } from "@orb/inference";
import { jsonValueSchema } from "@orb/kit/json";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest, ResponsesReply } from "@orb/testkit/node/helpers";
import { openAiResponsesServer, recordRequest } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { createRuntimeRoot, generationCapability, wireConnection } from "../../roles/runtime.fixtures.ts";

type Connection = Omit<Parameters<typeof wireConnection<"chat">>[1], "task">;

const SYSTEM_TEXT = "You are a fixture.";
const USER_LINE: ChatHistoryMessage = { role: "user", content: [{ type: "text", text: "Hello." }] };
const MID_SYSTEM: ChatHistoryMessage = { role: "system", content: [{ type: "text", text: "Answer tersely." }] };

// The deepseek row is the fixture provider (the revival's first served row): its features carry
// `effort: "reasoning_effort"` and the raw-reasoning dialect. Tests that script SDK-native summary
// events narrow the dialect per-connection; the dialect test lets the row's own feature ride.
const DEEPSEEK: ProviderId = providerIdSchema.parse("deepseek");

// Wire-body arms read through schemas, not narrowing `as` (the recorded body is parsed JsonValue): an
// assertion that lies about the wire would sail past the expectations; a parse throws on the wrong shape.
const rolesArray = z.array(z.object({ role: z.string(), content: z.unknown() }));
const formatArm = z.object({ format: z.record(z.string(), jsonValueSchema) });
const wireSchema = z.object({ required: z.array(z.string()), properties: z.record(z.string(), z.record(z.string(), jsonValueSchema)) });
const toolsArray = z.array(z.object({ name: z.string(), type: z.string().optional() }));

interface Sent {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: RecordedRequest["body"];
  readonly turn: ChatResult;
  readonly events: readonly ChatEvent[];
}

/** One `/responses` turn against a scripted endpoint; what the endpoint received and what the turn reported. */
async function send(
  row: Partial<Connection> = {},
  options: {
    readonly reply?: ResponsesReply;
    readonly params?: UserIntent;
    readonly history?: readonly ChatHistoryMessage[];
    readonly responseFormat?: ResponseFormat;
    readonly tools?: { readonly name: string; readonly description: string; readonly parameters: Record<string, unknown> }[];
    readonly fetch?: typeof fetch;
    readonly prefillReasoning?: string;
  } = {},
): Promise<Sent> {
  const recorded: RecordedRequest[] = [];
  const customFetch = options.fetch;
  const reply = options.reply ?? ({ kind: "text", text: "Here you go." } as const);
  using server = openAiResponsesServer(recorded, () => reply);
  // A custom fetch (the raw-dialect tape) still gets its requests captured into the same record.
  const providerFetch =
    customFetch === undefined
      ? server.execute
      : async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
          recorded.push(await recordRequest(input, init));
          return await customFetch(input, init);
        };
  await using root = await createRuntimeRoot({ providerFetch });
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: DEEPSEEK,
    model: "deepseek-v4-pro",
    api: "responses",
    capability: generationCapability(),
    declaredFeatures: { responsesReasoningStream: "summary" },
    ...row,
  });
  const turn = await root.app.runtime.executor.runChatTurn({
    signal: new AbortController().signal,
    api: "responses",
    connection,
    params: options.params ?? {},
    systemPrompt: { static: SYSTEM_TEXT, dynamic: "" },
    history: options.history ?? [USER_LINE],
    ...(options.responseFormat === undefined ? {} : { responseFormat: options.responseFormat }),
    ...(options.tools === undefined ? {} : { tools: options.tools, toolChoice: { mode: "auto" as const } }),
    ...(options.prefillReasoning === undefined ? {} : { prefillReasoning: options.prefillReasoning }),
  });
  const [first] = recorded;
  if (first === undefined) {
    throw new Error("the turn reached no endpoint");
  }
  return { url: first.url, headers: first.headers, body: first.body, turn, events: turn.events };
}

test("system rows ride in place on this protocol — leading AND mid-conversation, as `system` role items", async () => {
  // The turns cells' claim (MEASURED 2026-11-17: a `system` row mid-`input` answers 200): the floor says
  // the model may take system rows anywhere, so the transport must actually place them there.
  const turnCap = generationCapability({
    turns: { assistantPrefill: false, midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "strict", explicitPromptCache: false },
  });
  const sent = await send({ capability: turnCap }, { history: [USER_LINE, MID_SYSTEM, { role: "user", content: [{ type: "text", text: "And again." }] }] });
  const input = rolesArray.parse(sent.body["input"]);
  expect(input.map((item) => item.role)).toEqual(["system", "user", "system", "user"]);
  expect(input[2]?.content).toContain("Answer tersely.");
});

test("a plain turn POSTs a stateless body to <base>/v1/responses and folds the terminal receipt", async () => {
  const sent = await send({}, { params: { maxOutputTokens: 1024 } satisfies UserIntent, reply: { kind: "text", text: "Here you go.", cachedTokens: 384 } });
  // The deepseek row's own base URL is fixed (an apiKey row may not name one), so this also pins that
  // `responsesModelFor` hangs `/responses` off the row's versioned root, not a re-derived path.
  expect(sent.url).toBe("https://api.deepseek.com/v1/responses");
  expect(sent.headers["authorization"]).toBe("Bearer synthetic-runtime-fixture-key");
  expect(sent.body["model"]).toBe("deepseek-v4-pro");
  expect(sent.body["store"]).toBe(false);
  expect(sent.body["stream"]).toBe(true);
  expect(sent.body["max_output_tokens"]).toBe(1024);
  const input = rolesArray.parse(sent.body["input"]);
  expect(input.map((item) => item.role)).toEqual(["system", "user"]);
  expect(sent.turn.reply).toBe("Here you go.");
  expect(sent.turn.finishReason).toBe("stop");
  expect(sent.turn.generationId).toBe("resp-1");
  expect(sent.turn.usage.tokensIn).toBe(10);
  expect(sent.turn.usage.tokensOut).toBe(5);
  // The terminal `response.completed` usage carries the cache receipt (no `[DONE]`, no extra read).
  expect(sent.turn.usage.cacheReadTokens).toBe(384);
});

test("an effort request rides `reasoning.effort` despite the SDK catalog — the body seam injects what the converter drops", async () => {
  const sent = await send({}, { params: { effort: "medium" } satisfies UserIntent, reply: { kind: "text", text: "Medium." } });
  // `deepseek-v4-pro` is off `@ai-sdk/openai`'s own regex catalog, so the converter gates the whole
  // `reasoning` arm off the body; the shapeBody seam writes it back (red without the injection).
  expect(sent.body["reasoning"]).toEqual({ effort: "medium" });
  expect(sent.turn.appliedEffort).toBe("medium");

  // No effort to spell (reasoning off at the capability) ⇒ no reasoning arm at all — the model rides its default.
  const bare = await send({ capability: generationCapability({ reasoning: { mode: "none", enabled: false } }) }, { reply: { kind: "text", text: "Default." } });
  expect(bare.body).not.toHaveProperty("reasoning");
  expect(bare.turn.appliedEffort).toBeNull();
});

test("samplers the Responses body does not model drop loudly; temperature rides", async () => {
  const sent = await send({}, { params: { temperature: 0.7, topK: 40 } satisfies UserIntent });
  expect(sent.body["temperature"]).toBe(0.7);
  expect(sent.body).not.toHaveProperty("top_k");
  const dropped = sent.events.flatMap((event) =>
    event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped ? [`${event.knob ?? ""} ${event.message}`] : [],
  );
  // Whether the funnel or the runner's route rule drops it, the receipt is the same event code — and the
  // body must not carry a spelling the Responses route has no arm for.
  expect(dropped.some((line) => /top_?K/i.test(line))).toBe(true);
});

test("the structured plan's strict flag rides explicitly — strict on default-on, off when the row declines to force it", async () => {
  const format: ResponseFormat = { name: "report", schema: projectJsonSchema(z.object({ mood: z.string(), note: z.string().optional() })) };
  const capability = generationCapability({
    output: { maxTokens: { min: 1, max: 8192 }, structured: true, structuredLimits: { maxOptionalProps: 0 }, modalities: ["text"] },
  });

  const strict = await send({ capability }, { responseFormat: format, reply: { kind: "text", text: '{"mood":"glad","note":null}' } });
  const arm = formatArm.parse(strict.body["text"]);
  expect(arm.format["type"]).toBe("json_schema");
  expect(arm.format["name"]).toBe("report");
  // The SDK default is strict `true` anyway, but the PLAN states it — and the plan's strict-compatible
  // scrub has already projected the optional `note` to required-with-null (the vendor's grammar rule).
  expect(arm.format["strict"]).toBe(true);
  const schema = wireSchema.parse(arm.format["schema"]);
  expect(schema.required).toContain("note");
  expect(schema.properties["note"]).toHaveProperty("anyOf");
  // The scripted reply carries the projection's `note: null`; the plan's `nullMeansAbsent` decode drops
  // it back to absent, so the caller sees the schema-shaped object it declared, not the wire's padding.
  expect(strict.turn.reply).toBe('{"mood":"glad"}');

  // A non-strict mode is where the SDK default bites: the plan says no strictness (`STRICT_FORMAT_MODES`
  // is mode-keyed, not feature-keyed — `strict-compatible` and `guided-decoding` are the strict pair), and
  // the SDK's `strictJsonSchema ?? true` would lie to the grammar unless the runner states the plan's
  // flag — so the body must carry `strict: false`. The deepseek cell's `maxOptionalProps: 0` is its own
  // strict-grammar rule, so this connection restates its ceilings like an admin row would.
  const permissive = generationCapability({
    output: { maxTokens: { min: 1, max: 8192 }, structured: true, structuredLimits: { maxOptionalProps: 8 }, modalities: ["text"] },
  });
  const advisory = await send(
    { capability: permissive, declaredFeatures: { responsesReasoningStream: "summary", structuredMode: "hosted-common" } },
    { responseFormat: format, reply: { kind: "text", text: '{"mood":"glad"}' } },
  );
  expect(formatArm.parse(advisory.body["text"]).format["strict"]).toBe(false);
});

test("a tool round sends the tool and returns the call with the vendor's own call id", async () => {
  const sent = await send(
    {},
    {
      tools: [
        {
          name: "get_weather",
          description: "Weather for a city.",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      ],
      reply: { kind: "tool-call", name: "get_weather", arguments: '{"city":"Oslo"}' },
    },
  );
  const tools = toolsArray.parse(sent.body["tools"]);
  expect(tools[0]?.name).toBe("get_weather");
  expect(sent.turn.toolCalls?.[0]).toMatchObject({ toolCallId: "call-1", name: "get_weather" });
  expect(JSON.stringify(sent.turn.toolCalls?.[0]?.arguments)).toContain("Oslo");
});

test("the row's raw-reasoning dialect folds onto reasoning deltas; without the flag the vendor's reasoning silently drops", async () => {
  // MEASURED vendor form (deepseek-v4-pro, 2026-11-17): `response.reasoning_text.delta/done` frames the
  // SDK's chunk union never models. The item-add frames keep the SDK's arm fields; the extra vendor keys
  // (`status`, `content`) ride zod's strip — the SDK-relevant fact is the missing reasoning event type.
  const frames = [
    { type: "response.created", response: { id: "resp-raw", ["created_at"]: 1, model: "m" } },
    { type: "response.output_item.added", ["output_index"]: 0, item: { type: "reasoning", id: "rs-1", status: "in_progress" } },
    { type: "response.reasoning_text.delta", ["item_id"]: "rs-1", ["output_index"]: 0, ["content_index"]: 0, delta: "Thinking " },
    { type: "response.reasoning_text.delta", ["item_id"]: "rs-1", ["output_index"]: 0, ["content_index"]: 0, delta: "hard." },
    { type: "response.reasoning_text.done", ["item_id"]: "rs-1", ["output_index"]: 0, ["content_index"]: 0, text: "Thinking hard." },
    { type: "response.output_item.done", ["output_index"]: 0, item: { type: "reasoning", id: "rs-1", status: "completed" } },
    { type: "response.output_item.added", ["output_index"]: 1, item: { type: "message", id: "msg-1" } },
    { type: "response.output_text.delta", ["item_id"]: "msg-1", ["output_index"]: 1, delta: "391" },
    { type: "response.output_item.done", ["output_index"]: 1, item: { type: "message", id: "msg-1" } },
    { type: "response.completed", response: { id: "resp-raw", ["created_at"]: 1, model: "m", usage: { ["input_tokens"]: 10, ["output_tokens"]: 5 } } },
  ];
  const rawFetch: typeof fetch = () => {
    const sse = frames.map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join("");
    return Promise.resolve(new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
  };
  // The row's own feature (`responsesReasoningStream: "text"`) rides — an empty declared override keeps it.
  const folded = await send({ declaredFeatures: {} }, { fetch: rawFetch, params: { effort: "medium" } satisfies UserIntent });
  expect(folded.turn.reasoning).toBe("Thinking hard.");
  expect(folded.turn.reply).toBe("391");
  expect(folded.turn.appliedEffort).toBe("medium");
  // The effort injection survived the dialect path too.
  expect(folded.body["reasoning"]).toEqual({ effort: "medium" });

  // Red-proof pair: the SAME bytes on a connection pinned to the summary spelling meet the SDK catch-all
  // `unknown_chunk` and drop silently — empty reasoning, text still fine. Without this pair the fold
  // above could pass on a fixture that never sent the dialect.
  const dropped = await send({ declaredFeatures: { responsesReasoningStream: "summary" } }, { fetch: rawFetch });
  expect(dropped.turn.reasoning).toBe("");
  expect(dropped.turn.reply).toBe("391");
});

// The `/responses` protocol models no forced continuation (a trailing assistant input item reads
// continuation-LIKE but may restart — `docs/law/deepseek-api-surface.md`), so an authored chain of thought has
// no continue row to ride: it drops with its own code instead of vanishing silently.
test("a continue seed drops loudly on this route — there is no continuation to seed", async () => {
  const sent = await send({}, { prefillReasoning: "(I answer in Spanish: azul.)" });
  expect(JSON.stringify(sent.body["input"])).not.toContain("azul");
  expect(sent.events).toContainEqual(expect.objectContaining({ kind: "warning", code: WARNING_CODE.prefillReasoningDropped }));
});
