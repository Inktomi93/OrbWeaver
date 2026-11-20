// @subject packages/inference/src/catalog/endpoint.ts
// The live DeepSeek list states each model's window, output cap, input modalities and effort levels as fields
// beside the id (live GET /v1/models, 2026-11-16). The reader keeps exactly those facts, each field parses
// alone, and where the list says nothing the reader states nothing — the curated rows and the floor fill.
import type { Capability, ModelListing } from "@orb/contracts/inference";
import { declaredCapabilitySchema, GENERATION_FLOOR } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createRuntimeRoot, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const PROVIDER = "deepseek";
const WINDOW = 1_048_576;
const OUTPUT = 393_216;

// The live row shape (trimmed), under ids no curated row names, so every asserted figure comes from the list.
function row(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    object: "model",
    ["owned_by"]: "deepseek",
    name: `Model ${id}`,
    ["context_window"]: WINDOW,
    ["max_output_tokens"]: OUTPUT,
    ["input_modalities"]: ["text"],
    ["output_modalities"]: ["text"],
    effort: { ["supported_levels"]: ["low", "high", "max"], ["default_level"]: "high" },
    ["api_capabilities"]: { ["anthropic_messages"]: { ["system_prompt_update"]: "leading-only" } },
    ...extra,
  };
}

const LIST = {
  object: "list",
  data: [
    row("ds/flash-like", { ["input_modalities"]: ["text", "image"] }),
    row("ds/pro-like"),
    // A level outside our vocabulary states nothing for that level; the rest of the row stays.
    row("ds/odd-efforts", { effort: { ["supported_levels"]: ["low", "ultra"], ["default_level"]: "ultra" } }),
    // No effort block: thinking is not stated at all, so no effort claim rides.
    row("ds/silent", { effort: undefined }),
    // Malformed fields state nothing and never take their neighbours: a string window, a non-array modality
    // list, an effort default of the wrong type.
    row("ds/hostile", { ["context_window"]: "big", ["input_modalities"]: "text", effort: { ["supported_levels"]: ["low", 7], ["default_level"]: 5 } }),
  ],
};

function host(): typeof fetch {
  return () => Promise.resolve(Response.json(LIST));
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

test("a listed row's stated window, output cap and modalities ride the listing, not an estimate", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const listing = await root.services.connection.draftCatalogModels({
    principal: await root.principalFor(root.ownerId),
    providerId: PROVIDER,
    key: RUNTIME_KEY,
    signal: new AbortController().signal,
  });
  expect(entry(listing, "ds/flash-like")).toMatchObject({
    name: "Model ds/flash-like",
    contextLength: WINDOW,
    maxCompletionTokens: OUTPUT,
    inputModalities: ["text", "image"],
  });
  expect(entry(listing, "ds/pro-like")).toMatchObject({ contextLength: WINDOW, maxCompletionTokens: OUTPUT, inputModalities: ["text"] });

  const flash = await capabilityOf(root, "ds/flash-like");
  expect({ window: flash.context.window, windowEstimated: flash.context.windowEstimated, outputMax: flash.output.maxTokens.max, input: flash.input }).toEqual({
    window: WINDOW,
    windowEstimated: undefined,
    outputMax: OUTPUT,
    input: ["text", "image"],
  });
  // The hosted service runs every model at its stated window: the preset can lower the fit, never raise it.
  expect(flash.context.settable).toBeUndefined();
});

test("the stated effort block becomes switchable effort levels with the service's default; a level outside the vocabulary states nothing", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const pro = await capabilityOf(root, "ds/pro-like");
  expect(pro.reasoning).toMatchObject({ mode: "effort", enabled: true, effortLevels: ["low", "high", "max"], defaultEnabled: true, defaultEffort: "high" });
  // `reasoning_effort: "none"` is the off (measured), so no thinker on this service is mandatory.
  expect(pro.reasoning.mandatory).toBeUndefined();

  const odd = await capabilityOf(root, "ds/odd-efforts");
  expect({ levels: odd.reasoning.effortLevels, defaultEffort: odd.reasoning.defaultEffort }).toEqual({ levels: ["low"], defaultEffort: undefined });
});

test("a row with no effort block and a row with malformed fields state no thinking and no limits, and still list", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const silent = await capabilityOf(root, "ds/silent");
  expect({ mode: silent.reasoning.mode, enabled: silent.reasoning.enabled }).toEqual({ mode: "none", enabled: false });

  const hostile = await capabilityOf(root, "ds/hostile");
  // The string window and the non-array modality list state nothing; the floor fills, marked assumed. The
  // output cap is stated beside a broken window and survives on its own — no malformed field takes its
  // neighbour down with it.
  expect({
    window: hostile.context.window,
    windowEstimated: hostile.context.windowEstimated,
    input: hostile.input,
    outputMax: hostile.output.maxTokens.max,
  }).toEqual({
    window: GENERATION_FLOOR.context.window,
    windowEstimated: true,
    input: ["text"],
    outputMax: OUTPUT,
  });
  // The `["low", 7]` list keeps the string; the numeric effort default states nothing.
  expect(hostile.reasoning.effortLevels).toEqual(["low"]);
});

test("the trained window the list states clamps a declared window above it, and one at or below stands", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host() });
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: PROVIDER, key: RUNTIME_KEY });
  const over = await root.services.connection.create({
    principal,
    providerId: PROVIDER,
    credentialId: credential.id,
    baseUrl: null,
    model: "ds/pro-like",
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { context: { window: 2_000_000 } } }),
  });
  const { capability: overCap } = await root.services.connection.capabilities({ principal, connectionId: over.id, signal: new AbortController().signal });
  if (overCap.kind !== "generation") {
    throw new Error(`the over-declared connection resolved as ${overCap.kind}`);
  }
  expect(overCap.generation.context.window).toBe(WINDOW);

  // Positive control: the clamp bites at the trained window, not below it.
  const under = await root.services.connection.create({
    principal,
    providerId: PROVIDER,
    credentialId: credential.id,
    baseUrl: null,
    model: "ds/pro-like",
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { context: { window: WINDOW - 1000 } } }),
  });
  const { capability: underCap } = await root.services.connection.capabilities({ principal, connectionId: under.id, signal: new AbortController().signal });
  if (underCap.kind !== "generation") {
    throw new Error("the under-declared connection resolved as a non-generation model");
  }
  expect(underCap.generation.context.window).toBe(WINDOW - 1000);
});

test("the reader's facts and the curated rows compose on a real id: stated limits and measured turn cells together", async () => {
  await using root = await createRuntimeRoot({
    providerFetch: () => Promise.resolve(Response.json({ object: "list", data: [row("deepseek-flash", { ["input_modalities"]: ["text", "image"] })] })),
  });
  const flash = await capabilityOf(root, "deepseek-flash");
  expect({ window: flash.context.window, windowEstimated: flash.context.windowEstimated, outputMax: flash.output.maxTokens.max }).toEqual({
    window: WINDOW,
    windowEstimated: undefined,
    outputMax: OUTPUT,
  });
  // These cells ride ONLY the curated provider rows — the list states no turn or tool facts.
  expect(flash.turns).toMatchObject({
    assistantPrefill: true,
    midConversationSystem: true,
    historySystemRows: true,
    roleHandlingFloor: "merge",
    providerImplicitPromptCache: true,
  });
  expect(flash.tools).toMatchObject({ requiredChoice: false, namedChoice: false, noneChoice: true, parallel: true, parallelControl: false });
  expect(flash.output.structured).toBe(false);
  expect(flash.sampling.temperature).toEqual({ min: 0, max: 2 });
});
