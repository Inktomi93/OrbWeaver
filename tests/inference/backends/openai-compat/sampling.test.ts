// backends/openai-compat/sampling — the per-server sampler spelling, proved on the bytes. Each local server row
// runs a real chat turn with its capability synthesized from the shipped curated rows and its features folded
// from the shipped provider row, so the wire capture reads exactly what a user's connection sends.

import type { Capability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import type { BatchDeps } from "../../../../packages/inference/src/backends/openai-compat/batch.ts";
import { runOpenAiCompatSummarize } from "../../../../packages/inference/src/backends/openai-compat/batch.ts";
import { runOpenAiCompatChatTurn } from "../../../../packages/inference/src/backends/openai-compat/chat.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { ChatResult, OpenAiCompatChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testProviderId } from "../../../support/inference-identities.ts";
import { fakeApiKeySecret, fakeResolved, memoryTokenLexicon } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedJsonFetch, scriptedSseFetch } from "../_hosted-support.ts";
import { OLLAMA_NATIVE_RECORDINGS } from "./_ollama-native-recordings.ts";

const NOW = 1_700_000_000_000;
const APP = { name: "orbweaver-test", url: "http://localhost:0" };
const MODEL = "local-model";
const BASE_URL = "http://box.local:8080/v1";

/** Every sampler a preset can carry, each at a value inside every local server's span. */
const EVERY_SAMPLER = {
  temperature: 1.2,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  topA: 0.2,
  frequencyPenalty: 0.3,
  presencePenalty: 0.4,
  repetitionPenalty: 1.1,
  repetitionPenaltyRange: 512,
  typicalP: 0.95,
  topNSigma: 1.5,
  xtcProbability: 0.5,
  xtcThreshold: 0.1,
  dryMultiplier: 0.8,
  dryBase: 1.75,
  dryAllowedLength: 2,
  dryPenaltyLastN: 1024,
  drySequenceBreakers: ["\n", ":"],
  mirostatMode: 2,
  mirostatTau: 5,
  mirostatEta: 0.1,
  dynatempRange: 0.5,
  dynatempExponent: 1,
  smoothingFactor: 0.3,
  smoothingCurve: 1.5,
  adaptiveTarget: 0.6,
  adaptiveDecay: 0.9,
  minKeep: 2,
  bannedStrings: ["Elara", "shivers down"],
  banEos: true,
  seed: 7,
  stop: ["\nUser:"],
  logitBias: { "13": -100 },
  samplerOrder: ["temperature", "minP", "topK", "penalties"],
} as const satisfies UserIntent;

function localCapability(providerId: string): Capability {
  return synthesizeCapability("generation", "other", { curated: curatedRows({ model: MODEL, providerId: testProviderId(providerId), wire: "openai-compat" }) })
    .capability;
}

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

function chatRequest(providerId: string, params: UserIntent): OpenAiCompatChatRequest {
  return {
    api: "chat-completions",
    connection: fakeResolved({
      task: "chat",
      providerId,
      model: MODEL,
      capability: localCapability(providerId),
      baseUrl: BASE_URL,
      secret: fakeApiKeySecret("not-a-real-key"),
    }),
    params,
    systemPrompt: { static: "You narrate.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Go on." }] }],
  };
}

/** Ollama's native `/api/chat` answering with the rig's recorded NDJSON stream, recording what was posted. */
function ollamaServer(recorded: RecordedRequest[]): typeof fetch {
  const recording = OLLAMA_NATIVE_RECORDINGS.text;
  return (input, init): Promise<Response> => {
    recorded.push({ url: String(input), body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> });
    return Promise.resolve(new Response(recording.body, { status: recording.status, headers: { "content-type": recording.contentType } }));
  };
}

async function turnBody(providerId: string, params: UserIntent): Promise<{ readonly body: Record<string, unknown>; readonly turn: ChatResult }> {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = providerId === "ollama" ? ollamaServer(recorded) : scriptedSseFetch([openAiTextStream("ok")], recorded);
  const turn = await runOpenAiCompatChatTurn(chatRequest(providerId, params), {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: fetchImpl, app: APP },
    tokens: memoryTokenLexicon(),
  });
  return { body: recorded[0]?.body ?? {}, turn };
}

/** The knobs the turn dropped, by name — the warnings that must name only what the server cannot take. */
function droppedKnobs(turn: ChatResult): readonly string[] {
  return turn.events.flatMap((event) => (event.kind === "warning" && event.code === "sampling_knob_dropped" && event.knob !== undefined ? [event.knob] : []));
}

/** The sampler keys a request body carries (everything but the wire's own fields). */
function samplerKeys(body: Record<string, unknown>): readonly string[] {
  const wireOwned = new Set([
    "model",
    "messages",
    "stream",
    "stream_options",
    "max_tokens",
    "user",
    "reasoning_effort",
    "verbosity",
    "response_format",
    "tools",
    "tool_choice",
  ]);
  return Object.keys(body)
    .filter((key) => !wireOwned.has(key) && body[key] !== undefined)
    .toSorted();
}

test("llama.cpp: every sampler rides under the server's own key, repeat_penalty included, with the stage order as names", async () => {
  const { body, turn } = await turnBody("llama-cpp", EVERY_SAMPLER);
  expect(body).toMatchObject({
    temperature: 1.2,
    top_p: 0.9,
    top_k: 40,
    min_p: 0.05,
    frequency_penalty: 0.3,
    presence_penalty: 0.4,
    repeat_penalty: 1.1,
    repeat_last_n: 512,
    typical_p: 0.95,
    top_n_sigma: 1.5,
    xtc_probability: 0.5,
    xtc_threshold: 0.1,
    dry_multiplier: 0.8,
    dry_base: 1.75,
    dry_allowed_length: 2,
    dry_penalty_last_n: 1024,
    dry_sequence_breakers: ["\n", ":"],
    mirostat: 2,
    mirostat_tau: 5,
    mirostat_eta: 0.1,
    dynatemp_range: 0.5,
    dynatemp_exponent: 1,
    adaptive_target: 0.6,
    adaptive_decay: 0.9,
    min_keep: 2,
    ignore_eos: true,
    seed: 7,
    stop: ["\nUser:"],
    // llama.cpp bans a phrase as a `false` logit-bias entry, beside the user's own bias.
    logit_bias: { "13": -100, Elara: false, "shivers down": false },
    // The preset's four stages first, then the server's other stages in its default order (D295).
    samplers: ["temperature", "min_p", "top_k", "penalties", "dry", "top_n_sigma", "typ_p", "top_p", "xtc", "adaptive_p"],
  });
  expect(body["repetition_penalty"]).toBeUndefined();
  expect(body["banned_strings"]).toBeUndefined();
  // llama.cpp has no top-a and no smoothing: those two, and only those, are reported as dropped.
  expect(droppedKnobs(turn).toSorted()).toEqual(["smoothingCurve", "smoothingFactor", "topA"]);
});

test("KoboldCpp: its own spellings, no frequency penalty, and the order as sampler ids", async () => {
  const { body, turn } = await turnBody("koboldcpp", EVERY_SAMPLER);
  expect(body).toMatchObject({
    temperature: 1.2,
    top_k: 40,
    top_a: 0.2,
    min_p: 0.05,
    presence_penalty: 0.4,
    repetition_penalty: 1.1,
    rep_pen_range: 512,
    typical: 0.95,
    nsigma: 1.5,
    mirostat_mode: 2,
    smoothing_factor: 0.3,
    smoothing_curve: 1.5,
    dry_sequence_breakers: ["\n", ":"],
    adaptive_target: 0.6,
    adaptive_decay: 0.9,
    banned_strings: ["Elara", "shivers down"],
    ban_eos_token: true,
    // temperature 5, top_k 0, penalties 6, then top_a 1, typical 4, top_p 2 (min_p is not orderable there).
    sampler_order: [5, 0, 6, 1, 4, 2],
  });
  // KoboldCpp reads frequency_penalty only as a stand-in presence penalty, so it is never sent.
  expect(body["frequency_penalty"]).toBeUndefined();
  expect(body["mirostat"]).toBeUndefined();
  expect(body["ignore_eos"]).toBeUndefined();
  expect(droppedKnobs(turn).toSorted()).toEqual(["frequencyPenalty", "minKeep", "samplerOrder"]);
});

test("Ollama (native /api/chat): every knob its options take rides in `options` under Ollama's names", async () => {
  const { body, turn } = await turnBody("ollama", EVERY_SAMPLER);
  expect(body["options"]).toMatchObject({
    temperature: 1.2,
    top_p: 0.9,
    top_k: 40,
    min_p: 0.05,
    repeat_penalty: 1.1,
    repeat_last_n: 512,
    frequency_penalty: 0.3,
    presence_penalty: 0.4,
    seed: 7,
    stop: ["\nUser:"],
  });
  // No sampler is left at the top level, where `/api/chat` would ignore it.
  expect(samplerKeys(body)).toEqual(["options"]);
  // `/api/chat` has no logit bias, Mirostat, DRY, XTC or smoothing: exactly those are reported as dropped.
  expect(droppedKnobs(turn)).toContain("logitBias");
  expect(droppedKnobs(turn)).toContain("dryMultiplier");
  // Ollama deprecated typical_p, and its options have no phrase ban or EOS ban.
  expect(droppedKnobs(turn)).toEqual(expect.arrayContaining(["typicalP", "bannedStrings", "banEos"]));
  expect(body["options"]).not.toHaveProperty("typical_p");
  expect(droppedKnobs(turn)).not.toContain("topK");
  expect(droppedKnobs(turn)).not.toContain("repetitionPenalty");
});

test("Ollama (native /api/chat): an unset knob is not sent, so the Modelfile's own value applies", async () => {
  const { body } = await turnBody("ollama", {});
  expect(Object.keys((body["options"] ?? {}) as Record<string, unknown>)).toEqual(["num_ctx"]);
});

test("an unset knob is never sent: llama.cpp gets no sampler keys at all", async () => {
  const { body, turn } = await turnBody("llama-cpp", {});
  expect(samplerKeys(body)).toEqual([]);
  expect(droppedKnobs(turn)).toEqual([]);
});

const OPENAI_PLUS_VLLM = [
  "frequency_penalty",
  "logit_bias",
  "min_p",
  "presence_penalty",
  "repetition_penalty",
  "seed",
  "stop",
  "temperature",
  "top_k",
  "top_p",
];

test("vLLM: the OpenAI set plus vLLM's top_k, min_p, repetition_penalty, bad_words and ignore_eos", async () => {
  const { body, turn } = await turnBody("vllm", EVERY_SAMPLER);
  expect(samplerKeys(body)).toEqual([...OPENAI_PLUS_VLLM, "bad_words", "ignore_eos"].toSorted());
  expect(body).toMatchObject({ bad_words: ["Elara", "shivers down"], ignore_eos: true });
  expect(droppedKnobs(turn)).toContain("dryMultiplier");
  expect(droppedKnobs(turn)).toEqual(expect.arrayContaining(["adaptiveTarget", "minKeep"]));
  expect(droppedKnobs(turn)).not.toContain("topK");
});

test("Custom: the vLLM-shaped default, but no phrase or EOS ban it has not been told the server takes", async () => {
  const { body, turn } = await turnBody("custom-openai", EVERY_SAMPLER);
  expect(samplerKeys(body)).toEqual(OPENAI_PLUS_VLLM.toSorted());
  expect(droppedKnobs(turn)).toEqual(expect.arrayContaining(["bannedStrings", "banEos", "dryMultiplier"]));
});

test("llama.cpp: an Adaptive-P target alone sends the server's default chain with adaptive_p, so the target applies", async () => {
  const { body, turn } = await turnBody("llama-cpp", { adaptiveTarget: 0.5 });
  expect(body).toMatchObject({
    adaptive_target: 0.5,
    samplers: ["penalties", "dry", "top_n_sigma", "top_k", "typ_p", "top_p", "min_p", "xtc", "temperature", "adaptive_p"],
  });
  expect(droppedKnobs(turn)).toEqual([]);
});

test("KoboldCpp: an Adaptive-P target sends no order, since its sampler ids have no Adaptive-P stage", async () => {
  const { body } = await turnBody("koboldcpp", { adaptiveTarget: 0.5 });
  expect(body["adaptive_target"]).toBe(0.5);
  expect(body["sampler_order"]).toBeUndefined();
});

test("llama.cpp: banned phrases with no logit bias of the user's become the whole logit_bias", async () => {
  const { body } = await turnBody("llama-cpp", { bannedStrings: ["Elara"] });
  expect(body["logit_bias"]).toEqual({ Elara: false });
});

test("reasoning off reaches vLLM, llama.cpp and KoboldCpp as enable_thinking false; on or unset sends nothing new", async () => {
  for (const providerId of ["vllm", "llama-cpp", "koboldcpp"]) {
    expect((await turnBody(providerId, { effort: "none" })).body["chat_template_kwargs"], providerId).toEqual({
      enable_thinking: false,
      preserve_reasoning: false,
    });
    expect((await turnBody(providerId, { effort: "high" })).body, providerId).not.toHaveProperty("chat_template_kwargs");
    expect((await turnBody(providerId, {})).body, providerId).not.toHaveProperty("chat_template_kwargs");
  }
});

test("reasoning off reaches Custom as enable_thinking false too; a strict proxy is the connection's to answer", async () => {
  expect((await turnBody("custom-openai", { effort: "none" })).body["chat_template_kwargs"]).toEqual({ enable_thinking: false, preserve_reasoning: false });
});

test("reasoning off on Ollama's native route adds no template kwargs", async () => {
  const { body } = await turnBody("ollama", { effort: "none" });
  expect(body).not.toHaveProperty("chat_template_kwargs");
});

test("a thinking budget rides each local server's own field, and a server with none drops it with a warning", async () => {
  const budgetCapability = (providerId: string): Capability => {
    const capability = localCapability(providerId);
    if (capability.kind !== "generation") {
      throw new Error("a local chat row synthesizes a generation capability");
    }
    return { ...capability, generation: { ...capability.generation, reasoning: { mode: "budget", enabled: true, budgetRange: { min: 128, max: 8192 } } } };
  };
  const budgetTurn = async (providerId: string): Promise<{ readonly body: Record<string, unknown>; readonly turn: ChatResult }> => {
    const recorded: RecordedRequest[] = [];
    const request = chatRequest(providerId, { effort: "high", thinkingBudgetTokens: 1024, maxOutputTokens: 4096 });
    const turn = await runOpenAiCompatChatTurn(
      { ...request, connection: { ...request.connection, capability: budgetCapability(providerId) } },
      { now: () => NOW, log: silentLog(), transport: { fetch: scriptedSseFetch([openAiTextStream("ok")], recorded), app: APP }, tokens: memoryTokenLexicon() },
    );
    return { body: recorded[0]?.body ?? {}, turn };
  };
  expect((await budgetTurn("llama-cpp")).body["thinking_budget_tokens"]).toBe(1024);
  expect((await budgetTurn("koboldcpp")).body["thinking_budget_tokens"]).toBe(1024);
  expect((await budgetTurn("vllm")).body["thinking_token_budget"]).toBe(1024);
  const custom = await budgetTurn("custom-openai");
  expect(custom.body["thinking_budget_tokens"]).toBeUndefined();
  expect(custom.body["thinking_token_budget"]).toBeUndefined();
  expect(droppedKnobs(custom.turn)).toContain("thinkingBudgetTokens");
});

test("a repetition penalty of 0 clamps above zero on every local server, so none divides by it", async () => {
  expect((await turnBody("llama-cpp", { repetitionPenalty: 0 })).body["repeat_penalty"]).toBe(0.01);
  expect((await turnBody("koboldcpp", { repetitionPenalty: 0 })).body["repetition_penalty"]).toBe(0.01);
  expect((await turnBody("vllm", { repetitionPenalty: 0 })).body["repetition_penalty"]).toBe(0.01);
  expect((await turnBody("lm-studio", { repetitionPenalty: 0 })).body["repeat_penalty"]).toBe(0.01);
  expect((await turnBody("ollama", { repetitionPenalty: 0 })).body["options"]).toMatchObject({ repeat_penalty: 0.01 });
});

test("LM Studio: its documented set, with repeat_penalty", async () => {
  const { body, turn } = await turnBody("lm-studio", EVERY_SAMPLER);
  expect(droppedKnobs(turn)).toEqual(expect.arrayContaining(["bannedStrings", "banEos", "adaptiveTarget"]));
  expect(samplerKeys(body)).toEqual(
    ["frequency_penalty", "logit_bias", "presence_penalty", "repeat_penalty", "seed", "stop", "temperature", "top_k", "top_p"].toSorted(),
  );
});

test("one preset, two servers: each wire carries only its target's knobs", async () => {
  const preset = { dryMultiplier: 0.8, temperature: 1 } satisfies UserIntent;
  const llama = await turnBody("llama-cpp", preset);
  const ollama = await turnBody("ollama", preset);
  expect(llama.body["dry_multiplier"]).toBe(0.8);
  expect(ollama.body["dry_multiplier"]).toBeUndefined();
  expect(ollama.body["options"]).not.toHaveProperty("dry_multiplier");
  expect(droppedKnobs(ollama.turn)).toEqual(["dryMultiplier"]);
  expect(droppedKnobs(llama.turn)).toEqual([]);
});

test("a declared spelling overrides one row key and keeps the row's others", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "koboldcpp",
    model: MODEL,
    capability: localCapability("koboldcpp"),
    baseUrl: BASE_URL,
    secret: fakeApiKeySecret("not-a-real-key"),
    declaredFeatures: { samplerKeys: { topA: "top_a_custom" } },
  });
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(
    { ...chatRequest("koboldcpp", { topA: 0.2, typicalP: 0.9 }), connection },
    { now: () => NOW, log: silentLog(), transport: { fetch: scriptedSseFetch([openAiTextStream("ok")], recorded), app: APP }, tokens: memoryTokenLexicon() },
  );
  expect(recorded[0]?.body).toMatchObject({ top_a_custom: 0.2, typical: 0.9 });
});

const COMPLETION = JSON.stringify({
  id: "gen-batch",
  object: "chat.completion",
  created: 1_700_000_000,
  model: MODEL,
  choices: [{ index: 0, message: { role: "assistant", content: "A summary." }, finish_reason: "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
});

test("a side-generation call takes the chat turn's capability gate: OpenAI gets no top_k, and a 3.0 temperature clamps to the model's 2", async () => {
  const recorded: RecordedRequest[] = [];
  const deps: BatchDeps = {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: scriptedJsonFetch([COMPLETION], recorded), app: APP },
    normalize: passthroughImageNormalizer,
  };
  await runOpenAiCompatSummarize(
    {
      connection: fakeResolved({
        task: "summarize",
        providerId: "openai",
        model: "gpt-4.1",
        capability: generationCapability({ sampling: { temperature: { min: 0, max: 2 } } }),
        secret: fakeApiKeySecret("sk-not-a-real-key"),
      }),
      inputs: [{ systemPrompt: "Summarize.", userPrompt: "A long scene." }],
      temperature: 3,
      topK: 40,
      maxTokens: 256,
    },
    deps,
  );
  expect(recorded[0]?.body["temperature"]).toBe(2);
  expect(recorded[0]?.body).not.toHaveProperty("top_k");
});

test("a side-generation call (a posture's temperature, the summarizer's penalties) reaches llama.cpp under the chat turn's spelling", async () => {
  const recorded: RecordedRequest[] = [];
  const deps: BatchDeps = {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: scriptedJsonFetch([COMPLETION], recorded), app: APP },
    normalize: passthroughImageNormalizer,
  };
  await runOpenAiCompatSummarize(
    {
      connection: fakeResolved({
        task: "summarize",
        providerId: "llama-cpp",
        model: MODEL,
        capability: localCapability("llama-cpp"),
        baseUrl: BASE_URL,
        secret: fakeApiKeySecret("not-a-real-key"),
      }),
      inputs: [{ systemPrompt: "Summarize.", userPrompt: "A long scene." }],
      temperature: 0.4,
      topK: 20,
      repetitionPenalty: 1.05,
      maxTokens: 256,
    },
    deps,
  );
  expect(recorded[0]?.body).toMatchObject({ temperature: 0.4, top_k: 20, repeat_penalty: 1.05, max_tokens: 256 });
  expect(recorded[0]?.body["repetition_penalty"]).toBeUndefined();
});
