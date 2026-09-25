// Resolver behavior not owned by the broad runtime smoke: actor ridesOn precedence, explicit-row selection,
// missing-provider refusal, the prompt-cache settings fold, and which id the capability rows read on the
// OpenRouter route — all through the real runtime fold.

import type { GenerationCapability } from "@orb/contracts/inference";
import { GENERATION_FLOOR, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { createInferenceRuntime, DEFAULT_EMBED_MODEL, NoConnectionError } from "@orb/inference";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { openRouterCatalogFetch } from "../_openrouter-catalog.ts";
import { fakeConnection, fakeDeps, memoryStores, newRuleId, newUserId } from "../_support.ts";

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
  for (const [model, mandatory] of [
    ["models/gemini-3.8-flash", true],
    ["models/gemini-2.5-pro", true],
    ["gemini-3.1-pro-preview", true],
    ["models/gemini-2.5-flash", undefined],
    ["models/gemini-2.5-flash-lite", undefined],
  ] as const) {
    const generation = await directGeneration(GEMINI, model);
    expect(generation.tools, model).toMatchObject({ parallel: true });
    expect(generation.reasoning, model).toMatchObject({ mode: "effort", enabled: true, effortLevels: ["minimal", "low", "medium", "high"], replay: "none" });
    expect(generation.reasoning.mandatory, model).toBe(mandatory);
  }
});
