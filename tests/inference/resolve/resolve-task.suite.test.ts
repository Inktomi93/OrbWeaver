// Resolver behavior not owned by the broad runtime smoke: actor ridesOn precedence, explicit-row selection,
// missing-provider refusal, the prompt-cache settings fold, and which id the capability rows read on the
// OpenRouter route — all through the real runtime fold.

import type { Capability, GenerationCapability } from "@orb/contracts/inference";
import { GENERATION_FLOOR, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { createInferenceRuntime, DEFAULT_EMBED_MODEL, NoConnectionError } from "@orb/inference";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { openRouterCatalogFetch } from "../_openrouter-catalog.ts";
import { FROZEN_NOW, fakeApiKeySecret, fakeConnection, fakeDeps, memoryStores, newRuleId, newUserId } from "../_support.ts";
import { localServerFetch } from "../catalog/_local-servers-fetch.ts";

test("structured resolves through the actor's summarize binding before the funder's summarize binding", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const actorRow = fakeConnection({ ownerId, providerId: "custom-openai", model: "actor-model", baseUrl: "http://actor.test/v1", allowBackground: true });
  const ownerRow = fakeConnection({ ownerId, providerId: "custom-openai", model: "owner-model", baseUrl: "http://owner.test/v1", allowBackground: true });
  stores.connections.rows.set(actorRow.id, actorRow);
  stores.connections.rows.set(ownerRow.id, ownerRow);
  const ruleId = newRuleId();
  stores.bindings.bind({ actorKind: "automation-rule", actorId: ruleId, task: "summarize", connectionId: actorRow.id });
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "summarize", connectionId: ownerRow.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores }));

  const resolved = await runtime.resolve({ task: "structured", principal: principal(ownerId), actor: { kind: "automation-rule", ruleId } });
  expect(resolved.resolved.connectionId).toBe(actorRow.id);
  expect(resolved.resolved.model).toBe("actor-model");
  expect(resolved.resolved.task).toBe("structured");
});

test("an explicit owned connection bypasses the binding and carries its declared embedding capability", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const bound = fakeConnection({ ownerId, providerId: "local-light", model: DEFAULT_EMBED_MODEL, allowBackground: true });
  const explicit = fakeConnection({
    ownerId,
    providerId: "local-light",
    model: "acme/other-encoder",
    declared: { kind: "embedding", embedding: { dims: 1024, dtype: "q8", input: ["text"] } },
    allowBackground: true,
  });
  stores.connections.rows.set(bound.id, bound);
  stores.connections.rows.set(explicit.id, explicit);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "embed", connectionId: bound.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores }));

  const outcome = await runtime.resolve({ task: "embed", principal: principal(ownerId), connectionId: explicit.id });
  expect(outcome.resolved.connectionId).toBe(explicit.id);
  expect(outcome.resolved.model).toBe("acme/other-encoder");
  expect(outcome.resolved.capability).toMatchObject({ kind: "embedding", embedding: { dims: 1024, dtype: "q8", input: ["text"] } });
});

test("a connection whose provider is absent refuses as no-connection", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "plugin:gone/relay", model: "model", allowBackground: true });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores }));
  await expect(runtime.resolve({ task: "chat", principal: principal(ownerId) })).rejects.toBeInstanceOf(NoConnectionError);
});

test("the row's prompt-cache settings ride the resolve, and a row that stored none resolves to the shipped behavior", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const settings = { enabled: true, cacheSystem: false, historyDepth: 4, ttl: "5m" } as const;
  const set = fakeConnection({ ownerId, providerId: "custom-openai", model: "set-model", baseUrl: "http://set.test/v1", promptCache: settings });
  const unset = fakeConnection({ ownerId, providerId: "custom-openai", model: "unset-model", baseUrl: "http://unset.test/v1" });
  stores.connections.rows.set(set.id, set);
  stores.connections.rows.set(unset.id, unset);
  const runtime = await createInferenceRuntime(fakeDeps({ stores }));

  expect((await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: set.id })).resolved.promptCache).toEqual(settings);
  expect((await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: unset.id })).resolved.promptCache).toEqual(SHIPPED_PROMPT_CACHE);
});

// ── #2575: capability facts must survive the OpenRouter route ────────────────────────────────────────────
// The resolve runs the REAL catalog parser over a raw OpenRouter fixture (the live catalog's own field names),
// so the advertised tier, the curated rows and the family floor fold exactly as they do in production.

async function openRouterCapability(model: string): Promise<unknown> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "openrouter", model, allowBackground: true });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "chat", connectionId: row.id });
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: openRouterCatalogFetch() }));
  const outcome = await runtime.resolve({ task: "chat", principal: principal(ownerId) });
  return outcome.resolved.capability;
}

test("#2575: OpenRouter's advertised `tools` cell no longer erases the curated forced-choice refusal", async () => {
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-opus-5.5"]) {
    await expect(openRouterCapability(model), model).resolves.toMatchObject({ generation: { tools: { parallel: true, forcedChoice: false } } });
  }
  // PLANTED CONTROL: a Claude that accepts forced tool use states no refusal on the same route.
  const opus5 = await openRouterCapability("anthropic/claude-opus-5");
  expect(opus5).toMatchObject({ generation: { tools: { parallel: true } } });
  expect(opus5).not.toMatchObject({ generation: { tools: { forcedChoice: false } } });
});

test("#2575: a `:batch` variant takes its base model's curated facts (the catalog pairs them by canonical slug)", async () => {
  // The end-anchored o4-mini row states mandatory reasoning; its `:batch` sibling missed it by spelling alone.
  await expect(openRouterCapability("openai/o4-mini:batch")).resolves.toMatchObject({ generation: { reasoning: { mandatory: true } } });
  await expect(openRouterCapability("openai/o4-mini")).resolves.toMatchObject({ generation: { reasoning: { mandatory: true } } });
  await expect(openRouterCapability("anthropic/claude-fable-5.1:batch")).resolves.toMatchObject({
    generation: { tools: { forcedChoice: false }, reasoning: { mandatory: true } },
  });
});

test("#2575: a floating `~…-latest` alias folds as the target its catalog row names, and only then", async () => {
  await expect(openRouterCapability("~anthropic/claude-fable-latest")).resolves.toMatchObject({
    generation: { tools: { forcedChoice: false }, reasoning: { mandatory: true } },
  });
  // PLANTED CONTROL: an alias whose row names no target is left unmatched — no Claude row, no guessed facts.
  const mystery = await openRouterCapability("~anthropic/claude-mystery-latest");
  expect(mystery).not.toMatchObject({ generation: { tools: { forcedChoice: false } } });
  expect(mystery).not.toMatchObject({ generation: { reasoning: { mode: "adaptive" } } });
});

// ── A direct hosted model resolves to its provider-documented window ─────────────────────────────────────────
// A hosted OpenAI-compatible `GET /models` names ids only (`{id, object, owned_by}`; Gemini's compatibility layer
// answers the same shape with a `models/` id), so the advertised tier states no window and the curated row is the
// one tier that can. Without it the fit runs against the estimated floor and drops most of the chat.

function idOnlyModelList(): typeof fetch {
  return (input) => {
    const url = input instanceof Request ? input.url : String(input);
    const id = url.includes("generativelanguage") ? "models/gemini-2.5-flash" : "listed-model";
    return Promise.resolve(Response.json({ object: "list", data: [{ id, object: "model", owned_by: "provider" }] }));
  };
}

async function directGeneration(route: { readonly providerId: string; readonly baseUrl: string | null }, model: string): Promise<GenerationCapability> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: route.providerId, model, baseUrl: route.baseUrl });
  stores.connections.rows.set(row.id, row);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: idOnlyModelList() }));
  const { capability } = (await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id })).resolved;
  if (capability.kind !== "generation") {
    throw new Error(`${model} resolved a ${capability.kind} capability`);
  }
  return capability.generation;
}

const OPENAI = { providerId: "openai", baseUrl: null } as const;
const GEMINI = { providerId: "custom-openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" } as const;
const XAI = { providerId: "custom-openai", baseUrl: "https://api.x.ai/v1" } as const;
const DEEPSEEK = { providerId: "custom-openai", baseUrl: "https://api.deepseek.com" } as const;

const DIRECT_WINDOWS: readonly (readonly [typeof OPENAI | typeof GEMINI | typeof XAI | typeof DEEPSEEK, string, number])[] = [
  [OPENAI, "gpt-6-astra", 922_000],
  [OPENAI, "gpt-6-sol", 922_000],
  [OPENAI, "gpt-6-luna", 922_000],
  [OPENAI, "gpt-5.6-sol", 922_000],
  [OPENAI, "gpt-5.6-terra", 922_000],
  [OPENAI, "gpt-5.6-luna", 922_000],
  [OPENAI, "gpt-5.5-2026-04-23", 922_000],
  [OPENAI, "gpt-5.4", 922_000],
  [OPENAI, "gpt-5.4-mini", 272_000],
  [OPENAI, "gpt-5.4-nano", 272_000],
  [OPENAI, "gpt-5.3-codex", 272_000],
  [OPENAI, "gpt-5.2", 272_000],
  [OPENAI, "gpt-5.1", 272_000],
  [OPENAI, "gpt-5", 272_000],
  [OPENAI, "gpt-5-mini-2025-08-07", 272_000],
  [OPENAI, "gpt-5-nano", 272_000],
  [OPENAI, "o3", 200_000],
  [OPENAI, "o1", 200_000],
  [OPENAI, "o3-mini", 200_000],
  [OPENAI, "o4-mini-2025-04-16", 200_000],
  [OPENAI, "gpt-4.1", 1_047_576],
  [OPENAI, "gpt-4.1-mini", 1_047_576],
  [OPENAI, "gpt-4.1-nano", 1_047_576],
  [OPENAI, "gpt-4o", 128_000],
  [OPENAI, "gpt-4o-mini-2024-07-18", 128_000],
  [GEMINI, "gemini-3.8-flash", 1_048_576],
  [GEMINI, "gemini-3.7-flash", 1_048_576],
  [GEMINI, "gemini-3.6-flash", 1_048_576],
  [GEMINI, "gemini-3.5-flash", 1_048_576],
  [GEMINI, "gemini-3.5-flash-lite", 1_048_576],
  [GEMINI, "gemini-3.1-flash-lite", 1_048_576],
  [GEMINI, "gemini-3.1-pro-preview", 1_048_576],
  [GEMINI, "gemini-3-flash-preview", 1_048_576],
  [GEMINI, "gemini-2.5-pro", 1_048_576],
  [GEMINI, "gemini-2.5-flash-lite", 1_048_576],
  [GEMINI, "models/gemini-2.5-flash", 1_048_576],
  [GEMINI, "gemini-3.1-flash-image", 131_072],
  [GEMINI, "gemini-3.1-flash-lite-image", 65_536],
  [GEMINI, "gemini-3-pro-image", 65_536],
  [GEMINI, "gemini-2.5-flash-image", 65_536],
  [XAI, "grok-4.7", 500_000],
  [XAI, "grok-4.6", 500_000],
  [XAI, "grok-4.5-latest", 500_000],
  [XAI, "grok-build-latest", 500_000],
  [XAI, "grok-4.3", 1_000_000],
  [XAI, "grok-4.20-reasoning", 1_000_000],
  [XAI, "grok-4.20-0309-non-reasoning", 1_000_000],
  [XAI, "grok-4.20-multi-agent", 1_000_000],
  [XAI, "grok-code-fast-1", 256_000],
  [XAI, "grok-build-0.1", 256_000],
  [DEEPSEEK, "deepseek-flash", 1_000_000],
  [DEEPSEEK, "deepseek-v4-pro", 1_000_000],
  [DEEPSEEK, "deepseek-v4-flash", 1_000_000],
];

test("every sourced direct hosted model resolves to its documented window, not the estimated floor", async () => {
  for (const [route, model, window] of DIRECT_WINDOWS) {
    expect((await directGeneration(route, model)).context, model).toEqual({ window });
  }
});

test("an id no provider page sources keeps the estimated floor", async () => {
  // PLANTED CONTROL: the rows are anchored per documented id, so a retired alias and an open-weight checkpoint whose
  // window its deployment sets stay estimated instead of inheriting a neighbour's window.
  for (const [route, model] of [
    [DEEPSEEK, "deepseek-chat"],
    [OPENAI, "gpt-4.1-mini-preview"],
    [OPENAI, "gpt-oss-120b"],
  ] as const) {
    const generation = await directGeneration(route, model);
    expect(generation.context, model).toEqual({ window: 8192, windowEstimated: true });
    expect(generation.output.maxTokens, model).toEqual(GENERATION_FLOOR.output.maxTokens);
  }
});

// ── A direct hosted model resolves to its provider-documented output cap ─────────────────────────────────────
// The wire clamps `max_tokens` to this cap and the history fit reserves the same clamped value, so a missing cap
// clamps every reply to the floor's 4,096 and a wrong one mis-sizes the history.

const DIRECT_OUTPUT_CAPS: readonly (readonly [typeof OPENAI | typeof GEMINI | typeof DEEPSEEK, string, number])[] = [
  [OPENAI, "gpt-6-astra", 128_000],
  [OPENAI, "gpt-6-sol", 128_000],
  [OPENAI, "gpt-6-luna", 128_000],
  [OPENAI, "gpt-5.6-terra", 128_000],
  [OPENAI, "gpt-5.5-2026-04-23", 128_000],
  [OPENAI, "gpt-5.4", 128_000],
  [OPENAI, "gpt-5.4-mini", 128_000],
  [OPENAI, "gpt-5.3-codex", 128_000],
  [OPENAI, "gpt-5.1", 128_000],
  [OPENAI, "gpt-5", 128_000],
  [OPENAI, "gpt-5-nano", 128_000],
  [OPENAI, "o1", 100_000],
  [OPENAI, "o3", 100_000],
  [OPENAI, "o3-mini", 100_000],
  [OPENAI, "o4-mini-2025-04-16", 100_000],
  [OPENAI, "gpt-4.1", 32_768],
  [OPENAI, "gpt-4.1-nano", 32_768],
  [OPENAI, "gpt-4o", 16_384],
  [OPENAI, "gpt-4o-mini-2024-07-18", 16_384],
  [GEMINI, "gemini-3.8-flash", 65_536],
  [GEMINI, "gemini-3.1-pro-preview", 65_536],
  [GEMINI, "gemini-2.5-pro", 65_536],
  [GEMINI, "models/gemini-2.5-flash", 65_536],
  [GEMINI, "gemini-3.1-flash-image", 32_768],
  [GEMINI, "gemini-2.5-flash-image", 32_768],
  [GEMINI, "gemini-3-pro-image", 32_768],
  [GEMINI, "gemini-3.1-flash-lite-image", 4096],
  [DEEPSEEK, "deepseek-flash", 384_000],
  [DEEPSEEK, "deepseek-v4-pro", 384_000],
];

test("every sourced direct hosted model resolves to its documented output cap", async () => {
  for (const [route, model, max] of DIRECT_OUTPUT_CAPS) {
    expect((await directGeneration(route, model)).output.maxTokens, model).toEqual({ min: 1, max });
  }
});

// ── Direct xAI reasoning: the effort set each generation's model data documents ─────────────────────────────

const GROK_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

test("each grok generation resolves to its documented reasoning efforts, and an id with none documented has no control", async () => {
  // grok-4.5 to 4.7 list no `none`, so an explicit off clamps up; grok-4.3 lists `none` and can be switched off.
  for (const [model, mandatory] of [
    ["grok-4.7", true],
    ["grok-4.6", true],
    ["grok-4.5", true],
    ["grok-4.5-latest", true],
    ["grok-build-latest", true],
    ["grok-4.3", undefined],
    ["grok-4.3-latest", undefined],
  ] as const) {
    const { reasoning } = await directGeneration(XAI, model);
    expect(reasoning, model).toMatchObject({ mode: "effort", enabled: true, effortLevels: [...GROK_EFFORTS] });
    expect(reasoning.mandatory, model).toBe(mandatory);
  }
  for (const model of ["grok-4.20-0309-non-reasoning", "grok-4.20-non-reasoning", "grok-4.20-reasoning", "grok-build-0.1", "grok-code-fast-1"]) {
    expect((await directGeneration(XAI, model)).reasoning, model).toEqual({ mode: "none", enabled: false });
  }
});

// ── Direct Gemini: the Google family facts on the compatibility wire ────────────────────────────────────────
// The compatibility layer takes reasoning as `reasoning_effort` and has no budget field the openai-compatible
// transport sends, and its thought signatures ride tool calls rather than a replayed reasoning part. So a direct
// Gemini row gets the family's tools, Google's documented effort words, and no replay.

test("a models/gemini id on the direct route resolves to the Google family facts, spelled for the compatibility wire", async () => {
  for (const [model, mandatory, levels] of [
    ["models/gemini-3.8-flash", true, ["low", "medium", "high"]],
    ["models/gemini-2.5-pro", true, ["minimal", "low", "medium", "high"]],
    ["gemini-3.1-pro-preview", true, ["low", "medium", "high"]],
    ["models/gemini-2.5-flash", undefined, ["minimal", "low", "medium", "high"]],
    ["models/gemini-2.5-flash-lite", undefined, ["minimal", "low", "medium", "high"]],
  ] as const) {
    const generation = await directGeneration(GEMINI, model);
    expect(generation.tools, model).toMatchObject({ parallel: true });
    expect(generation.reasoning, model).toMatchObject({ mode: "effort", enabled: true, effortLevels: levels, replay: "none" });
    expect(generation.reasoning.mandatory, model).toBe(mandatory);
  }
});

test("Gemini explicit caching defaults off and a saved opt-in survives the real resolve", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const unset = fakeConnection({ ownerId, providerId: "openrouter", model: "google/gemini-3.1-pro-preview" });
  const optedIn = fakeConnection({ ownerId, providerId: "openrouter", model: "google/gemini-3.1-pro-preview", promptCache: SHIPPED_PROMPT_CACHE });
  stores.connections.rows.set(unset.id, unset);
  stores.connections.rows.set(optedIn.id, optedIn);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: openRouterCatalogFetch() }));
  const implicit = await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: unset.id });
  const explicit = await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: optedIn.id });
  expect(implicit.resolved.promptCache).toMatchObject({ enabled: false, ttl: "5m" });
  expect(implicit.resolved.capability).toMatchObject({ generation: { turns: { fixedCacheTtl: "5m", assistantPrefill: true } } });
  expect(explicit.resolved.promptCache.enabled).toBe(true);
});

// ── a local server's own model info reaches the fold as advertised evidence (D292) ───────────────────────
// The resolve runs the REAL endpoint reader over what the rig's Ollama answered (scripts/probes/local-servers),
// so the kind, the modalities and the tools fold exactly as they do against a live box.

async function ollamaResolved(model: string, task: "chat" | "embed"): Promise<Capability> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "ollama", model, baseUrl: "http://127.0.0.1:1/v1", allowBackground: true });
  stores.connections.rows.set(row.id, row);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: localServerFetch("ollama") }));
  return (await runtime.resolve({ task, principal: principal(ownerId), connectionId: row.id })).resolved.capability;
}

function generationOf(capability: Capability): GenerationCapability {
  if (capability.kind !== "generation") {
    throw new Error(`expected a generation capability, got ${capability.kind}`);
  }
  return capability.generation;
}

test("an Ollama tool model folds tools and text-only input from `/api/show`, and the posture keeps the stated list", async () => {
  const qwen = generationOf(await ollamaResolved("qwen2.5:0.5b", "chat"));
  expect(qwen).toMatchObject({ input: ["text"], tools: { parallel: false, silencesProse: true }, output: { structured: true } });
  expect(qwen.modalitiesEstimated).toBeUndefined();
  const moondream = generationOf(await ollamaResolved("moondream:latest", "chat"));
  expect(moondream.input).toEqual(["text", "image"]);
  expect(moondream.tools).toBeUndefined();
});

test("an untagged Ollama model id finds its `:latest` catalog entry, so the server's stated facts reach the fold", async () => {
  const bare = generationOf(await ollamaResolved("moondream", "chat"));
  const tagged = generationOf(await ollamaResolved("moondream:latest", "chat"));
  expect(bare.input).toEqual(["text", "image"]);
  expect(bare.modalitiesEstimated).toBeUndefined();
  expect(bare.context).toEqual(tagged.context);
});

test("an Ollama embedder resolves as an embedder from `/api/show` alone, with the width it states", async () => {
  await expect(ollamaResolved("nomic-embed-text:latest", "embed")).resolves.toMatchObject({ kind: "embedding", embedding: { dims: 768 } });
  // The kind is the server's statement, not the task's fallback: the same row cannot serve a chat turn.
  await expect(ollamaResolved("nomic-embed-text:latest", "chat")).rejects.toThrow(/cannot serve "chat"/u);
});

// PLANTED CONTROL: a server that states no modalities still gets the permissive posture (D143(c) as amended).
test("an id-only list states no modalities, so the posture still widens the row with modalitiesEstimated", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "custom-openai", model: "listed-model", baseUrl: "http://silent.test/v1" });
  stores.connections.rows.set(row.id, row);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: idOnlyModelList() }));
  const { capability } = (await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id })).resolved;
  expect(generationOf(capability)).toMatchObject({ input: ["text", "image", "video"], modalitiesEstimated: true });
});

// ── the endpoint mirror is per (URL × reader): one server, two users, two providers ──────────────────────
// A native reader states kind, modalities and tools the bare list lacks. If the mirror were keyed on the URL
// alone, whichever connection warmed first would decide what the other resolves to: a custom-openai row would
// inherit Ollama's text-only + tools, or an Ollama row the permissive guess D292 removes.

async function sharedServer(order: readonly ("ollama" | "custom-openai")[]): Promise<Record<string, GenerationCapability>> {
  const stores = memoryStores();
  const rows = order.map((providerId) => {
    const ownerId = newUserId();
    // moondream: no curated row matches it, so every stated fact below comes from the reader or the posture.
    const row = fakeConnection({ ownerId, providerId, model: "moondream:latest", baseUrl: "http://127.0.0.1:1/v1", allowBackground: true });
    stores.connections.rows.set(row.id, row);
    return { providerId, ownerId, row };
  });
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: localServerFetch("ollama") }));
  const out: Record<string, GenerationCapability> = {};
  for (const { providerId, ownerId, row } of rows) {
    out[providerId] = generationOf((await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id })).resolved.capability);
  }
  expect([...stores.snapshotStore.entries.keys()].filter((key) => key.startsWith("catalog:endpoint:")).sort()).toEqual(
    order.map((providerId) => `catalog:endpoint:http://127.0.0.1:1/v1#${providerId === "ollama" ? "ollama" : "list"}`).sort(),
  );
  return out;
}

for (const order of [
  ["ollama", "custom-openai"],
  ["custom-openai", "ollama"],
] as const) {
  test(`two users on one server resolve per their own provider's reader (warm order: ${order.join(" then ")})`, async () => {
    const out = await sharedServer(order);
    expect(out["ollama"]).toMatchObject({ input: ["text", "image"], output: { structured: true } });
    expect(out["ollama"]?.modalitiesEstimated).toBeUndefined();
    expect(out["ollama"]?.tools).toBeUndefined();
    expect(out["custom-openai"]).toMatchObject({ input: ["text", "image", "video"], modalitiesEstimated: true });
    expect(out["custom-openai"]?.tools).toBeUndefined();
    expect(out["custom-openai"]?.output.structured).toBeUndefined();
  });
}

test("a snapshot written under the old URL-only key carries no native facts and is never read again", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "ollama", model: "qwen2.5:0.5b", baseUrl: "http://127.0.0.1:1/v1" });
  stores.connections.rows.set(row.id, row);
  // The pre-upgrade shape: ids and windows only, persisted a moment ago under the old key.
  stores.snapshotStore.entries.set(
    "catalog:endpoint:http://127.0.0.1:1/v1",
    JSON.stringify({ fetchedAt: FROZEN_NOW, value: [{ id: "qwen2.5:0.5b", contextLength: 4096 }] }),
  );
  const seen: string[] = [];
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: localServerFetch("ollama", {}, seen) }));
  const capability = generationOf((await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id })).resolved.capability);
  expect(
    seen.some((url) => url.endsWith("/api/show")),
    "the reader dialed the server instead of trusting the old snapshot",
  ).toBe(true);
  expect(capability).toMatchObject({ input: ["text"], tools: { parallel: false } });
});

// ── invalidation outlives the process ────────────────────────────────────────────────────────────────────
// A mirror that only forgot its cache reads the persisted row back on the next cold warm, so a refresh in one
// process left the next process answering from the row the refresh meant to drop.

function countingFetch(seen: string[]): typeof fetch {
  return localServerFetch("ollama", {}, seen);
}

function showDials(seen: readonly string[]): number {
  return seen.filter((url) => url.endsWith("/api/show")).length;
}

test("a catalog refresh in one runtime drops the persisted snapshot, so a later runtime on the same store dials the server", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "ollama", model: "moondream:latest", baseUrl: "http://127.0.0.1:1/v1" });
  stores.connections.rows.set(row.id, row);
  const seenA: string[] = [];
  const runtimeA = await createInferenceRuntime(fakeDeps({ stores, fetch: countingFetch(seenA) }));
  await runtimeA.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id });
  expect(showDials(seenA)).toBeGreaterThan(0);
  expect([...stores.snapshotStore.entries.keys()]).toContain("catalog:endpoint:http://127.0.0.1:1/v1#ollama");

  // PLANTED CONTROL: a fresh runtime on the same store answers from the snapshot with zero dials.
  const seenB: string[] = [];
  const runtimeB = await createInferenceRuntime(fakeDeps({ stores, fetch: countingFetch(seenB) }));
  await runtimeB.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id });
  expect(showDials(seenB)).toBe(0);

  await runtimeB.catalogs.refresh("ollama");
  expect([...stores.snapshotStore.entries.keys()].filter((key) => key.startsWith("catalog:endpoint:"))).toEqual([]);
  const seenC: string[] = [];
  const runtimeC = await createInferenceRuntime(fakeDeps({ stores, fetch: countingFetch(seenC) }));
  await runtimeC.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id });
  expect(showDials(seenC)).toBeGreaterThan(0);
});

test("invalidateEndpoint forgets ONE connection's (URL × reader) mirror in memory and in the store, and leaves a sibling reader's", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const ollama = fakeConnection({ ownerId, providerId: "ollama", model: "moondream:latest", baseUrl: "http://127.0.0.1:1/v1" });
  const custom = fakeConnection({ ownerId, providerId: "custom-openai", model: "moondream:latest", baseUrl: "http://127.0.0.1:1/v1" });
  stores.connections.rows.set(ollama.id, ollama);
  stores.connections.rows.set(custom.id, custom);
  const seen: string[] = [];
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: countingFetch(seen) }));
  await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: ollama.id });
  await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: custom.id });
  const listDials = seen.filter((url) => url.endsWith("/v1/models")).length;
  const before = showDials(seen);
  await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: ollama.id });
  expect(showDials(seen), "a warm mirror answers without a dial").toBe(before);

  await runtime.catalogs.invalidateEndpoint(ollama);
  expect(stores.snapshotStore.entries.has("catalog:endpoint:http://127.0.0.1:1/v1#ollama")).toBe(false);
  expect(stores.snapshotStore.entries.has("catalog:endpoint:http://127.0.0.1:1/v1#list"), "the sibling reader's row stays").toBe(true);
  await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: ollama.id });
  expect(showDials(seen), "the forgotten mirror dials again").toBeGreaterThan(before);
  await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: custom.id });
  expect(seen.filter((url) => url.endsWith("/v1/models")).length - listDials, "the sibling's mirror was not touched: only the ollama re-warm listed").toBe(1);
});

test("two credentials on one authenticated gateway keep their own model lists, and one save forgets only its own", async () => {
  const stores = memoryStores();
  const credA = mintTypeId(ID_PREFIX.userCredential);
  const credB = mintTypeId(ID_PREFIX.userCredential);
  const ownerA = newUserId();
  const ownerB = newUserId();
  const base = { providerId: "custom-openai", model: "listed-model", baseUrl: "http://gateway.test/v1" } as const;
  const rowA = fakeConnection({ ...base, ownerId: ownerA, credentialId: credA });
  const rowB = fakeConnection({ ...base, ownerId: ownerB, credentialId: credB });
  stores.connections.rows.set(rowA.id, rowA);
  stores.connections.rows.set(rowB.id, rowB);
  const secrets = new Map([
    [credA, fakeApiKeySecret("key-a")],
    [credB, fakeApiKeySecret("key-b")],
  ]);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, secrets, fetch: idOnlyModelList() }));

  await runtime.resolve({ task: "chat", principal: principal(ownerA), connectionId: rowA.id });
  await runtime.resolve({ task: "chat", principal: principal(ownerB), connectionId: rowB.id });

  const gatewayKeys = (): string[] => [...stores.snapshotStore.entries.keys()].filter((key) => key.startsWith("catalog:endpoint:")).sort();
  expect(gatewayKeys()).toEqual([`catalog:endpoint:http://gateway.test/v1#@${credA}#list`, `catalog:endpoint:http://gateway.test/v1#@${credB}#list`].sort());
  await runtime.catalogs.invalidateEndpoint(rowA);
  expect(gatewayKeys()).toEqual([`catalog:endpoint:http://gateway.test/v1#@${credB}#list`]);
});
