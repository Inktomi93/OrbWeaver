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
import { ProviderError } from "@orb/inference";
import type { JsonObject } from "@orb/kit/json";
import { jsonObjectSchema, jsonValueSchema } from "@orb/kit/json";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest, ResponsesReply } from "@orb/testkit/node/helpers";
import { openAiResponsesServer, recordRequest } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { PROVIDER_CAPABILITY_EVENT, PROVIDER_SAMPLING_EVENT } from "#inference/backends/http/provider-log.ts";
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

// The vendor's raw-reasoning delta event type, named once for the tape arms below.
const DELTA_FRAME_TYPE = "response.reasoning_text.delta";

/** Narrow a rejected turn to its ProviderError; anything else is a failure of the test's premise. */
function providerRejection(error: unknown): ProviderError {
  if (!(error instanceof ProviderError)) {
    throw new Error("the turn rejected with a non-provider failure", { cause: error });
  }
  return error;
}

/** A rejection arm's send must have REJECTED; a resolved send means the tape premise fell over, and
 *  reading `.kind` off it would assert on a field that does not exist. */
function rejectedTurn(result: ProviderError | Sent, label: string): ProviderError {
  if (!(result instanceof ProviderError)) {
    throw new Error(`${label}: expected a ProviderError rejection, but the turn resolved (stopReason ${result.turn.stopReason})`);
  }
  return result;
}

interface Sent {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: RecordedRequest["body"];
  readonly turn: ChatResult;
  readonly events: readonly ChatEvent[];
  /** The root ring's log lines at turn end — the `provider.*` receipts ride them at debug level. */
  readonly receipts: readonly string[];
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
  await using root = await createRuntimeRoot({ providerFetch, logLevel: "debug" });
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
  return { url: first.url, headers: first.headers, body: first.body, turn, events: turn.events, receipts: root.observability.logLines(1000) };
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

test("samplers the Responses body does not model drop loudly under their own knob name; temperature rides", async () => {
  // The capability exposes topK, so the funnel resolves it and only the route rule can drop it.
  const capability = generationCapability({ sampling: { temperature: { min: 0, max: 1 }, topK: { min: 1, max: 100 } } });
  const sent = await send({ capability }, { params: { temperature: 0.7, topK: 40 } satisfies UserIntent });
  expect(sent.body["temperature"]).toBe(0.7);
  expect(sent.body).not.toHaveProperty("top_k");
  const dropped = sent.events.flatMap((event) => (event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped ? [event.knob] : []));
  expect(dropped, "the route's drop names the knob the receipt reports").toEqual(["topK"]);
  const sampling = lastReceipt(sent.receipts, PROVIDER_SAMPLING_EVENT);
  expect(sampling["dropped"]).toContainEqual(expect.objectContaining({ knob: "topK" }));
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
    { type: DELTA_FRAME_TYPE, ["item_id"]: "rs-1", ["output_index"]: 0, ["content_index"]: 0, delta: "Thinking " },
    { type: DELTA_FRAME_TYPE, ["item_id"]: "rs-1", ["output_index"]: 0, ["content_index"]: 0, delta: "hard." },
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

  // The SSE spec makes the post-`data:` space OPTIONAL and both line endings LEGAL (WHATWG §9.2.5/§9.2.6):
  // a conformant vendor or a rewriting proxy may send either, and reasoning must survive both. The
  // measured DeepSeek form is LF with spaces — these arms cover the rest of the legal dialect surface.
  for (const [spelling, render] of [
    ["no-space data lines", (f: { type: string }): string => `event: ${f.type}\ndata:${JSON.stringify(f)}\n\n`],
    ["CRLF lines", (f: { type: string }): string => `event: ${f.type}\r\ndata: ${JSON.stringify(f)}\r\n\r\n`],
  ] as const) {
    const variant = await send(
      { declaredFeatures: {} },
      {
        fetch: () => Promise.resolve(new Response(frames.map((f) => render(f)).join(""), { status: 200, headers: { "content-type": "text/event-stream" } })),
        params: { effort: "medium" } satisfies UserIntent,
      },
    );
    expect(variant.turn.reasoning, `reasoning lost on the ${spelling} spelling`).toBe("Thinking hard.");
    expect(variant.turn.reply, `reply lost on the ${spelling} spelling`).toBe("391");
  }

  // An OVER-cap frame delivered ATOMICALLY still folds whole: the boundary loop reads a single chunk to
  // completion before the cap is ever consulted (`sseFrameTransform` in packages/inference/src/backends/http/sse.ts), so the
  // 1.2 MB delta never faces buffering pressure — the giant delta arrives folded end to end. The cap only
  // bites when bytes arrive in pieces, which is what the next arm delivers.
  const giant = "G".repeat(1_200_000);
  const giantBody = frames
    .map((f) => ("delta" in f && f.type === DELTA_FRAME_TYPE && f.delta === "Thinking " ? { ...f, delta: giant } : f))
    .map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`)
    .join("");
  const atomic = await send(
    { declaredFeatures: {} },
    { fetch: () => Promise.resolve(new Response(giantBody, { status: 200, headers: { "content-type": "text/event-stream" } })) },
  );
  expect(atomic.turn.reasoning.length, "the atomic-delivery giant delta did not fold whole").toBe(giant.length + "hard.".length);
  expect(atomic.turn.reply).toBe("391");

  // The cap under REAL streaming: a frame larger than the 1 MiB buffer can only be withheld past the cap
  // when the bytes arrive in pieces (a single chunk is drained by the frame loop before the cap is ever
  // consulted — an unchunked tape measures nothing). Delivered in 64 KiB chunks the giant frame crosses the
  // cap unframed, and the arm pins the OUTCOME that is this cap's whole contract: graceful degradation — the
  // stream survives, the named frames still fold, the over-cap delta is lost (the vendor's raw
  // `reasoning_text.delta` name is what the SDK's catch-all drops) and `hard.` (later, under-cap) is not.
  // Whether the withheld bytes pass through byte-identical is the sse.ts header claim; this
  // test asserts the turn-level degradation, not the byte equality.
  const chunkedTape: typeof fetch = () => {
    const bytes = new TextEncoder().encode(giantBody);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller): void {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + 65_536));
        offset += 65_536;
      },
    });
    return Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }));
  };
  const overflowed = await send({ declaredFeatures: {} }, { fetch: chunkedTape });
  expect(overflowed.turn.reasoning, "the over-cap delta folded — the cap never fired on a chunked stream").toBe("hard.");
  expect(overflowed.turn.reply).toBe("391");

  const accTape: typeof fetch = () =>
    Promise.resolve(
      new Response(
        frames
          .map((f) =>
            "delta" in f && f.type === DELTA_FRAME_TYPE && f.delta === "hard."
              ? `event: ${f.type}\ndata: ${JSON.stringify({ ...f, delta: "Multi-" })}\ndata: ${JSON.stringify(f)}\n\n`
              : `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`,
          )
          .join(""),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
  // Multi-line `data:` accumulation is a frame the dialect does not name: rewriting the first line only
  // would corrupt it, so it rides untouched (byte-identical). MEASURED here: the SDK parses EVERY frame's
  // payload, so the accumulated JSON pair surfaces as a ProviderError — the #758 policy (a malformed
  // data line is a protocol error the caller sees), not a silent drop. The class guard plus the
  // feature-OFF control below are what make that attribution honest: the same failure with the
  // transformer absent proves the dialect neither hid the malformation nor manufactured one.
  const surfaced = await send({ declaredFeatures: {} }, { fetch: accTape }).catch(providerRejection);
  expect(rejectedTurn(surfaced, "multi-line accumulation").kind).toBe("unknown");
  expect(rejectedTurn(surfaced, "multi-line accumulation").message).toMatch(/JSON parsing failed/);
  const untouched = await send({ declaredFeatures: { responsesReasoningStream: "summary" } }, { fetch: accTape }).catch(providerRejection);
  expect(rejectedTurn(untouched, "feature-ON repeat").kind).toBe("unknown");
  // The classification control the feature-OFF repeat could not give: a plain 400 on the SAME feature-ON
  // path must classify as "invalid" (error-classify maps every 400 there, and unlike a 5xx it is never
  // retried), so the multi-line arm's "unknown" is a kind doing real work — not the catch-all everything
  // fails into. If the malformed-JSON classification ever drifts, this pair fails instead of agreeing
  // with itself.
  const refused = await send({ declaredFeatures: {} }, { fetch: () => Promise.resolve(new Response("bad request", { status: 400 })) }).catch(providerRejection);
  expect(rejectedTurn(refused, "400 classification control").kind).toBe("invalid");
});

// The `/responses` protocol models no forced continuation (a trailing assistant input item reads
// continuation-LIKE but may restart — `docs/law/deepseek-api-surface.md`), so an authored chain of thought has
// no continue row to ride: it drops with its own code instead of vanishing silently.
test("a continue seed drops loudly on this route — there is no continuation to seed", async () => {
  const sent = await send({}, { prefillReasoning: "(I answer in Spanish: azul.)" });
  expect(JSON.stringify(sent.body["input"])).not.toContain("azul");
  expect(sent.events).toContainEqual(expect.objectContaining({ kind: "warning", code: WARNING_CODE.prefillReasoningDropped }));
});

// The row's `extras` merge and `includeBody`/`excludeBody` are shape-agnostic body rules — they carried on
// the chat wire since §8.1 and now carry here too; only the chat shaper's chat-specific rules stay behind.
test("the row's extras and includeBody/excludeBody ride the Responses body — excludeBody has the last word", async () => {
  const sent = await send(
    { extras: { vendorFlag: true }, transport: { includeBody: { store: true }, excludeBody: ["temperature"] } },
    { params: { temperature: 0.5 } },
  );
  expect(sent.body["vendorFlag"], "extras merged into the Responses body").toBe(true);
  expect(sent.body["store"], "includeBody overrode the SDK's store:false").toBe(true);
  expect(sent.body["temperature"], "excludeBody removed the modelled sampler").toBeUndefined();
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

// The `emitTurnReceipts` lines are the operator's only view of what the funnel resolved and what the
// wire actually sent — and they had no assertions from the day the pair was written. Pinned through the
// root's own log ring (the `scheduler-log-level` precedent), the shared receipts can no longer drift a
// field in silence. One hosted wire pins the canon; the cache line's two placer wires ride the same
// function with caller-supplied counts.
test("the turn's capability and sampling receipts reach the root log with the funnel's answers", async () => {
  const spoken = await send(
    { capability: generationCapability({ verbosity: ["low", "medium", "high"] }) },
    { params: { verbosity: "low", temperature: 0.5 }, prefillReasoning: "(thinking in Spanish.)" },
  );
  const capability = lastReceipt(spoken.receipts, PROVIDER_CAPABILITY_EVENT);
  expect(capability["api"]).toBe("responses");
  expect(capability["requestedModel"]).toBe("deepseek-v4-pro");
  expect(capability["droppedWarnings"]).toContainEqual(expect.objectContaining({ code: WARNING_CODE.prefillReasoningDropped }));
  const sampling = lastReceipt(spoken.receipts, PROVIDER_SAMPLING_EVENT);
  expect(sampling["applied"]).toMatchObject({ verbosity: "low", temperature: 0.5 });

  // Negative fold: with no verbosity cell the resolver drops the ask, so the receipt must not CLAIM
  // verbosity in `applied` and its code must read in `dropped` — the split the per-wire intent table
  // exists to keep honest.
  const silent = await send({}, { params: { verbosity: "low" } });
  const silentSampling = lastReceipt(silent.receipts, PROVIDER_SAMPLING_EVENT);
  expect(silentSampling).not.toHaveProperty(["applied", "verbosity"]);
  expect(silentSampling["dropped"]).toContainEqual(expect.objectContaining({ reason: expect.stringContaining("verbosity ignored") }));
});
