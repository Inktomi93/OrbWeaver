// @subject packages/inference/src/catalog/endpoint.ts
// NanoGPT states each model's limits only in its detailed list. A stated window and output cap are reported on the
// connection; a model the list leaves null runs on the floor, marked assumed.
import type { Capability, DeclaredCapability, ModelListing } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, declaredCapabilitySchema, TOOLS_PARAMETER } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { z } from "zod";
import { createRuntimeRoot, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const NANOGPT = BUILTIN_PROVIDERS.find((provider) => provider.id === "nanogpt");
const STATED_MODEL = "vendor/stated-limits";
const STATED_NAME = "Stated Limits";
const UNSTATED_MODEL = "vendor/unlisted-limits";
const STATED_WINDOW = 262_144;
const STATED_OUTPUT = 32_768;
const PROMPT_PER_MILLION = 2;
const COMPLETION_PER_MILLION = 10;
// The API reference states cache prices per thousand tokens: 0.0001 is 0.1 per million.
const CACHE_READ_PER_THOUSAND = 0.0001;
const CACHE_READ_PER_MILLION = 0.1;

// The docs' detailed-mode row shape under an id no curated row names, so every figure comes from the list, and a
// row whose limits the list leaves null.
const DETAILED_LIST = {
  object: "list",
  data: [
    {
      id: STATED_MODEL,
      object: "model",
      name: STATED_NAME,
      ["context_length"]: STATED_WINDOW,
      ["max_output_tokens"]: STATED_OUTPUT,
      capabilities: { vision: true, reasoning: true, ["tool_calling"]: true, ["parallel_tool_calls"]: false, ["structured_output"]: true },
      pricing: {
        prompt: PROMPT_PER_MILLION,
        completion: COMPLETION_PER_MILLION,
        cacheReadInputPer1kTokens: CACHE_READ_PER_THOUSAND,
        currency: "USD",
        unit: "per_million_tokens",
      },
    },
    {
      id: UNSTATED_MODEL,
      object: "model",
      ["context_length"]: null,
      ["max_output_tokens"]: null,
      capabilities: { vision: false },
      pricing: { prompt: null, completion: 1 },
    },
  ],
};

function nanoGpt(): NonNullable<typeof NANOGPT> {
  if (NANOGPT === undefined) {
    throw new Error("the built-in providers carry no NanoGPT row");
  }
  return NANOGPT;
}

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
}

// The chat list on its read; the embedding and rerank lists beside it answer empty.
function nanoGptHost(seen: Seen[], list: unknown = DETAILED_LIST): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    seen.push({ url: request.url, authorization: request.headers.get("authorization") });
    return Promise.resolve(Response.json(new URL(request.url).pathname.endsWith("/models") ? list : { object: "list", data: [] }));
  };
}

async function draftListing(root: ServerTestHarness): Promise<ModelListing> {
  return await root.services.connection.draftCatalogModels({
    principal: await root.principalFor(root.ownerId),
    providerId: nanoGpt().id,
    key: RUNTIME_KEY,
    signal: new AbortController().signal,
  });
}

function listedEntry(listing: ModelListing, id: string): Extract<ModelListing, { listed: true }>["models"][number] | undefined {
  return listing.listed ? listing.models.find((model) => model.id === id) : undefined;
}

function generationOf(capability: Capability): Extract<Capability, { kind: "generation" }>["generation"] {
  if (capability.kind !== "generation") {
    throw new Error(`the connection resolved as ${capability.kind}, not a generation model`);
  }
  return capability.generation;
}

async function connectionCapability(root: ServerTestHarness, model: string): Promise<Capability> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: nanoGpt().id, key: RUNTIME_KEY });
  const row = await root.services.connection.create({ principal, providerId: nanoGpt().id, credentialId: credential.id, baseUrl: null, model });
  return (await root.services.connection.capabilities({ principal, connectionId: row.id, signal: new AbortController().signal })).capability;
}

test("the add dialog reads the detailed list under the typed key and lists each model's stated facts", async () => {
  const seen: Seen[] = [];
  await using root = await createRuntimeRoot({ providerFetch: nanoGptHost(seen) });
  const listing = await draftListing(root);
  expect(seen[0]).toEqual({ url: "https://api.nano-gpt.com/api/v1/models?detailed=true", authorization: `Bearer ${RUNTIME_KEY}` });
  expect(listedEntry(listing, STATED_MODEL)).toMatchObject({
    name: STATED_NAME,
    contextLength: STATED_WINDOW,
    maxCompletionTokens: STATED_OUTPUT,
    promptPrice: 0.000_002,
    completionPrice: 0.000_01,
    inputModalities: ["text", "image"],
    supportedParameters: [TOOLS_PARAMETER],
  });
  const unstated = listedEntry(listing, UNSTATED_MODEL);
  expect(unstated).toMatchObject({ id: UNSTATED_MODEL, contextLength: null, promptPrice: null, completionPrice: 0.000_001, supportedParameters: [] });
});

test("a connection on a model the list states limits for reports its window and output cap", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptHost([]) });
  const capability = await connectionCapability(root, STATED_MODEL);
  expect(capability).toMatchObject({
    kind: "generation",
    generation: { context: { window: STATED_WINDOW }, output: { maxTokens: { max: STATED_OUTPUT }, structured: true } },
  });
  const { context, output } = generationOf(capability);
  expect(context.windowEstimated).toBeUndefined();
  expect(output.maxTokensEstimated).toBeUndefined();
});

test("a connection on a model the list leaves null runs on the floor, marked assumed", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptHost([]) });
  const capability = await connectionCapability(root, UNSTATED_MODEL);
  expect(capability).toMatchObject({
    kind: "generation",
    generation: { context: { windowEstimated: true }, output: { maxTokensEstimated: true } },
  });
  // Positive control: the same list's stated row is not marked, so the mark comes from the null.
  const stated = await connectionCapability(root, STATED_MODEL);
  expect(generationOf(stated).context.windowEstimated).toBeUndefined();
});

// Rows a list could send beside a good one: each wrong field states nothing and leaves its neighbours stated.
const GOOD_ROW = DETAILED_LIST.data[0];
const HOSTILE_LIST = {
  object: "list",
  data: [
    GOOD_ROW,
    { id: "hostile/flag", capabilities: { vision: "yes", ["tool_calling"]: true }, ["context_length"]: "131072" },
    { id: "hostile/price", pricing: { prompt: -1, completion: 2 } },
    { id: "hostile/cap-above-window", ["context_length"]: 8192, ["max_output_tokens"]: 1_000_000 },
    { id: "hostile/image-only", architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["image"] } },
    { id: "" },
    "not a row",
  ],
};

test("a malformed field states nothing while its neighbours, and the good rows beside it, still state theirs", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptHost([], HOSTILE_LIST) });
  const listing = await draftListing(root);
  expect(listing.listed ? listing.models.map((model) => model.id) : []).toEqual([STATED_MODEL, "hostile/flag", "hostile/price", "hostile/cap-above-window"]);
  expect(listedEntry(listing, STATED_MODEL)).toMatchObject({ contextLength: STATED_WINDOW, maxCompletionTokens: STATED_OUTPUT });
  expect(listedEntry(listing, "hostile/flag")).toMatchObject({ contextLength: null, supportedParameters: [TOOLS_PARAMETER], inputModalities: [] });
  expect(listedEntry(listing, "hostile/price")).toMatchObject({ promptPrice: null, completionPrice: 0.000_002 });
  expect(listedEntry(listing, "hostile/cap-above-window")).toMatchObject({ contextLength: 8192 });
  expect(listedEntry(listing, "hostile/cap-above-window")?.maxCompletionTokens ?? null).toBeNull();
});

// The live list's effort shapes: a thinker that can stop, one that cannot, and a word outside our levels.
const THINKER_LIST = {
  object: "list",
  data: [
    { id: "vendor/switchable", capabilities: { reasoning: true }, ["reasoning_efforts"]: ["none", "low", "high", "turbo"] },
    { id: "vendor/always-thinks", capabilities: { reasoning: true }, ["reasoning_efforts"]: ["low", "medium", "high", "xhigh", "max"] },
  ],
};

test("a thinker offers only the efforts its row lists, and one whose list has no none is mandatory", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptHost([], THINKER_LIST) });
  const switchable = generationOf(await connectionCapability(root, "vendor/switchable")).reasoning;
  expect(switchable).toMatchObject({ mode: "effort", effortLevels: ["low", "high"], defaultEnabled: true });
  expect(switchable.mandatory).toBeUndefined();
  expect(generationOf(await connectionCapability(root, "vendor/always-thinks")).reasoning).toMatchObject({
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    mandatory: true,
  });
});

const TOKENS_IN = 41;
const TOKENS_OUT = 7;
const TOKENS_CACHED = 20;
const TOKENS_PER_MILLION = 1_000_000;

// The chat list on its read (the side lists answer empty), a one-word stream with usage on the chat route.
function nanoGptListAndChat(listBody: () => Response = () => Response.json(DETAILED_LIST)): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      return Promise.resolve(new URL(request.url).pathname.endsWith("/models") ? listBody() : Response.json({ object: "list", data: [] }));
    }
    const usage = {
      ["prompt_tokens"]: TOKENS_IN,
      ["prompt_tokens_details"]: { ["cached_tokens"]: TOKENS_CACHED },
      ["completion_tokens"]: TOKENS_OUT,
      ["total_tokens"]: TOKENS_IN + TOKENS_OUT,
    };
    const frames = [
      {
        id: "c",
        object: "chat.completion.chunk",
        created: 1,
        model: "m",
        choices: [{ index: 0, delta: { role: "assistant", content: "Hi" }, ["finish_reason"]: null }],
      },
      { id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: {}, ["finish_reason"]: "stop" }], usage },
    ];
    return Promise.resolve(
      new Response(`${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
  };
}

async function turnUsage(
  root: ServerTestHarness,
  model: string,
  declared?: DeclaredCapability,
): Promise<{ readonly costUsd: number | null; readonly costProvenance: string }> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: nanoGpt().id, key: RUNTIME_KEY });
  const row = await root.services.connection.create({ principal, providerId: nanoGpt().id, credentialId: credential.id, baseUrl: null, model, declared });
  const signal = new AbortController().signal;
  // The capability read warms the list the turn's resolve then reads.
  await root.services.connection.capabilities({ principal, connectionId: row.id, signal });
  const { resolved } = await root.app.runtime.resolve({ signal, principal, task: "chat", connectionId: row.id, cachedFacts: true });
  const turn = await root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection: { ...resolved, task: "chat" },
    signal,
    params: {},
    systemPrompt: { static: "You are a fixture.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Hello." }] }],
  });
  return { costUsd: turn.usage.costUsd, costProvenance: turn.usage.costProvenance };
}

// NanoGPT's Models page: `pricing.prompt` and `pricing.completion` are USD per million tokens. Its implicit caching
// (Prompt Caching page) reports `cached_tokens`, which an estimate prices at the list's cache-read price.
test("a turn on a model the list prices reports an estimated cost, and one whose price is null reports none", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptListAndChat() });
  const priced = await turnUsage(root, STATED_MODEL);
  expect(priced.costProvenance).toBe("estimated");
  const promptUsd = (TOKENS_IN - TOKENS_CACHED) * PROMPT_PER_MILLION + TOKENS_CACHED * CACHE_READ_PER_MILLION;
  expect(priced.costUsd).toBeCloseTo((promptUsd + TOKENS_OUT * COMPLETION_PER_MILLION) / TOKENS_PER_MILLION, 12);
  const unpriced = await turnUsage(root, UNSTATED_MODEL);
  expect(unpriced).toEqual({ costUsd: null, costProvenance: "unrecorded" });
});

const DECLARED_PRICING = { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 1 };

test("a price the user declares on the connection wins over the list's price", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptListAndChat() });
  const declared = await turnUsage(root, STATED_MODEL, declaredCapabilitySchema.parse({ features: { pricing: DECLARED_PRICING } }));
  expect(declared.costProvenance).toBe("estimated");
  const promptUsd = (TOKENS_IN - TOKENS_CACHED) * DECLARED_PRICING.inputPerMTok + TOKENS_CACHED * DECLARED_PRICING.cacheReadPerMTok;
  expect(declared.costUsd).toBeCloseTo((promptUsd + TOKENS_OUT * DECLARED_PRICING.outputPerMTok) / TOKENS_PER_MILLION, 12);
  // Positive control: the same model with nothing declared is priced from the list, so the figures differ.
  const listed = await turnUsage(root, STATED_MODEL);
  expect(listed.costUsd).not.toBeCloseTo(declared.costUsd ?? 0, 12);
});

// A listed price is the provider's data: one the reader cannot take as a plausible price states none, so the turn
// carries no estimate rather than a nonsense one. JSON's `1e400` parses to Infinity.
const UNRECORDED = { costUsd: null, costProvenance: "unrecorded" } as const;
// A free prompt is still priced: the cached tokens at the cache price and the reply at the completion price.
const FREE_PROMPT_USD = (TOKENS_CACHED * CACHE_READ_PER_MILLION + TOKENS_OUT * COMPLETION_PER_MILLION) / TOKENS_PER_MILLION;
const LISTED_PRICES = [
  { name: "zero", prompt: "0", usage: { costUsd: FREE_PROMPT_USD, costProvenance: "estimated" } },
  { name: "negative", prompt: "-1", usage: UNRECORDED },
  { name: "null", prompt: "null", usage: UNRECORDED },
  { name: "huge", prompt: "1e300", usage: UNRECORDED },
  { name: "non-finite", prompt: "1e400", usage: UNRECORDED },
] as const;

function pricedList(prompt: string): () => Response {
  return () =>
    new Response(
      `{"object":"list","data":[{"id":"${STATED_MODEL}","pricing":{"prompt":${prompt},"completion":${String(COMPLETION_PER_MILLION)},"cacheReadInputPer1kTokens":${String(CACHE_READ_PER_THOUSAND)}}}]}`,
      { headers: { "content-type": "application/json" } },
    );
}

test.for(LISTED_PRICES)("a $name listed prompt price gives an estimate only when it is a plausible price", async ({ prompt, usage }) => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptListAndChat(pricedList(prompt)) });
  const recorded = await turnUsage(root, STATED_MODEL);
  expect(recorded).toEqual({ costProvenance: usage.costProvenance, costUsd: usage.costUsd === null ? null : expect.closeTo(usage.costUsd, 12) });
});

test("a declared price whose arithmetic overflows records no cost rather than an infinite one", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptListAndChat() });
  const pricing = { inputPerMTok: Number.MAX_VALUE, outputPerMTok: Number.MAX_VALUE, cacheReadPerMTok: Number.MAX_VALUE };
  const usage = await turnUsage(root, STATED_MODEL, declaredCapabilitySchema.parse({ features: { pricing } }));
  expect(usage).toEqual({ costUsd: null, costProvenance: "unrecorded" });
});

const EMBED_MODEL = "vendor/stated-embedder";
const EMBED_DIMS = 8;
const EMBED_INPUT_TOKENS = 8191;
const BATCHED_MODEL = "vendor/batched-embedder";
const BATCHED_MAX_INPUTS = 2;
const RERANK_MODEL = "vendor/stated-reranker";
const RERANK_PAIR_TOKENS = 32_768;
const API_ROOT = "https://api.nano-gpt.com/api/v1";

// The Embedding Models and Rerank pages' row shapes, outside the models list.
const EMBEDDING_LIST = {
  object: "list",
  data: [
    {
      id: EMBED_MODEL,
      object: "model",
      ["owned_by"]: "nanogpt",
      name: "Stated Embedder",
      dimensions: EMBED_DIMS,
      ["max_dimensions"]: EMBED_DIMS,
      ["supports_dimensions"]: false,
      ["max_tokens"]: EMBED_INPUT_TOKENS,
      pricing: { ["per_million_tokens"]: 0.02, currency: "USD" },
    },
    // The live list's Cohere shape: a per-request input cap, and a width a request may shorten.
    {
      id: BATCHED_MODEL,
      object: "model",
      dimensions: EMBED_DIMS,
      ["supports_dimensions"]: true,
      ["max_tokens"]: EMBED_INPUT_TOKENS,
      ["max_inputs"]: BATCHED_MAX_INPUTS,
    },
  ],
};
const RERANK_LIST = {
  object: "list",
  data: [{ id: RERANK_MODEL, object: "model", name: "Stated Reranker", ["max_tokens"]: RERANK_PAIR_TOKENS, pricing: { ["per_million_tokens"]: 0.05 } }],
};

interface Posted {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

// Each list on its own path, and the embeddings and rerank routes as the docs answer them.
interface SideLists {
  readonly embedding?: () => Response;
  readonly rerank?: () => Response;
}

function nanoGptRoutes(seen: Seen[], posted: Posted[], side: SideLists = {}): typeof fetch {
  const embeddingList = side.embedding ?? ((): Response => Response.json(EMBEDDING_LIST));
  const rerankList = side.rerank ?? ((): Response => Response.json(RERANK_LIST));
  return async (input, init) => {
    const request = new Request(input, init);
    seen.push({ url: request.url, authorization: request.headers.get("authorization") });
    if (request.method === "GET") {
      const { pathname } = new URL(request.url);
      if (pathname.endsWith("/embedding-models")) {
        return embeddingList();
      }
      return pathname.endsWith("/rerank-models") ? rerankList() : Response.json(DETAILED_LIST);
    }
    const body = z.record(z.string(), z.unknown()).parse(await request.json());
    posted.push({ url: request.url, body });
    if (request.url.endsWith("/rerank")) {
      return Response.json({
        id: "rerank-1",
        model: RERANK_MODEL,
        results: [
          { index: 1, ["relevance_score"]: 2.5 },
          { index: 0, ["relevance_score"]: -1.8 },
        ],
      });
    }
    const vector = Array.from({ length: EMBED_DIMS }, (_value, i) => (i + 1) / EMBED_DIMS);
    const inputs = z.union([z.string(), z.array(z.string())]).parse(body["input"]);
    return Response.json({
      object: "list",
      data: (typeof inputs === "string" ? [inputs] : inputs).map((_text, index) => ({ object: "embedding", index, embedding: vector })),
      model: EMBED_MODEL,
      usage: { ["prompt_tokens"]: 2, ["total_tokens"]: 2 },
    });
  };
}

test("a NanoGPT key lists its embedding and rerank models as those kinds beside its chat models", async () => {
  const seen: Seen[] = [];
  await using root = await createRuntimeRoot({ providerFetch: nanoGptRoutes(seen, []) });
  const listing = await draftListing(root);
  const auth = `Bearer ${RUNTIME_KEY}`;
  expect(seen).toEqual([
    { url: `${API_ROOT}/models?detailed=true`, authorization: auth },
    { url: `${API_ROOT}/embedding-models`, authorization: auth },
    { url: `${API_ROOT}/rerank-models`, authorization: auth },
  ]);
  expect(listedEntry(listing, EMBED_MODEL)).toMatchObject({ kind: "embedding", name: "Stated Embedder" });
  expect(listedEntry(listing, RERANK_MODEL)).toMatchObject({ kind: "rerank", name: "Stated Reranker" });
  // Positive control: the chat row beside them still lists as a chat model.
  expect(listedEntry(listing, STATED_MODEL)?.kind).toBe("generation");
});

test("an embedding list the service fails to answer drops its embedders and leaves the chat list standing", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptRoutes([], [], { embedding: () => new Response("upstream down", { status: 503 }) }) });
  const listing = await draftListing(root);
  expect(listedEntry(listing, EMBED_MODEL)).toBeUndefined();
  expect(listedEntry(listing, RERANK_MODEL)?.kind).toBe("rerank");
  expect(listedEntry(listing, STATED_MODEL)).toMatchObject({ contextLength: STATED_WINDOW });
});

test("a rerank list the service fails to answer drops its rerankers and leaves the other lists standing", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptRoutes([], [], { rerank: () => new Response("upstream down", { status: 503 }) }) });
  const listing = await draftListing(root);
  expect(listedEntry(listing, RERANK_MODEL)).toBeUndefined();
  expect(listedEntry(listing, EMBED_MODEL)?.kind).toBe("embedding");
  expect(listedEntry(listing, STATED_MODEL)).toMatchObject({ contextLength: STATED_WINDOW });
});

async function resolvedOn(root: ServerTestHarness, model: string, task: "embed" | "rerank"): Promise<Resolved> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: nanoGpt().id, key: RUNTIME_KEY });
  const row = await root.services.connection.create({
    principal,
    providerId: nanoGpt().id,
    credentialId: credential.id,
    baseUrl: null,
    model,
    allowBackground: true,
  });
  const signal = new AbortController().signal;
  await root.services.connection.capabilities({ principal, connectionId: row.id, signal });
  return (await root.app.runtime.resolve({ signal, principal, task, connectionId: row.id, cachedFacts: true })).resolved;
}

test("an embed connection on a listed embedder embeds through the row's embeddings route at the stated width", async () => {
  const posted: Posted[] = [];
  await using root = await createRuntimeRoot({ providerFetch: nanoGptRoutes([], posted) });
  const resolved = await resolvedOn(root, EMBED_MODEL, "embed");
  expect(resolved.capability).toMatchObject({ kind: "embedding", embedding: { dims: EMBED_DIMS, maxInputTokens: EMBED_INPUT_TOKENS } });
  const capability = resolved.capability.kind === "embedding" ? resolved.capability.embedding : undefined;
  expect({ windowEstimated: capability?.windowEstimated, dimsEstimated: capability?.dimsEstimated }).toEqual({
    windowEstimated: undefined,
    dimsEstimated: undefined,
  });
  const result = await root.app.runtime.executor.embed({ signal: new AbortController().signal, connection: { ...resolved, task: "embed" }, input: "a memory" });
  expect(result.vectors[0]?.length).toBe(EMBED_DIMS);
  expect(posted).toMatchObject([{ url: `${API_ROOT}/embeddings`, body: { model: EMBED_MODEL } }]);
});

const MEMORIES = ["one", "two", "three", "four", "five"];

function postedCounts(posted: readonly Posted[]): number[] {
  return posted.map(({ body }) => (Array.isArray(body["input"]) ? body["input"].length : 1));
}

test("an embedder whose list caps the inputs per request is sent batches no larger than the cap", async () => {
  const posted: Posted[] = [];
  await using root = await createRuntimeRoot({ providerFetch: nanoGptRoutes([], posted) });
  const resolved = await resolvedOn(root, BATCHED_MODEL, "embed");
  expect(resolved.capability).toMatchObject({ kind: "embedding", embedding: { maxBatchInputs: BATCHED_MAX_INPUTS, mrl: true } });
  const result = await root.app.runtime.executor.embed({ signal: new AbortController().signal, connection: { ...resolved, task: "embed" }, input: MEMORIES });
  expect(result.vectors.map((vector) => vector?.length)).toEqual(MEMORIES.map(() => EMBED_DIMS));
  expect(postedCounts(posted)).toEqual([2, 2, 1]);
  // Positive control: an embedder the list states no cap for takes the same inputs in one request.
  posted.length = 0;
  const uncapped = await resolvedOn(root, EMBED_MODEL, "embed");
  expect(uncapped.capability).toMatchObject({ kind: "embedding", embedding: { mrl: false } });
  await root.app.runtime.executor.embed({ signal: new AbortController().signal, connection: { ...uncapped, task: "embed" }, input: MEMORIES });
  expect(postedCounts(posted)).toEqual([MEMORIES.length]);
});

test("a rerank connection on a listed reranker posts only the fields the rerank route takes, at the stated pair window", async () => {
  const posted: Posted[] = [];
  await using root = await createRuntimeRoot({ providerFetch: nanoGptRoutes([], posted) });
  const resolved = await resolvedOn(root, RERANK_MODEL, "rerank");
  expect(resolved.capability).toMatchObject({ kind: "rerank", rerank: { maxInputTokens: RERANK_PAIR_TOKENS } });
  // The list stated the bound, so it reads as stated, not as a floor the user must correct.
  expect(resolved.capability.kind === "rerank" ? resolved.capability.rerank.windowEstimated : "not a reranker").toBeUndefined();
  const result = await root.app.runtime.executor.rerank({
    signal: new AbortController().signal,
    connection: { ...resolved, task: "rerank" },
    query: "reset password",
    documents: [
      { id: "office", text: "Our office is closed on Sundays." },
      { id: "settings", text: "Open Settings and choose Reset password." },
    ],
  });
  expect(result.hits.map((hit) => hit.id)).toEqual(["settings", "office"]);
  // The Rerank page: other fields are rejected.
  expect(posted.map(({ url, body }) => ({ url, keys: Object.keys(body).sort() }))).toEqual([
    { url: `${API_ROOT}/rerank`, keys: ["documents", "model", "query"] },
  ]);
});

test("an output cap above its window leaves the cap assumed while the window is reported", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptHost([], HOSTILE_LIST) });
  const { context, output } = generationOf(await connectionCapability(root, "hostile/cap-above-window"));
  expect({ window: context.window, windowEstimated: context.windowEstimated, maxTokensEstimated: output.maxTokensEstimated }).toEqual({
    window: 8192,
    windowEstimated: undefined,
    maxTokensEstimated: true,
  });
});

// A stated output kind that is not a list says nothing a reader can trust, so the row leaves the chat list; a row that
// states no output kind at all stays, as the list's text models do.
const KIND_LIST = {
  object: "list",
  data: [
    { id: "kind/text", architecture: { ["output_modalities"]: ["text"] } },
    { id: "kind/unstated" },
    { id: "kind/string", architecture: { ["output_modalities"]: "image" } },
    { id: "kind/object", architecture: { ["output_modalities"]: { image: true } } },
  ],
};

test("a row whose stated output kind is not a list lists as no chat model", async () => {
  await using root = await createRuntimeRoot({ providerFetch: nanoGptHost([], KIND_LIST) });
  const listing = await draftListing(root);
  expect(listing.listed ? listing.models.map((model) => model.id) : []).toEqual(["kind/text", "kind/unstated"]);
});
