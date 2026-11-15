// @subject packages/inference/src/catalog/endpoint.ts
// LiteRouter's list states each model's native window, but the window a request runs is the variant's (Model naming
// page) or, on the plain and metered variants, the account's chat-memory setting, which nothing states. So a variant
// with a documented window reports it, the rest stay assumed, and the native window bounds every one of them.
import type { Capability, ModelListing } from "@orb/contracts/inference";
import { GENERATION_FLOOR, TOOLS_PARAMETER } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createRuntimeRoot, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const PROVIDER = "literouter";
const NATIVE = 131_072;
const SMALL_NATIVE = 4096;
const OUTPUT = 32_768;
const FREE_WINDOW = 5000;

// The live list's row shape (trimmed), under ids no curated row names.
function row(id: string, variant: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    ["display_name"]: `Model ${id}`,
    object: "model",
    type: "chat",
    variant,
    ["context_window"]: NATIVE,
    ["max_output_tokens"]: OUTPUT,
    ["input_modalities"]: ["text", "image"],
    capabilities: { tools: true, reasoning: false, vision: true, ["structured_output"]: true },
    ["price_usd_per_1m"]: { input: 3, output: 6 },
    ...extra,
  };
}

const EFFORTS = {
  default: { status: "on" },
  none: { status: "turns_off" },
  minimal: { status: "ignored" },
  low: { status: "supported" },
  medium: { status: "supported" },
  high: { status: "supported" },
  xhigh: { status: "ignored" },
  max: { status: "supported" },
};
const ALWAYS_THINKS = { ...EFFORTS, none: { status: "ignored" } };

const LIST = {
  object: "list",
  data: [
    row("lr/base", "base"),
    row("lr/metered", "metered"),
    row("lr/full", "full-context"),
    row("lr/metered-full", "metered:full-context"),
    row("lr/payg", "payg"),
    row("lr/32k", "32k-context"),
    row("lr/256k", "256k-context"),
    row("lr/free", "free"),
    row("lr/unknown", "some-new-variant"),
    row("lr/small-base", "base", { ["context_window"]: SMALL_NATIVE, ["max_output_tokens"]: 1024 }),
    row("lr/thinker", "full-context", { capabilities: { reasoning: true }, ["reasoning_hint"]: { mode: "default", efforts: EFFORTS } }),
    row("lr/always-thinks", "full-context", { capabilities: { reasoning: true }, ["reasoning_hint"]: { mode: "default", efforts: ALWAYS_THINKS } }),
    row("lr/painter", "base", { type: "image", ["input_modalities"]: ["text"] }),
    row("lr/plain-samplers", "full-context", { ["supported_parameters"]: ["max_tokens", "tools", "temperature", "top_p"] }),
    row("lr/min-p", "full-context", { ["supported_parameters"]: ["max_tokens", "tools", "temperature", "top_p", "min_p"] }),
    row("lr/hostile", "full-context", {
      ["context_window"]: "big",
      capabilities: { tools: "yes", vision: true },
      ["price_usd_per_1m"]: { input: -1, output: 6 },
    }),
  ],
};

function host(): typeof fetch {
  return () => Promise.resolve(Response.json(LIST));
}

async function draftListing(root: ServerTestHarness): Promise<ModelListing> {
  return await root.services.connection.draftCatalogModels({
    principal: await root.principalFor(root.ownerId),
    providerId: PROVIDER,
    key: RUNTIME_KEY,
    signal: new AbortController().signal,
  });
}

function entry(listing: ModelListing, id: string): Extract<ModelListing, { listed: true }>["models"][number] | undefined {
  return listing.listed ? listing.models.find((model) => model.id === id) : undefined;
}

async function capabilityOf(root: ServerTestHarness, model: string): Promise<Extract<Capability, { kind: "generation" }>["generation"]> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: PROVIDER, key: RUNTIME_KEY });
  const created = await root.services.connection.create({ principal, providerId: PROVIDER, credentialId: credential.id, baseUrl: null, model });
  const { capability } = await root.services.connection.capabilities({ principal, connectionId: created.id, signal: new AbortController().signal });
  if (capability.kind !== "generation") {
    throw new Error(`${model} resolved as ${capability.kind}`);
  }
  return capability.generation;
}

const WINDOWS: readonly { readonly model: string; readonly window: number | null }[] = [
  { model: "lr/base", window: null },
  { model: "lr/metered", window: null },
  { model: "lr/full", window: NATIVE },
  { model: "lr/metered-full", window: NATIVE },
  { model: "lr/payg", window: NATIVE },
  { model: "lr/32k", window: 32_000 },
  // A named budget above the native window runs the native one.
  { model: "lr/256k", window: NATIVE },
  { model: "lr/free", window: FREE_WINDOW },
  { model: "lr/unknown", window: null },
];

test.for(WINDOWS)("$model reports window $window, or stays assumed when null", async ({ model, window }) => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const { context } = await capabilityOf(root, model);
  // An unreported window is the generic floor, marked assumed.
  const expected = window === null ? { window: GENERATION_FLOOR.context.window, windowEstimated: true } : { window, windowEstimated: undefined };
  expect({ window: context.window, windowEstimated: context.windowEstimated }).toEqual(expected);
});

test("an assumed window never runs past a small native window", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const { context, output } = await capabilityOf(root, "lr/small-base");
  expect({ window: context.window, windowEstimated: context.windowEstimated, outputMax: output.maxTokens.max }).toEqual({
    window: SMALL_NATIVE,
    windowEstimated: true,
    outputMax: 1024,
  });
});

test("the list keeps chat models only, with each one's stated input, tools and price", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const listing = await draftListing(root);
  expect(entry(listing, "lr/painter")).toBeUndefined();
  expect(entry(listing, "lr/base")).toMatchObject({
    name: "Model lr/base",
    inputModalities: ["text", "image"],
    supportedParameters: [TOOLS_PARAMETER],
    maxCompletionTokens: OUTPUT,
    promptPrice: 0.000_003,
    completionPrice: 0.000_006,
  });
  // One wrong field states nothing; the row and its other fields stay.
  expect(entry(listing, "lr/hostile")).toMatchObject({ contextLength: null, supportedParameters: [], inputModalities: ["text", "image"], promptPrice: null });
});

test("a thinker offers only the efforts the service measured as working, and one that cannot stop thinking is mandatory", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  expect((await capabilityOf(root, "lr/thinker")).reasoning).toMatchObject({
    mode: "effort",
    enabled: true,
    effortLevels: ["low", "medium", "high", "max"],
    defaultEnabled: true,
  });
  expect((await capabilityOf(root, "lr/thinker")).reasoning.mandatory).toBeUndefined();
  expect((await capabilityOf(root, "lr/always-thinks")).reasoning).toMatchObject({ effortLevels: ["low", "medium", "high", "max"], mandatory: true });
});

// The list's `supported_parameters` names the request fields a model takes; the chat route accepts any field silently,
// so the list is the only word on which samplers a model honours.
test("a model whose list row omits a sampler has that knob not honoured, and one that lists it has it", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const plain = (await capabilityOf(root, "lr/plain-samplers")).sampling;
  expect({ temperature: plain.temperature !== undefined, topP: plain.topP !== undefined, minP: plain.minP }).toEqual({
    temperature: true,
    topP: true,
    minP: undefined,
  });
  expect((await capabilityOf(root, "lr/min-p")).sampling.minP).toBeDefined();
});

// A row whose kind is missing or malformed states no chat model, so the list leaves it out rather than guess chat.
const KIND_LIST = {
  object: "list",
  data: [
    row("lr/chat", "base"),
    row("lr/untyped", "base", { type: undefined }),
    row("lr/numbered", "base", { type: 5 }),
    row("lr/blank", "base", { type: "" }),
    row("lr/painter-too", "base", { type: "image" }),
  ],
};

test("a row with no type, or a type that is not a string, lists as no chat model", async () => {
  await using root = await createRuntimeRoot({ providerFetch: () => Promise.resolve(Response.json(KIND_LIST)) });
  const listing = await draftListing(root);
  expect(listing.listed ? listing.models.map((model) => model.id) : []).toEqual(["lr/chat"]);
});
