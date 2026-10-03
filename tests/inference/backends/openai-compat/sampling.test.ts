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
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { openAiTextStream, scriptedJsonFetch, scriptedSseFetch } from "../_hosted-support.ts";

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

async function turnBody(providerId: string, params: UserIntent): Promise<{ readonly body: Record<string, unknown>; readonly turn: ChatResult }> {
  const recorded: RecordedRequest[] = [];
  const turn = await runOpenAiCompatChatTurn(chatRequest(providerId, params), {
    now: () => NOW,
    log: silentLog(),
    transport: { fetch: scriptedSseFetch([openAiTextStream("ok")], recorded), app: APP },
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
    seed: 7,
    stop: ["\nUser:"],
    logit_bias: { "13": -100 },
    // The preset's four stages first, then the server's other stages in its default order (D295).
    samplers: ["temperature", "min_p", "top_k", "penalties", "dry", "top_n_sigma", "typ_p", "top_p", "xtc"],
  });
  expect(body["repetition_penalty"]).toBeUndefined();
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
    // temperature 5, top_k 0, penalties 6, then top_a 1, typical 4, top_p 2 (min_p is not orderable there).
    sampler_order: [5, 0, 6, 1, 4, 2],
  });
  // KoboldCpp reads frequency_penalty only as a stand-in presence penalty, so it is never sent.
  expect(body["frequency_penalty"]).toBeUndefined();
  expect(body["mirostat"]).toBeUndefined();
  expect(droppedKnobs(turn).toSorted()).toEqual(["frequencyPenalty", "samplerOrder"]);
});

test("Ollama (OpenAI route): the six knobs its decoder keeps ride; the rest drop loudly", async () => {
  const { body, turn } = await turnBody("ollama", EVERY_SAMPLER);
  expect(samplerKeys(body)).toEqual(["frequency_penalty", "presence_penalty", "seed", "stop", "temperature", "top_p"]);
  expect(droppedKnobs(turn)).toContain("topK");
  expect(droppedKnobs(turn)).toContain("minP");
  expect(droppedKnobs(turn)).toContain("repetitionPenalty");
  expect(droppedKnobs(turn)).not.toContain("temperature");
});

test("Ollama (OpenAI route): an unset temperature and top-p go out at Ollama's own defaults, never its injected 1.0", async () => {
  const { body } = await turnBody("ollama", {});
  expect(body).toMatchObject({ temperature: 0.8, top_p: 0.9 });
  const explicit = await turnBody("ollama", { temperature: 0.3 });
  expect(explicit.body).toMatchObject({ temperature: 0.3, top_p: 0.9 });
});

test("an unset knob is never sent to a server that has no fill: llama.cpp gets no sampler keys at all", async () => {
  const { body, turn } = await turnBody("llama-cpp", {});
  expect(samplerKeys(body)).toEqual([]);
  expect(droppedKnobs(turn)).toEqual([]);
});

test("vLLM and Custom: the OpenAI set plus vLLM's top_k, min_p and repetition_penalty", async () => {
  for (const providerId of ["vllm", "custom-openai"]) {
    const { body, turn } = await turnBody(providerId, EVERY_SAMPLER);
    expect(samplerKeys(body)).toEqual(
      ["frequency_penalty", "logit_bias", "min_p", "presence_penalty", "repetition_penalty", "seed", "stop", "temperature", "top_k", "top_p"].toSorted(),
    );
    expect(droppedKnobs(turn)).toContain("dryMultiplier");
    expect(droppedKnobs(turn)).not.toContain("topK");
  }
});

test("LM Studio: its documented set, with repeat_penalty", async () => {
  const { body } = await turnBody("lm-studio", EVERY_SAMPLER);
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
    { now: () => NOW, log: silentLog(), transport: { fetch: scriptedSseFetch([openAiTextStream("ok")], recorded), app: APP } },
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
