// What the local servers' advertised facts do to a resolved connection: each forced tool-choice form a server
// does not force goes out as `auto`, loudly (Ollama and KoboldCpp: both; llama.cpp: a named choice), while a
// hosted row keeps both; a server that continues a delivered assistant row states `turns.assistantPrefill` and
// leaves the other cells estimated; and a chat template refusing the conversation's roles is not retried and
// keeps the server's sentence. Servers are the rig's recordings.

import type { DeclaredCapability, GenerationCapability } from "@orb/contracts/inference";
import { createInferenceRuntime, ProviderError } from "@orb/inference";
import { runOpenAiCompatChatTurn } from "../../../packages/inference/src/backends/openai-compat/chat.ts";
import { runOpenAiCompatRerank } from "../../../packages/inference/src/backends/openai-compat/rerank.ts";
import { applyServerToolChoice } from "../../../packages/inference/src/capability/floor.ts";
import type { Resolved } from "../../../packages/inference/src/contract/resolved.ts";
import { resolveChat } from "../../../packages/inference/src/funnel/resolve-chat.ts";
import { planStructuredFor } from "../../../packages/inference/src/structured/plan.ts";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, fakeResolved, memoryStores, memoryTokenLexicon, newUserId } from "../_support.ts";
import type { RecordedRequest } from "../backends/_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedSseFetch } from "../backends/_hosted-support.ts";
import { localServerFetch, recordedAnswer, transcriptFetch } from "../catalog/_local-servers-fetch.ts";

const BASE_URL = "http://127.0.0.1:1/v1";
const KOBOLD_MODEL = "koboldcpp/qwen2.5-0.5b-instruct-q4_k_m";
const LLAMA_MODEL = "/models/qwen2.5-0.5b-instruct-q4_k_m.gguf";

async function resolvedFor(args: {
  readonly providerId: string;
  readonly model: string;
  readonly fetch: typeof fetch;
  readonly declared?: DeclaredCapability | null;
}): Promise<Awaited<ReturnType<Awaited<ReturnType<typeof createInferenceRuntime>>["resolve"]>>["resolved"]> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: args.providerId, model: args.model, baseUrl: BASE_URL, declared: args.declared ?? null });
  stores.connections.rows.set(row.id, row);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: args.fetch }));
  return (await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id })).resolved;
}

function generationOf(resolved: { readonly capability: { readonly kind: string } }): GenerationCapability {
  const capability = resolved.capability as { readonly kind: string; readonly generation?: GenerationCapability };
  if (capability.generation === undefined) {
    throw new Error(`expected a generation capability, got ${capability.kind}`);
  }
  return capability.generation;
}

const WEATHER_TOOL = { name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: {} } };

/** What a `required` and a named choice go out as through the structured plan, and the downgrades it raised. */
function forced(generation: GenerationCapability): { readonly required: string; readonly named: string; readonly warnings: string[] } {
  const connection = fakeResolved({ task: "chat", providerId: "custom-openai", model: "test-model", capability: { kind: "generation", generation } });
  const plans = [{ mode: "required" as const }, { mode: "tool" as const, name: WEATHER_TOOL.name }].map((toolChoice) => {
    const plan = planStructuredFor(connection, { tools: [WEATHER_TOOL], toolChoice });
    if (!plan.ok) {
      throw new Error("the tool-only plan refused");
    }
    return plan;
  });
  const [required, named] = plans.map((plan) => plan.toolChoice?.mode ?? "none");
  return { required: required ?? "none", named: named ?? "none", warnings: plans.flatMap((plan) => plan.downgrades.map((warning) => warning.code)) };
}

test("Ollama: neither forced form reaches the model, so both go out as auto with the downgrade warning", async () => {
  const generation = generationOf(await resolvedFor({ providerId: "ollama", model: "qwen2.5:0.5b", fetch: localServerFetch("ollama") }));
  expect(generation.tools).toMatchObject({ parallel: false, requiredChoice: false, namedChoice: false });
  expect(forced(generation)).toEqual({ required: "auto", named: "auto", warnings: ["tool_choice_downgraded", "tool_choice_downgraded"] });
});

test("KoboldCpp: tools the user declares carry the server's refusal of both forms; a declared form still wins", async () => {
  const declared = await resolvedFor({
    providerId: "koboldcpp",
    model: KOBOLD_MODEL,
    fetch: transcriptFetch("kobold-chat"),
    declared: { generation: { tools: { parallel: true } } },
  });
  expect(forced(generationOf(declared))).toMatchObject({ required: "auto", named: "auto" });
  const insisted = await resolvedFor({
    providerId: "koboldcpp",
    model: KOBOLD_MODEL,
    fetch: transcriptFetch("kobold-chat"),
    declared: { generation: { tools: { parallel: true, requiredChoice: true } } },
  });
  expect(forced(generationOf(insisted))).toEqual({ required: "required", named: "auto", warnings: ["tool_choice_downgraded"] });
});

test("llama.cpp forces `required` and runs a named choice as auto, so only the named form is downgraded", async () => {
  const generation = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-chat") }));
  expect(generation.tools).toEqual({ parallel: true, silencesProse: true, namedChoice: false });
  expect(forced(generation)).toEqual({ required: "required", named: "auto", warnings: ["tool_choice_downgraded"] });
});

test("a hosted row states no server tool-choice fact: both forms ride as asked", () => {
  const hosted = generationCapability({ tools: { parallel: true } });
  expect(applyServerToolChoice(hosted, undefined)).toBe(hosted);
  if (hosted.kind !== "generation") {
    throw new Error("expected generation");
  }
  expect(forced(hosted.generation)).toEqual({ required: "required", named: "tool", warnings: [] });
});

test("a server that continues a delivered assistant row states assistantPrefill; the cells nobody measured stay estimated", async () => {
  const continues = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-chat") }));
  expect(continues.turns).toMatchObject({ assistantPrefill: true, roleHandlingFloor: "strict" });
  expect(continues.turnsEstimated).toEqual(["midConversationSystem", "historySystemRows", "roleHandlingFloor"]);
  const closes = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-noprefill") }));
  expect(closes.turns?.assistantPrefill).toBe(false);
  expect(closes.turnsEstimated).not.toContain("assistantPrefill");
});

test("the server's sampler defaults reach the capability per knob, under the row's spelling", async () => {
  const generation = generationOf(await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-chat") }));
  expect(generation.samplingDefaults).toMatchObject({ topK: 40, repetitionPenalty: 1, repetitionPenaltyRange: 64, mirostatMode: 0 });
  expect(generation.samplingDefaults?.temperature).toBeCloseTo(0.8);
});

test("a chat template that refuses the conversation's roles is mapped once, not retried, and keeps the server's sentence", async () => {
  const resolved = await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-stock") });
  // What the rig's llama.cpp answered when Qwen3.8's stock template met a system row after an assistant row.
  const refusal = recordedAnswer("llamacpp-stock", "POST", "/v1/chat/completions");
  expect(refusal.status).toBe(500);
  let calls = 0;
  const error = await runOpenAiCompatChatTurn(
    {
      api: "chat-completions",
      connection: { ...resolved, task: "chat" },
      params: { maxOutputTokens: 16 },
      systemPrompt: { static: "", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    },
    {
      now: () => 0,
      log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      tokens: memoryTokenLexicon(),
      transport: {
        fetch: (): Promise<Response> => {
          calls += 1;
          return Promise.resolve(Response.json(refusal.body, { status: refusal.status }));
        },
        app: { name: "t", url: "http://localhost:0" },
      },
    },
  ).then(
    () => null,
    (err: unknown) => err,
  );
  // A bare 500 is a retryable server fault; this one is the conversation's shape, so it is not.
  expect(error).toBeInstanceOf(ProviderError);
  expect(error).toMatchObject({ kind: "invalid", retryable: false });
  expect((error as ProviderError).message).toContain("System message must be at the beginning");
  expect(calls).toBe(1);
  // The owner's served template on the 27B takes the same rows: a 200, nothing to map.
  expect(recordedAnswer("llamacpp-27b", "POST", "/v1/chat/completions").status).toBe(200);
});

const NATIVE_DONE = '{"model":"m","message":{"role":"assistant","content":"ok"},"done":true,"done_reason":"stop","prompt_eval_count":1,"eval_count":1}\n';

/** One chat turn on a resolved row: the body that reached the wire, and the turn's warning codes and knobs. */
async function sentTurn(
  resolved: Awaited<ReturnType<typeof resolvedFor>>,
  over: { readonly toolChoice?: { readonly mode: "none" }; readonly params?: { readonly advanced: { readonly parallelToolCalls: false } } },
): Promise<{ readonly body: Record<string, unknown>; readonly codes: readonly string[]; readonly knobs: readonly (string | undefined)[] }> {
  const recorded: RecordedRequest[] = [];
  const native = resolved.features.nativeChat === "ollama";
  const sse = scriptedSseFetch([openAiTextStream("ok")], recorded);
  const fetchImpl: typeof fetch = native
    ? (input, init): Promise<Response> => {
        recorded.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return Promise.resolve(new Response(NATIVE_DONE, { headers: { "content-type": "application/x-ndjson" } }));
      }
    : sse;
  const turn = await runOpenAiCompatChatTurn(
    {
      api: "chat-completions",
      connection: { ...resolved, task: "chat" },
      params: { maxOutputTokens: 16, ...over.params },
      systemPrompt: { static: "", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [WEATHER_TOOL],
      ...(over.toolChoice === undefined ? {} : { toolChoice: over.toolChoice }),
    },
    {
      now: () => 0,
      log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      tokens: memoryTokenLexicon(),
      transport: { fetch: fetchImpl, app: { name: "t", url: "http://localhost:0" } },
    },
  );
  const warnings = turn.events.flatMap((event) => (event.kind === "warning" ? [event] : []));
  return { body: recorded[0]?.body ?? {}, codes: warnings.map((warning) => warning.code), knobs: warnings.map((warning) => warning.knob) };
}

test("tool choice none and parallel-off are honoured where the server carries them, and dropped loudly where it ignores them", async () => {
  const none = { toolChoice: { mode: "none" } } as const;
  const serial = { params: { advanced: { parallelToolCalls: false } } } as const;
  // Ollama: neither chat route takes `tool_choice` or `parallel_tool_calls`, so a none sends no tools.
  const ollama = await resolvedFor({ providerId: "ollama", model: "qwen2.5:0.5b", fetch: localServerFetch("ollama") });
  const ollamaNone = await sentTurn(ollama, none);
  expect(ollamaNone.body).not.toHaveProperty("tools");
  expect(ollamaNone.codes).toContain("tool_choice_downgraded");
  const ollamaSerial = await sentTurn(ollama, serial);
  expect(ollamaSerial.body["tools"]).toBeDefined();
  expect(ollamaSerial.body).not.toHaveProperty("parallel_tool_calls");
  expect(ollamaSerial.knobs).toContain("parallelToolCalls");
  // KoboldCpp: tools the user declares; its OpenAI route reads neither field as a constraint.
  const kobold = await resolvedFor({
    providerId: "koboldcpp",
    model: KOBOLD_MODEL,
    fetch: transcriptFetch("kobold-chat"),
    declared: { generation: { tools: { parallel: true } } },
  });
  expect((await sentTurn(kobold, none)).body).not.toHaveProperty("tools");
  const koboldSerial = await sentTurn(kobold, serial);
  expect(koboldSerial.body).not.toHaveProperty("parallel_tool_calls");
  expect(koboldSerial.knobs).toContain("parallelToolCalls");
  // llama.cpp parses both: they ride, and nothing is said.
  const llama = await resolvedFor({ providerId: "llama-cpp", model: LLAMA_MODEL, fetch: transcriptFetch("llamacpp-chat") });
  const llamaNone = await sentTurn(llama, none);
  expect(llamaNone.body).toMatchObject({ ["tool_choice"]: "none" });
  expect(llamaNone.body["tools"]).toBeDefined();
  expect(llamaNone.codes).not.toContain("tool_choice_downgraded");
  const llamaSerial = await sentTurn(llama, serial);
  expect(llamaSerial.body).toMatchObject({ ["parallel_tool_calls"]: false });
  expect(llamaSerial.knobs).not.toContain("parallelToolCalls");
});

/** An Ollama server whose one model's `/api/show` carries `show` (types/model/thinking.go `Thinking`). */
function ollamaShowing(model: string, show: Record<string, unknown>): typeof fetch {
  return ((input: string | URL | Request): Promise<Response> => {
    const path = new URL(String(input)).pathname;
    const routes: Readonly<Record<string, unknown>> = {
      "/v1/models": { data: [{ id: model }] },
      "/api/version": { version: "0.35.1" },
      "/api/ps": { models: [] },
      "/api/show": show,
    };
    return Promise.resolve(path in routes ? Response.json(routes[path]) : Response.json({ error: "not available" }, { status: 404 }));
  }) as typeof fetch;
}

test("Ollama: the model's thinking descriptor reaches the capability as its levels, default and off switch", async () => {
  const show = {
    capabilities: ["completion", "thinking"],
    ["model_info"]: { "general.architecture": "qwen", "qwen.context_length": 32_768 },
    thinking: { values: [false, "low", "medium", "high"], default: "medium" },
  };
  const generation = generationOf(
    await resolvedFor({ providerId: "ollama", model: "private-thinker:latest", fetch: ollamaShowing("private-thinker:latest", show) }),
  );
  expect(generation.reasoning).toMatchObject({ mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"], defaultEffort: "medium" });
  expect(generation.reasoning.mandatory).toBeUndefined();
});

test("Ollama: turning the native route off leaves only the knobs /v1 carries and the window the server runs", async () => {
  const model = "private:latest";
  const fetchImpl = ollamaShowing(model, { capabilities: ["completion"], ["model_info"]: { "general.architecture": "qwen", "qwen.context_length": 32_768 } });
  const declared: DeclaredCapability = { generation: { context: { window: 16_384 } } };
  const native = generationOf(await resolvedFor({ providerId: "ollama", model, fetch: fetchImpl, declared }));
  // The native route sends the declared window as num_ctx, and takes top_k, min_p and the repetition pair.
  expect(native.context.window).toBe(16_384);
  expect(Object.keys(native.sampling)).toEqual(expect.arrayContaining(["topK", "minP", "repetitionPenalty", "repetitionPenaltyRange"]));
  const compat = generationOf(
    await resolvedFor({ providerId: "ollama", model, fetch: fetchImpl, declared: { ...declared, features: { nativeChat: "none" } } }),
  );
  // `/v1/chat/completions` (openai.go) takes no window and no native-only sampler.
  expect(Object.keys(compat.sampling).toSorted()).toEqual(["frequencyPenalty", "presencePenalty", "seed", "stop", "temperature", "topP"]);
  // It runs the server's default for an unpinned model, which only the server's floor bounds.
  expect(compat.context).toMatchObject({ window: 4096, windowEstimated: true });
  const turn = resolveChat({ topK: 40, minP: 0.1, temperature: 0.7 }, compat);
  expect(turn.warnings.filter((w) => w.code === "sampling_knob_dropped").map((w) => w.knob)).toEqual(["topK", "minP"]);
  expect(turn.sampling).toEqual({ temperature: 0.7 });
});

/** The rig's llama.cpp reranker arm, answering a scored request on either rerank route with Jina-shaped results
 *  (server-context.cpp `post_rerank`, `/rerank` and `/v1/rerank` both registered) over the indices it was sent. */
function llamaCppReranker(): { readonly fetch: typeof fetch; readonly scored: { readonly url: string; readonly body: Record<string, unknown> }[] } {
  const replay = transcriptFetch("llamacpp-rerank");
  const scored: { readonly url: string; readonly body: Record<string, unknown> }[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if ((url.pathname === "/rerank" || url.pathname === "/v1/rerank") && "query" in body) {
      scored.push({ url: url.toString(), body });
      return Promise.resolve(
        Response.json({
          model: "reranker",
          object: "list",
          usage: { ["prompt_tokens"]: 30, ["total_tokens"]: 30 },
          results: [
            { index: 2, ["relevance_score"]: 0.91 },
            { index: 0, ["relevance_score"]: 0.42 },
          ],
        }),
      );
    }
    return replay(input, init);
  }) as typeof fetch;
  return { fetch: fetchImpl, scored };
}

function isRerank(resolved: Resolved): resolved is Resolved<"rerank"> {
  return resolved.task === "rerank";
}

test("llama.cpp: a reranker its server identifies is served with no path override, on a root or a /v1 base URL", async () => {
  const model = "/models/nomic-embed-text-v1.5.Q8_0.gguf";
  for (const baseUrl of ["http://127.0.0.1:1", "http://127.0.0.1:1/v1/"]) {
    const server = llamaCppReranker();
    const stores = memoryStores();
    const ownerId = newUserId();
    const row = fakeConnection({ ownerId, providerId: "llama-cpp", model, baseUrl });
    stores.connections.rows.set(row.id, row);
    const deps = fakeDeps({ stores, fetch: server.fetch });
    const runtime = await createInferenceRuntime(deps);
    const { resolved } = await runtime.resolve({ task: "rerank", principal: principal(ownerId), connectionId: row.id });
    expect(resolved.capability.kind, baseUrl).toBe("rerank");
    expect(resolved.requirement, baseUrl).toEqual({ ok: true });
    if (!isRerank(resolved)) {
      throw new Error("resolved for another task");
    }

    const result = await runOpenAiCompatRerank(
      {
        connection: resolved,
        query: "Which planet is red?",
        documents: [
          { id: "mars", text: "Mars is red." },
          { id: "venus", text: "Venus is hot." },
          { id: "earth", text: "Earth's sky looks red at sunset." },
        ],
        topN: 2,
      },
      { fetch: server.fetch, normalize: () => Promise.reject(new Error("text only")), log: deps.log },
    );

    expect(
      server.scored.map((call) => new URL(call.url).pathname),
      baseUrl,
    ).toEqual([baseUrl.endsWith("/v1/") ? "/v1/rerank" : "/rerank"]);
    expect(server.scored[0]?.body, baseUrl).toEqual({
      model,
      query: "Which planet is red?",
      documents: ["Mars is red.", "Venus is hot.", "Earth's sky looks red at sunset."],
      ["top_n"]: 2,
    });
    // The server's indices map back to the caller's own ids, best first.
    expect(result.hits, baseUrl).toEqual([
      { id: "earth", score: 0.91 },
      { id: "mars", score: 0.42 },
    ]);
  }
});
