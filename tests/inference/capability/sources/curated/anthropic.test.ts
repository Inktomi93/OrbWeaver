// capability/sources/curated/anthropic — the table pins over the Claude cells on the DIRECT wire, folded exactly
// as `resolve-task.ts` folds an `anthropic` row (curated rows → `synthesizeCapability`, no OR advertisement).
// The SDK's own capability table is the direct wire's truth (`@ai-sdk/anthropic/dist/index.js:5943-5963` —
// it strips before sending), and A8 was measured live (`req_011CfEBkabcoxXWyouHdYDxY`: fable + thinking disabled
// → 400). A6: the structured-output VEHICLE is `resolveVehicle` (role-clients.ts) — `auto` picks the enforcing
// `response-format` iff `output.structured === true`, else the forced tool Fable rejects; the input to that
// decision is what these cells must state.
//
// #2575: Opus 5.5 is its own row (mandatory thinking, default effort `medium` — under the opus-5 row alone a
// reasoning-off intent sent `thinking: disabled`, a 400 there), and the three models that 400 a forced
// `tool_choice` (Fable 5.1, Mythos 5.1, Opus 5.5) keep a deployment-forced structured call on `response-format`.

import type { Principal } from "@orb/contracts/identity";
import type { AgentSdkModel, GenerationCapability, ModelCatalogEntry, ProviderId } from "@orb/contracts/inference";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { StructuredOutputVehicle } from "@orb/contracts/role-clients";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import type { Mirror } from "../../../../../packages/inference/src/catalog/mirror.ts";
import { fetchOpenRouterCatalog } from "../../../../../packages/inference/src/catalog/openrouter.ts";
import type { ProviderExecutor } from "../../../../../packages/inference/src/contract/backend.ts";
import type { StructuredRequest } from "../../../../../packages/inference/src/contract/roles.ts";
import type { EndpointModel } from "../../../../../packages/inference/src/contract/runtime.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { createProviderRegistry } from "../../../../../packages/inference/src/registry/providers.ts";
import type { ResolverContext } from "../../../../../packages/inference/src/resolve/resolve-task.ts";
import { createRoleClientsFor } from "../../../../../packages/inference/src/roles/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { wireSchema } from "../../../../support/wire-ready.ts";
import { openRouterCatalogFetch } from "../../../_openrouter-catalog.ts";
import { fakeConnection, fakeDeps, newUserId } from "../../../_support.ts";

const DIRECT = { providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" } as const;

const FABLE_IDS = [
  { providerId: "anthropic", model: "claude-fable-5-1" },
  { providerId: "anthropic", model: "claude-fable-5" },
  { providerId: "openrouter", model: "anthropic/claude-fable-5-1" },
] as const;

function emptyMirror<T>(): Mirror<T> {
  return {
    get: () => null,
    warm: () => Promise.resolve(null),
    seed: () => undefined,
    invalidate: () => undefined,
  };
}

function fixedMirror<T>(value: T): Mirror<T> {
  return {
    get: () => value,
    warm: () => Promise.resolve(value),
    seed: () => undefined,
    invalidate: () => undefined,
  };
}

function capturingExecutor(calls: StructuredRequest[]): ProviderExecutor {
  const unexpected = <T>(): Promise<T> => Promise.reject(new Error("unexpected non-structured provider call"));
  return {
    runChatTurn: unexpected,
    runAgentTurn: unexpected,
    embed: unexpected,
    rerank: unexpected,
    imageEmbed: unexpected,
    summarize: unexpected,
    structured: (request): Promise<SummarizeResult> => {
      calls.push(request);
      return Promise.resolve({ items: [], model: request.connection.model });
    },
    generateImage: unexpected,
  };
}

async function selectedStructuredVehicle(
  providerId: string,
  model: string,
  deployment: StructuredOutputVehicle = "auto",
  catalog: readonly ModelCatalogEntry[] | null = null,
): Promise<string | undefined> {
  const deps = { ...fakeDeps(), structuredOutputVehicle: (): StructuredOutputVehicle => deployment };
  const ownerId = newUserId();
  const connection = fakeConnection({ ownerId, providerId, model, allowBackground: true });
  deps.stores.connections.rows.set(connection.id, connection);
  deps.stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "summarize", connectionId: connection.id });

  const ctx: ResolverContext = {
    deps,
    registry: await createProviderRegistry(deps.providerStore),
    openRouterCatalog: catalog === null ? emptyMirror<ModelCatalogEntry[]>() : fixedMirror([...catalog]),
    endpointModels: () => emptyMirror<EndpointModel[]>(),
    agentSdkCatalog: emptyMirror<AgentSdkModel[]>(),
    warmOpenRouter: () => Promise.resolve(),
    warmEndpoint: () => Promise.resolve(),
    warmAgentSdk: () => Promise.resolve(),
  };
  const principal: Principal = { userId: ownerId, role: "owner", handle: castId<Handle>("owner"), externalId: null, via: "fallback" };
  const calls: StructuredRequest[] = [];
  const clients = createRoleClientsFor({ deps, ctx, executor: capturingExecutor(calls) })(principal);
  await clients.structured([{ systemPrompt: "Return the payload.", userPrompt: "One row." }], {
    responseFormat: { name: "row", schema: wireSchema({ type: "object", properties: {}, additionalProperties: false }) },
  });
  expect(calls, `${providerId} · ${model}`).toHaveLength(1);
  return calls[0]?.responseFormat.vehicle;
}

function direct(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...DIRECT }) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

/** The ids the SDK table marks `rejectsSamplingParameters: true` (+ `supportsAdaptiveThinking`, `supportsXhighEffort`). */
const REJECTS_SAMPLING = ["claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5-1", "claude-fable-5", "claude-mythos-5", "claude-sonnet-5"];

test("B3 (direct): every SDK-table id states an EMPTY sampling set on the direct wire; a preset knob drops loudly", () => {
  for (const model of REJECTS_SAMPLING) {
    const gen = direct(model);
    // The `exclusive` pair is a RESTRICTION with no ranges — the stated set carries no knob at all.
    expect(gen.sampling.temperature, model).toBeUndefined();
    expect(gen.sampling.topP, model).toBeUndefined();
    expect(
      resolveChat({ temperature: 0.7 }, gen).warnings.map((w) => w.code),
      model,
    ).toContain("sampling_knob_dropped");
  }
});

test("opus-5 has a curated cell now: adaptive reasoning with the full effort ladder (it resolved as non-reasoning before 2026-09-20)", () => {
  const gen = direct("claude-opus-5");
  expect(gen.reasoning).toMatchObject({ mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] });
  expect(gen.reasoning.mandatory).toBeUndefined();
  expect(gen.context).toMatchObject({ window: 200_000, supports1M: true });
  // PLANTED CONTROL for the regex: `opus-5` must not swallow the 4.x opus ids (their cells differ).
  expect(direct("claude-opus-4-5-20251101").reasoning.mode).toBe("effort");
  expect(direct("claude-opus-4-8").reasoning.mode).toBe("adaptive");
});

test("A8: fable / mythos are MANDATORY — effort `none` or absent resolves enabled at the lowest level with reasoning_mandatory_clamp", () => {
  for (const model of ["claude-fable-5-1", "claude-fable-5", "claude-mythos-5"]) {
    const gen = direct(model);
    expect(gen.reasoning.mandatory, model).toBe(true);
    const off = resolveChat({ effort: "none" }, gen);
    expect(off.reasoning, model).toMatchObject({ mode: "adaptive", enabled: true, effort: "low" });
    expect(
      off.warnings.map((w) => [w.code, w.appliedEffort]),
      model,
    ).toEqual([["reasoning_mandatory_clamp", "low"]]);
    const unset = resolveChat({}, gen);
    expect(unset.reasoning.enabled, model).toBe(true);
    // An explicit level is honoured untouched.
    expect(resolveChat({ effort: "high" }, gen).reasoning, model).toMatchObject({ enabled: true, effort: "high" });
  }
  // PLANTED CONTROL: a non-mandatory adaptive cell still turns thinking OFF for effort `none`.
  expect(resolveChat({ effort: "none" }, direct("claude-opus-5")).reasoning.enabled).toBe(false);
});

test("A6: every SDK-table id (and the 4.5 generation) states output.structured — the vehicle input that keeps Fable off the forced tool", () => {
  for (const model of [...REJECTS_SAMPLING, "claude-opus-4-5-20251101", "claude-haiku-4-5"]) {
    expect(direct(model).output.structured, model).toBe(true);
  }
});

test("A6: every supported Fable id sends an auto structured call through response-format, never forced-tool", async () => {
  for (const { providerId, model } of FABLE_IDS) {
    await expect(selectedStructuredVehicle(providerId, model), `${providerId} · ${model}`).resolves.toBe("response-format");
  }
});

test("sonnet 4.5 / 4.6 keep the shared sonnet reasoning cell without the sonnet-5 empty-sampling row (the SDK table accepts sampling there)", () => {
  const rows46 = curatedRows({ model: "claude-sonnet-4-6", ...DIRECT });
  expect(rows46.some((row) => row.match?.model === "^(anthropic/)?claude[-/].*sonnet-5")).toBe(false);
  expect(curatedRows({ model: "claude-sonnet-5", ...DIRECT }).some((row) => row.match?.model === "^(anthropic/)?claude[-/].*sonnet-5")).toBe(true);
  expect(direct("claude-sonnet-4-6").reasoning.mode).toBe("effort");
});

/** The ids Anthropic documents as rejecting a forced `tool_choice` (`any` / `tool` → 400 `tool_choice: type "tool"
 *  and "any" are not supported for this model`, on Messages, Batches and count_tokens). Fable 5 and Opus 5 accept it. */
const REJECTS_FORCED_TOOL = [
  { providerId: "anthropic", model: "claude-fable-5-1" },
  { providerId: "anthropic", model: "claude-mythos-5-1" },
  { providerId: "anthropic", model: "claude-opus-5-5" },
] as const;

test("#2575: Opus 5.5 is MANDATORY — reasoning off resolves enabled at the lowest level, and the unset default is the house `high`", () => {
  const gen = direct("claude-opus-5-5");
  expect(gen.reasoning).toMatchObject({ mode: "adaptive", enabled: true, mandatory: true });
  const off = resolveChat({ effort: "none" }, gen);
  expect(off.reasoning).toMatchObject({ enabled: true, effort: "low" });
  expect(off.warnings.map((w) => [w.code, w.appliedEffort])).toEqual([["reasoning_mandatory_clamp", "low"]]);
  // No explicit effort and no quality ⇒ the house default, with no clamp to report.
  const unset = resolveChat({}, gen);
  expect(unset.reasoning).toMatchObject({ enabled: true, effort: "high" });
  expect(unset.warnings).toEqual([]);
  // The opus-5 facts it shares still reach it (the 5.5 row refines, never replaces).
  expect(gen.sampling.temperature).toBeUndefined();
  expect(gen.context).toMatchObject({ supports1M: true });
  // PLANTED CONTROL: Opus 5 itself stays switchable — effort `none` still turns thinking OFF there.
  expect(resolveChat({ effort: "none" }, direct("claude-opus-5")).reasoning.enabled).toBe(false);
});

const AGENT_SDK_ROUTE = { providerId: castId<ProviderId>("claude-sub"), wire: "agent-sdk", api: "agent-sdk" } as const;

// Owner ruling: no effort set ⇒ adaptive thinking at `high` wherever the model supports adaptive thinking. The
// matrix measured the same preset sending thinking disabled on direct opus-5 and opus-4-8
// (req_011CfKgrsFJ9ypUKNm5nkoM3, req_011CfKhGDcJ7WwS7aovrVdrd), the mandatory clamp's `low` on direct fable
// (req_011CfKh2z379oimcJwSMD7tv) and `medium` on direct opus-5-5 (req_011CfKgwSXtiHfLLnEeLzaST).
test("no effort set ⇒ adaptive thinking at high on the direct and agent-sdk routes for every adaptive Claude id", () => {
  for (const model of ["claude-opus-5", "claude-opus-5-5", "claude-opus-4-8", "claude-fable-5", "claude-fable-5-1"]) {
    for (const route of [DIRECT, AGENT_SDK_ROUTE]) {
      const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...route }) });
      if (out.capability.kind !== "generation") {
        throw new Error("expected a generation capability");
      }
      const knobs = resolveChat({}, out.capability.generation);
      expect(knobs.reasoning, `${route.wire} ${model}`).toMatchObject({ mode: "adaptive", enabled: true, effort: "high" });
      expect(knobs.warnings, `${route.wire} ${model}`).toEqual([]);
    }
  }
});

test("#2575: a deployment-forced structured call on a forced-tool-rejecting model rides response-format instead", async () => {
  for (const { providerId, model } of REJECTS_FORCED_TOOL) {
    await expect(selectedStructuredVehicle(providerId, model, "forced-tool"), `${providerId} · ${model}`).resolves.toBe("response-format");
  }
  // PLANTED CONTROL: the models that ACCEPT a forced tool keep the deployment's explicit choice untouched.
  for (const model of ["claude-opus-5", "claude-fable-5", "claude-mythos-5"]) {
    await expect(selectedStructuredVehicle("anthropic", model, "forced-tool"), model).resolves.toBe("forced-tool");
  }
});

test("#2575: the forced-tool refusal holds on the OpenRouter route WITH a live-shaped catalog advertising tools", async () => {
  const catalog = await fetchOpenRouterCatalog({ fetch: openRouterCatalogFetch(), baseUrl: "https://openrouter.example/api/v1" });
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-fable-5.1:batch", "anthropic/claude-opus-5.5", "~anthropic/claude-fable-latest"]) {
    await expect(selectedStructuredVehicle("openrouter", model, "forced-tool", catalog), model).resolves.toBe("response-format");
  }
  // PLANTED CONTROL: Opus 5 on the same route keeps the deployment's forced tool.
  await expect(selectedStructuredVehicle("openrouter", "anthropic/claude-opus-5", "forced-tool", catalog)).resolves.toBe("forced-tool");
});

const OPENROUTER = { providerId: castId<ProviderId>("openrouter"), wire: "openai-compat", api: "chat-completions" } as const;

function viaOpenRouter(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...OPENROUTER }) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

// A continue by prefill sends the finished reply as a trailing assistant row, and the 4.5 Claude ids answer it
// with three tokens of nothing, so orb raised `empty_generation` on every continue: OpenRouter haiku-4.5 3/3
// (gen-1790136293-3HzFJAEZLWdWhVIMTuaj, gen-1790137541-jdHgdXhju27JwK4tK9XH, gen-1790137552-8L83X2LFGBxR3JUcK918),
// and on the same body OpenRouter opus-4.5 (gen-1790141538-eBRpWlikU1TqDrHB1EWH, gen-1790141540-B9bltq0wuWN94AjGl7VH)
// and direct haiku-4-5 (req_011CfKpkas4tLck9X6hodkK7, req_011CfKpkkjtZhF2cGfwxDHav). Without prefill, continue
// sends its own user cue and the model writes more.
test("no Claude route claims assistant prefill: a continue by prefill returns nothing on the 4.5 ids", () => {
  for (const model of ["anthropic/claude-haiku-4.5", "anthropic/claude-opus-4.5", "anthropic/claude-sonnet-5", "anthropic/claude-opus-5.5"]) {
    expect(viaOpenRouter(model).turns?.assistantPrefill, model).toBe(false);
  }
  for (const model of ["claude-haiku-4-5", "claude-opus-4-5-20251101"]) {
    expect(direct(model).turns?.assistantPrefill, model).toBe(false);
  }
});
