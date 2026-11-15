// @subject packages/inference/src/catalog/endpoint.ts
// NanoGPT states each model's limits only in its detailed list. A stated window and output cap are reported on the
// connection; a model the list leaves null runs on the floor, marked assumed.
import type { Capability, ModelListing } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createRuntimeRoot, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const NANOGPT = BUILTIN_PROVIDERS.find((provider) => provider.id === "nanogpt");
const STATED_MODEL = "vendor/stated-limits";
const STATED_NAME = "Stated Limits";
const UNSTATED_MODEL = "vendor/unlisted-limits";
const STATED_WINDOW = 262_144;
const STATED_OUTPUT = 32_768;
const PROMPT_PER_MILLION = 2;
const COMPLETION_PER_MILLION = 10;

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
      pricing: { prompt: PROMPT_PER_MILLION, completion: COMPLETION_PER_MILLION, currency: "USD", unit: "per_million_tokens" },
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

function nanoGptHost(seen: Seen[]): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    seen.push({ url: request.url, authorization: request.headers.get("authorization") });
    return Promise.resolve(Response.json(DETAILED_LIST));
  };
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
  const listing = await root.services.connection.draftCatalogModels({
    principal: await root.principalFor(root.ownerId),
    providerId: nanoGpt().id,
    key: RUNTIME_KEY,
    signal: new AbortController().signal,
  });
  expect(seen).toEqual([{ url: "https://api.nano-gpt.com/api/v1/models?detailed=true", authorization: `Bearer ${RUNTIME_KEY}` }]);
  expect(listedEntry(listing, STATED_MODEL)).toMatchObject({
    name: STATED_NAME,
    contextLength: STATED_WINDOW,
    maxCompletionTokens: STATED_OUTPUT,
    promptPrice: 0.000_002,
    completionPrice: 0.000_01,
    inputModalities: ["text", "image"],
  });
  const unstated = listedEntry(listing, UNSTATED_MODEL);
  expect(unstated).toMatchObject({ id: UNSTATED_MODEL, contextLength: null, promptPrice: null, completionPrice: 0.000_001 });
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
