// The local-server probe batch. For each rig arm (`rig.sh`): record what the server advertises (raw, as
// fixtures for the parser tests), run the real catalog reader over it, then prove each capability end to end
// against the same server: a tool call round-trips, an image part is described, an embedding has the
// advertised width, a JSON-schema response parses. The Ollama arm also measures whether `/v1/chat/completions`
// honours a context window above the server default (`ollama-ctx`).
//
//   node scripts/probes/local-servers/run.ts [arm …]     a subset by name (default: every arm)
//
// Evidence: `results/<arm>.jsonl` (one row per probe) and `results/raw/<arm>/<endpoint>.json`. The raw
// advertisements are also written to `tests/inference/catalog/_local-servers-fixtures.ts` so the unit tests
// read exactly what the servers said. Nothing here leaves the loopback rig.

import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { NO_PROVIDER_SECRETS } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { fetchEndpointModels } from "../../../packages/inference/src/catalog/endpoint.ts";
import type { EndpointModel } from "../../../packages/inference/src/contract/runtime.ts";
import { DIR, http, jsonl, RED_SQUARE_PNG_DATA_URI, waitFor, writeRaw } from "./_kit.ts";

type ModelInfoApi = "ollama" | "llama-cpp" | "koboldcpp";

interface Arm {
  readonly name: string;
  readonly baseUrl: string;
  readonly modelInfoApi: ModelInfoApi;
  readonly health: string;
  /** Which model id each probe targets; a probe absent here is not run on the arm. */
  readonly probes: {
    readonly tools?: string;
    /** A server that states nothing about tools: record whether a call comes back, with no verdict on it. */
    readonly toolsUnstated?: string;
    readonly noTools?: string;
    readonly vision?: string;
    readonly noVision?: string;
    readonly embed?: string;
    readonly structured?: string;
    readonly ctx?: string;
  };
  readonly record: readonly (readonly [name: string, path: string, body?: unknown])[];
}

const OLLAMA = "http://127.0.0.1:28111";
const ARMS: readonly Arm[] = [
  {
    name: "ollama",
    baseUrl: `${OLLAMA}/v1`,
    modelInfoApi: "ollama",
    health: `${OLLAMA}/api/version`,
    probes: {
      tools: "qwen2.5:0.5b",
      noTools: "moondream:latest",
      vision: "moondream:latest",
      noVision: "qwen2.5:0.5b",
      embed: "nomic-embed-text:latest",
      structured: "qwen2.5:0.5b",
      ctx: "qwen2.5:0.5b",
    },
    record: [
      ["api-version", "/api/version"],
      ["v1-models", "/v1/models"],
      ["api-ps", "/api/ps"],
      ["api-show-qwen2.5-0.5b", "/api/show", { model: "qwen2.5:0.5b" }],
      ["api-show-moondream", "/api/show", { model: "moondream:latest" }],
      ["api-show-nomic-embed-text", "/api/show", { model: "nomic-embed-text:latest" }],
    ],
  },
  {
    name: "llamacpp-chat",
    baseUrl: "http://127.0.0.1:28112/v1",
    modelInfoApi: "llama-cpp",
    health: "http://127.0.0.1:28112/health",
    probes: { tools: "", structured: "", noVision: "" },
    record: [
      ["props", "/props"],
      ["v1-models", "/v1/models"],
    ],
  },
  {
    name: "llamacpp-vision",
    baseUrl: "http://127.0.0.1:28113/v1",
    modelInfoApi: "llama-cpp",
    health: "http://127.0.0.1:28113/health",
    probes: { vision: "" },
    record: [
      ["props", "/props"],
      ["v1-models", "/v1/models"],
    ],
  },
  {
    name: "llamacpp-embed",
    baseUrl: "http://127.0.0.1:28114/v1",
    modelInfoApi: "llama-cpp",
    health: "http://127.0.0.1:28114/health",
    probes: { embed: "" },
    record: [
      ["props", "/props"],
      ["v1-models", "/v1/models"],
    ],
  },
  {
    name: "llamacpp-router",
    baseUrl: "http://127.0.0.1:28115/v1",
    modelInfoApi: "llama-cpp",
    health: "http://127.0.0.1:28115/health",
    probes: {},
    record: [
      ["props", "/props"],
      ["v1-models", "/v1/models"],
    ],
  },
  {
    name: "kobold-chat",
    baseUrl: "http://127.0.0.1:28116/v1",
    modelInfoApi: "koboldcpp",
    health: "http://127.0.0.1:28116/api/extra/version",
    // KoboldCpp states no tool support, so the tool probe here only records whether a call comes back; an
    // image sent to its text model is dropped silently (measured), so there is no refusal to prove.
    probes: { toolsUnstated: "", structured: "", embed: "" },
    record: [
      ["api-extra-version", "/api/extra/version"],
      ["props", "/props"],
      ["v1-models", "/v1/models"],
      ["api-v1-model", "/api/v1/model"],
    ],
  },
  {
    name: "kobold-universal",
    baseUrl: "http://127.0.0.1:28118/v1",
    modelInfoApi: "koboldcpp",
    health: "http://127.0.0.1:28118/api/extra/version",
    probes: { toolsUnstated: "", structured: "" },
    record: [
      ["api-extra-version", "/api/extra/version"],
      ["props", "/props"],
      ["v1-models", "/v1/models"],
    ],
  },
  {
    name: "kobold-vision",
    baseUrl: "http://127.0.0.1:28117/v1",
    modelInfoApi: "koboldcpp",
    health: "http://127.0.0.1:28117/api/extra/version",
    probes: { vision: "" },
    record: [
      ["api-extra-version", "/api/extra/version"],
      ["props", "/props"],
      ["v1-models", "/v1/models"],
    ],
  },
];

const requestedArms = process.argv.slice(2);
const selected = requestedArms.length > 0 ? ARMS.filter((arm) => requestedArms.includes(arm.name)) : ARMS;

const HTTP_OK = 200;
const SNIPPET = 200;
const ERROR_SNIPPET = 400;
const ANSWER_SNIPPET = 60;
const TOOL_MAX_TOKENS = 200;
const VISION_MAX_TOKENS = 20;
const STRUCTURED_MAX_TOKENS = 100;
const CTX_MAX_TOKENS = 10;
const HEALTH_TRIES = 300;

const WEATHER_TOOL = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a city",
    parameters: { type: "object", properties: { city: { type: "string", description: "The city name" } }, required: ["city"] },
  },
};

const ANSWER_SCHEMA = {
  type: "object",
  properties: { city: { type: "string" }, population: { type: "integer" } },
  required: ["city", "population"],
  additionalProperties: false,
};

function rootOf(baseUrl: string): string {
  return baseUrl.replace(/\/v1$/u, "");
}

function content(json: unknown): string {
  const choice = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  return typeof choice?.message?.content === "string" ? choice.message.content : "";
}

function toolCalls(json: unknown): { readonly name: string; readonly arguments: string }[] {
  const choice = (json as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] })?.choices?.[0];
  return (choice?.message?.tool_calls ?? []).map((call) => ({ name: call.function?.name ?? "", arguments: call.function?.arguments ?? "" }));
}

function modelFor(rows: readonly EndpointModel[], target: string): string {
  // A single-model server lists one id; an empty probe target means "whatever it lists".
  return target.length > 0 ? target : (rows[0]?.id ?? "");
}

function toolProbeName(expectAccepted: boolean | null): string {
  if (expectAccepted === null) {
    return "tools-unstated";
  }
  return expectAccepted ? "tools" : "no-tools";
}

async function probeTools(arm: Arm, model: string, expectAccepted: boolean | null, log: ReturnType<typeof jsonl>): Promise<boolean> {
  const res = await http(`${arm.baseUrl}/chat/completions`, {
    body: {
      model,
      messages: [{ role: "user", content: "What is the weather in Paris right now? You must call the get_weather tool to find out." }],
      tools: [WEATHER_TOOL],
      tool_choice: "auto",
      temperature: 0,
      max_tokens: TOOL_MAX_TOKENS,
    },
  });
  const calls = toolCalls(res.json);
  const roundTripped = res.status === HTTP_OK && calls.some((call) => call.name === "get_weather");
  let ok = roundTripped;
  if (expectAccepted === false) {
    ok = res.status !== HTTP_OK || calls.length === 0;
  } else if (expectAccepted === null) {
    ok = res.status === HTTP_OK;
  }
  log.row({
    kind: "probe",
    probe: toolProbeName(expectAccepted),
    roundTripped,
    model,
    status: res.status,
    ms: res.ms,
    toolCalls: calls,
    content: content(res.json).slice(0, SNIPPET),
    error: res.status === HTTP_OK ? null : res.text.slice(0, ERROR_SNIPPET),
    ok,
  });
  return ok;
}

async function probeVision(arm: Arm, model: string, expectAccepted: boolean, log: ReturnType<typeof jsonl>): Promise<boolean> {
  const res = await http(`${arm.baseUrl}/chat/completions`, {
    body: {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is the main colour of this image? Answer with one word." },
            { type: "image_url", image_url: { url: RED_SQUARE_PNG_DATA_URI } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: VISION_MAX_TOKENS,
    },
  });
  const answer = content(res.json);
  const described = /red/iu.test(answer);
  const ok = expectAccepted ? res.status === HTTP_OK && described : res.status !== HTTP_OK || !described;
  log.row({
    kind: "probe",
    probe: expectAccepted ? "vision" : "no-vision",
    model,
    status: res.status,
    ms: res.ms,
    answer: answer.slice(0, SNIPPET),
    error: res.status === HTTP_OK ? null : res.text.slice(0, ERROR_SNIPPET),
    ok,
  });
  return ok;
}

async function probeEmbed(arm: Arm, model: string, advertisedDims: number | undefined, log: ReturnType<typeof jsonl>): Promise<boolean> {
  const res = await http(`${arm.baseUrl}/embeddings`, { body: { model, input: "The quick brown fox jumps over the lazy dog." } });
  const vector = (res.json as { data?: { embedding?: unknown }[] })?.data?.[0]?.embedding;
  const width = Array.isArray(vector) ? vector.length : null;
  const ok = res.status === HTTP_OK && width !== null && (advertisedDims === undefined || width === advertisedDims);
  log.row({
    kind: "probe",
    probe: "embed",
    model,
    status: res.status,
    ms: res.ms,
    width,
    advertisedDims: advertisedDims ?? null,
    error: res.status === HTTP_OK ? null : res.text.slice(0, ERROR_SNIPPET),
    ok,
  });
  return ok;
}

async function probeStructured(arm: Arm, model: string, log: ReturnType<typeof jsonl>): Promise<boolean> {
  const res = await http(`${arm.baseUrl}/chat/completions`, {
    body: {
      model,
      messages: [{ role: "user", content: "Give the capital city of France and its population as JSON." }],
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: ANSWER_SCHEMA } },
      temperature: 0,
      max_tokens: STRUCTURED_MAX_TOKENS,
    },
  });
  const text = content(res.json);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const record = parsed as { city?: unknown; population?: unknown } | null;
  const ok = res.status === HTTP_OK && record !== null && typeof record.city === "string" && Number.isInteger(record.population);
  log.row({
    kind: "probe",
    probe: "structured",
    model,
    status: res.status,
    ms: res.ms,
    content: text.slice(0, SNIPPET),
    error: res.status === HTTP_OK ? null : res.text.slice(0, ERROR_SNIPPET),
    ok,
  });
  return ok;
}

// ── the Ollama context probe (`ollama-ctx`) ────────────────────────────────────────────────────────────
// A fact at the very start of a prompt longer than the server's default window, then a question about it.
// `/v1/chat/completions` carries no window knob; `/api/chat` takes `options.num_ctx`. Both report how many
// prompt tokens the model actually evaluated, so a silent truncation shows as a smaller count and a lost fact.

const SECRET = "PINEAPPLE";
const LONG_PROMPT_WORDS = 5000;
const FILLER_WORDS = 16;
const PINNED_NUM_CTX = 16_384;
const FILLER_SENTENCE = "The archive catalogues river names, harvest records, and the weather of each season in plain prose. ";

function longPrompt(words: number): string {
  const filler = FILLER_SENTENCE.repeat(Math.ceil(words / FILLER_WORDS));
  return `The secret word is ${SECRET}. Remember it.\n\n${filler}\n\nWhat is the secret word? Answer with the word only.`;
}

async function probeOllamaCtx(arm: Arm, model: string, log: ReturnType<typeof jsonl>): Promise<void> {
  const root = rootOf(arm.baseUrl);
  const prompt = longPrompt(LONG_PROMPT_WORDS);
  const openAi = async (modelId: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const res = await http(`${arm.baseUrl}/chat/completions`, {
      body: { model: modelId, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: CTX_MAX_TOKENS, ...extra },
    });
    const usage = (res.json as { usage?: { prompt_tokens?: number } })?.usage;
    return {
      status: res.status,
      ms: res.ms,
      promptTokens: usage?.prompt_tokens ?? null,
      answer: content(res.json).slice(0, ANSWER_SNIPPET),
      recalled: content(res.json).includes(SECRET),
    };
  };
  const native = async (modelId: string, options: Record<string, unknown> | undefined): Promise<Record<string, unknown>> => {
    const res = await http(`${root}/api/chat`, {
      body: { model: modelId, messages: [{ role: "user", content: prompt }], stream: false, ...(options === undefined ? {} : { options }) },
    });
    const body = res.json as { prompt_eval_count?: number; message?: { content?: string } };
    const answer = body?.message?.content ?? "";
    return {
      status: res.status,
      ms: res.ms,
      promptEvalCount: body?.prompt_eval_count ?? null,
      answer: answer.slice(0, ANSWER_SNIPPET),
      recalled: answer.includes(SECRET),
    };
  };

  log.row({ kind: "ctx", arm: "v1 default", ...(await openAi(model)) });
  log.row({ kind: "ctx", arm: "api/chat default", ...(await native(model, undefined)) });
  log.row({ kind: "ctx", arm: "api/chat num_ctx=16384", ...(await native(model, { num_ctx: PINNED_NUM_CTX })) });
  log.row({ kind: "ctx", arm: "v1 with body num_ctx=16384 (unknown field)", ...(await openAi(model, { num_ctx: PINNED_NUM_CTX })) });
  log.row({ kind: "ctx", arm: "v1 with options.num_ctx=16384 (unknown field)", ...(await openAi(model, { options: { num_ctx: PINNED_NUM_CTX } })) });

  // A Modelfile pin: the same weights under a new name with `num_ctx` set.
  const pinned = "qwen2.5-ctx16k:latest";
  const created = await http(`${root}/api/create`, { body: { model: pinned, from: model, parameters: { num_ctx: PINNED_NUM_CTX }, stream: false } });
  log.row({ kind: "ctx", arm: "api/create pinned model", status: created.status, body: created.text.slice(0, SNIPPET) });
  if (created.status === HTTP_OK) {
    log.row({ kind: "ctx", arm: "v1 pinned num_ctx=16384", ...(await openAi(pinned)) });
    const show = await http(`${root}/api/show`, { body: { model: pinned } });
    writeRaw(arm.name, "api-show-pinned", show.json);
    await http(`${root}/api/delete`, { method: "DELETE", body: { model: pinned } }).catch(() => undefined);
  }
}

// ── the batch ──────────────────────────────────────────────────────────────────────────────────────────

const fixtures: Record<string, Record<string, unknown>> = {};

for (const arm of selected) {
  const log = jsonl(arm.name);
  console.log(`\n=== ${arm.name} (${arm.baseUrl})`);
  await waitFor(arm.health, HEALTH_TRIES);
  const root = rootOf(arm.baseUrl);
  const recorded: Record<string, unknown> = {};
  for (const [name, endpoint, body] of arm.record) {
    const res = await http(`${root}${endpoint}`, body === undefined ? undefined : { body });
    recorded[name] = res.json;
    writeRaw(arm.name, name, res.json);
    log.row({ kind: "advertised", endpoint, status: res.status, bytes: res.text.length });
  }
  fixtures[arm.name] = recorded;

  const rows = await fetchEndpointModels({
    fetch,
    baseUrl: arm.baseUrl,
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: arm.modelInfoApi as never,
    warn: (message) => log.row({ kind: "warn", message }),
  });
  log.row({ kind: "detected", rows });
  console.log(JSON.stringify(rows));

  const verdict: Record<string, boolean> = {};
  const { probes } = arm;
  if (probes.tools !== undefined) {
    verdict["tools"] = await probeTools(arm, modelFor(rows, probes.tools), true, log);
  }
  if (probes.toolsUnstated !== undefined) {
    verdict["toolsUnstated"] = await probeTools(arm, modelFor(rows, probes.toolsUnstated), null, log);
  }
  if (probes.noTools !== undefined) {
    verdict["noTools"] = await probeTools(arm, modelFor(rows, probes.noTools), false, log);
  }
  if (probes.vision !== undefined) {
    verdict["vision"] = await probeVision(arm, modelFor(rows, probes.vision), true, log);
  }
  if (probes.noVision !== undefined) {
    verdict["noVision"] = await probeVision(arm, modelFor(rows, probes.noVision), false, log);
  }
  if (probes.embed !== undefined) {
    const model = modelFor(rows, probes.embed);
    verdict["embed"] = await probeEmbed(arm, model, rows.find((row) => row.id === model)?.embeddingDims, log);
  }
  if (probes.structured !== undefined) {
    verdict["structured"] = await probeStructured(arm, modelFor(rows, probes.structured), log);
  }
  if (probes.ctx !== undefined) {
    await probeOllamaCtx(arm, probes.ctx, log);
  }
  log.row({ kind: "verdict", verdict });
  console.log(JSON.stringify({ arm: arm.name, verdict }));
}

// The fixture module holds every arm, so a subset run leaves it alone rather than dropping the arms it skipped.
if (requestedArms.length === 0) {
  const fixturePath = path.join(DIR, "../../../tests/inference/catalog/_local-servers-fixtures.ts");
  const header = [
    "// GENERATED by scripts/probes/local-servers/run.ts — the raw advertisements each rig server answered, in the",
    "// server's own field names, so the catalog reader tests parse exactly what the servers said. Re-run the rig",
    "// to refresh (then format with biome); never hand-edit.",
    "",
    "export const LOCAL_SERVER_FIXTURES = ",
  ].join("\n");
  writeFileSync(fixturePath, `${header}${JSON.stringify(fixtures, null, 2)} as const;\n`);
  console.log(`\nfixtures → ${fixturePath}`);
} else {
  console.log("\nfixtures not rewritten: a subset run keeps the recorded arms it skipped");
}
